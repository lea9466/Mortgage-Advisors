import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getStorageByName } from "@/lib/storage";
import { STORAGE_PROVIDER_NAMES } from "@/lib/storage/types";
import { DOCUMENT_CATEGORIES } from "@/lib/validation/document";
import { MORTGAGE_PURPOSES } from "@/lib/validation/case";

const caseInfo = z.object({ id: z.uuid(), case_year: z.number().int(), case_seq: z.number().int(), purpose: z.enum(MORTGAGE_PURPOSES) });
const fileInfo = z.object({ content_type: z.string(), size_bytes: z.number().int() });
const one = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.array(schema).length(1).transform((items) => items[0] as z.infer<T>)]);

const trashRow = z.object({
  id: z.uuid(),
  title: z.string(),
  category: z.enum(DOCUMENT_CATEGORIES),
  deleted_at: z.string(),
  cases: one(caseInfo),
  files: one(fileInfo),
});
export type TrashedDocument = z.infer<typeof trashRow>;

/** Documents in the recycle bin, newest removal first, optionally for one case. */
export async function listTrash(supabase: SupabaseClient, organizationId: string, caseId?: string): Promise<TrashedDocument[]> {
  let request = supabase
    .from("case_documents")
    .select("id, title, category, deleted_at, cases(id, case_year, case_seq, purpose), files(content_type, size_bytes)")
    .eq("organization_id", organizationId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(500);
  if (caseId) request = request.eq("case_id", caseId);
  const { data, error } = await request;
  if (error) throw new Error(`trash read failed: ${error.code}`);
  return z.array(trashRow).parse(data ?? []);
}

/** How many documents of one case are in the bin, for the note in the documents tab. */
export async function countTrashForCase(supabase: SupabaseClient, organizationId: string, caseId: string): Promise<number> {
  const { data, error } = await supabase
    .from("case_documents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("case_id", caseId)
    .not("deleted_at", "is", null)
    .limit(500);
  if (error) throw new Error(`trash count failed: ${error.code}`);
  return (data ?? []).length;
}

const binned = z.object({
  id: z.uuid(),
  case_id: z.uuid(),
  title: z.string(),
  file_id: z.uuid(),
  files: one(z.object({ storage_provider: z.enum(STORAGE_PROVIDER_NAMES), storage_key: z.string() })),
});

async function getBinned(supabase: SupabaseClient, organizationId: string, documentId: string) {
  const { data, error } = await supabase
    .from("case_documents")
    .select("id, case_id, title, file_id, files(storage_provider, storage_key)")
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .not("deleted_at", "is", null)
    .maybeSingle();
  if (error) throw new Error(`binned read failed: ${error.code}`);
  return data ? binned.parse(data) : null;
}

/** Puts a document back in its case. Returns the case and title, or null if it was not in the bin. */
export async function restoreDocument(supabase: SupabaseClient, organizationId: string, documentId: string) {
  const document = await getBinned(supabase, organizationId, documentId);
  if (!document) return null;
  const { error } = await supabase
    .from("case_documents")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", document.id)
    .eq("organization_id", organizationId);
  if (error) throw new Error(`restore failed: ${error.code}`);
  const { error: fileError } = await supabase.from("files").update({ deleted_at: null }).eq("id", document.file_id).eq("organization_id", organizationId);
  if (fileError) throw new Error(`file restore failed: ${fileError.code}`);
  return { caseId: document.case_id, title: document.title };
}

/**
 * Deletes a binned document for good: first the stored object, then its rows.
 * Deleting an object that is already gone is not an error, so a failed attempt
 * can simply be repeated. Returns the case and title, or null if not in the bin.
 */
export async function deleteDocumentPermanently(supabase: SupabaseClient, organizationId: string, documentId: string) {
  const document = await getBinned(supabase, organizationId, documentId);
  if (!document) return null;

  await getStorageByName(document.files.storage_provider).delete(document.files.storage_key);

  // Documents removed before the bin existed have no deleted_at on their file yet; the delete policy needs it.
  const { error: markError } = await supabase
    .from("files")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", document.file_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (markError) throw new Error(`file mark failed: ${markError.code}`);

  const { error } = await supabase.from("case_documents").delete().eq("id", document.id).eq("organization_id", organizationId);
  if (error) throw new Error(`document delete failed: ${error.code}`);
  const { error: fileError } = await supabase.from("files").delete().eq("id", document.file_id).eq("organization_id", organizationId);
  if (fileError) throw new Error(`file delete failed: ${fileError.code}`);
  return { caseId: document.case_id, title: document.title };
}
