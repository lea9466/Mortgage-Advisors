import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { buildStorageKey, getStorage, getStorageByName, MAX_FILE_BYTES } from "@/lib/storage";
import { STORAGE_PROVIDER_NAMES } from "@/lib/storage/types";
import { DOCUMENT_CATEGORIES, SENSITIVE_CATEGORIES, type DocumentCategory } from "@/lib/validation/document";

export const MAX_MERGE_DOCUMENTS = 30;
const MAX_MERGE_INPUT_BYTES = 100 * 1024 * 1024;
/** A4 in PDF points, with a margin around pictures. */
const A4 = { width: 595.28, height: 841.89 };
const IMAGE_MARGIN = 24;

type Context = { organizationId: string; userId: string };

export class PdfToolError extends Error {
  constructor(readonly reason: "not-found" | "not-mergeable" | "encrypted" | "unreadable" | "too-large" | "too-many") {
    super(`pdf tool refused: ${reason}`);
    this.name = "PdfToolError";
  }
}

const sourceFile = z.object({ storage_provider: z.enum(STORAGE_PROVIDER_NAMES), storage_key: z.string(), content_type: z.string(), size_bytes: z.number().int() });
const sourceRow = z.object({
  id: z.uuid(),
  title: z.string(),
  category: z.enum(DOCUMENT_CATEGORIES),
  client_id: z.uuid().nullable(),
  files: z.union([sourceFile, z.array(sourceFile).length(1).transform((items) => items[0] as z.infer<typeof sourceFile>)]),
});

const MERGEABLE = new Set(["application/pdf", "image/jpeg", "image/png"]);

/** Adds one picture as its own A4 page, upright or sideways to match the picture, scaled to fit. */
async function addImagePage(output: PDFDocument, bytes: Uint8Array, contentType: string) {
  const image = contentType === "image/png" ? await output.embedPng(bytes) : await output.embedJpg(bytes);
  const landscape = image.width > image.height;
  const page = output.addPage(landscape ? [A4.height, A4.width] : [A4.width, A4.height]);
  const box = { width: page.getWidth() - IMAGE_MARGIN * 2, height: page.getHeight() - IMAGE_MARGIN * 2 };
  const scale = Math.min(box.width / image.width, box.height / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
}

export type MergePart = { bytes: Uint8Array; contentType: string };

/** Builds one PDF from PDFs and pictures, in order. Pure: no storage, no database. */
export async function buildMergedPdf(parts: MergePart[], title: string): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  for (const part of parts) {
    if (part.contentType === "application/pdf") {
      let pdf: PDFDocument;
      try {
        pdf = await PDFDocument.load(part.bytes);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "";
        throw new PdfToolError(/encrypt/i.test(message) ? "encrypted" : "unreadable");
      }
      const pages = await output.copyPages(pdf, pdf.getPageIndices());
      for (const page of pages) output.addPage(page);
    } else if (part.contentType === "image/jpeg" || part.contentType === "image/png") {
      try {
        await addImagePage(output, part.bytes, part.contentType);
      } catch {
        throw new PdfToolError("unreadable");
      }
    } else {
      throw new PdfToolError("not-mergeable");
    }
  }
  output.setTitle(title);
  output.setProducer("מערכת המשכנתאות");
  const merged = await output.save();
  if (merged.length > MAX_FILE_BYTES) throw new PdfToolError("too-large");
  return merged;
}

/**
 * Merges documents of a case, in the given order, into one new PDF document.
 * PDF pages are copied as they are; each picture becomes an A4 page. The
 * sources are left untouched. Returns the new document id.
 */
export async function mergeDocuments(
  supabase: SupabaseClient,
  context: Context,
  caseId: string,
  input: { documentIds: string[]; title: string; category: DocumentCategory },
): Promise<string> {
  if (input.documentIds.length === 0 || input.documentIds.length > MAX_MERGE_DOCUMENTS) throw new PdfToolError("too-many");

  const { data, error } = await supabase
    .from("case_documents")
    .select("id, title, category, client_id, files(storage_provider, storage_key, content_type, size_bytes)")
    .eq("organization_id", context.organizationId)
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .in("id", input.documentIds);
  if (error) throw new Error(`merge sources failed: ${error.code}`);
  const rows = z.array(sourceRow).parse(data ?? []);
  const sources = input.documentIds.map((id) => rows.find((row) => row.id === id));
  if (sources.some((source) => !source)) throw new PdfToolError("not-found");
  const ordered = sources as z.infer<typeof sourceRow>[];
  if (ordered.some((source) => !MERGEABLE.has(source.files.content_type))) throw new PdfToolError("not-mergeable");
  if (ordered.reduce((sum, source) => sum + source.files.size_bytes, 0) > MAX_MERGE_INPUT_BYTES) throw new PdfToolError("too-large");

  const parts: MergePart[] = [];
  for (const source of ordered) {
    parts.push({
      bytes: await getStorageByName(source.files.storage_provider).get(source.files.storage_key),
      contentType: source.files.content_type,
    });
  }
  const merged = await buildMergedPdf(parts, input.title);

  // The result belongs to a borrower only when every source belongs to the same one.
  const owners = new Set(ordered.map((source) => source.client_id));
  const clientId = owners.size === 1 ? (ordered[0]?.client_id ?? null) : null;
  const sensitive = SENSITIVE_CATEGORIES.includes(input.category) || ordered.some((source) => SENSITIVE_CATEGORIES.includes(source.category));

  return saveNewPdf(supabase, context, caseId, merged, {
    title: input.title,
    category: input.category,
    clientId,
    sensitive,
    parentDocumentId: ordered[0]?.id ?? null,
  });
}

/** Stores a PDF the app produced and adds it to the case as a new document. */
export async function saveNewPdf(
  supabase: SupabaseClient,
  context: Context,
  caseId: string,
  bytes: Uint8Array,
  meta: { title: string; category: DocumentCategory; clientId: string | null; sensitive: boolean; parentDocumentId: string | null },
): Promise<string> {
  const storage = getStorage();
  const key = buildStorageKey(context.organizationId);
  await storage.put(key, bytes, { contentType: "application/pdf" });

  const { data: file, error: fileError } = await supabase
    .from("files")
    .insert({
      organization_id: context.organizationId,
      storage_provider: storage.name,
      storage_key: key,
      original_name: `${meta.title.slice(0, 250)}.pdf`,
      content_type: "application/pdf",
      size_bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      is_sensitive: meta.sensitive,
      uploaded_by: context.userId,
    })
    .select("id")
    .single();
  if (fileError || !file) {
    await storage.delete(key);
    throw new Error(`file insert failed: ${fileError?.code ?? "no row"}`);
  }

  const { data: document, error: documentError } = await supabase
    .from("case_documents")
    .insert({
      organization_id: context.organizationId,
      case_id: caseId,
      file_id: z.object({ id: z.uuid() }).parse(file).id,
      client_id: meta.clientId,
      category: meta.category,
      title: meta.title,
      parent_document_id: meta.parentDocumentId,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (documentError || !document) throw new Error(`document insert failed: ${documentError?.code ?? "no row"}`);
  return z.object({ id: z.uuid() }).parse(document).id;
}
