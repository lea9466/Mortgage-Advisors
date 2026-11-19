import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireEnv } from "@/lib/env";
import { buildStorageKey, getStorage, getStorageByName, validateFile } from "@/lib/storage";
import { keyBelongsToOrganization } from "@/lib/storage/keys";
import { STORAGE_PROVIDER_NAMES, StorageNotFoundError, type StorageProviderName } from "@/lib/storage/types";
import {
  DOCUMENT_CATEGORIES,
  SENSITIVE_CATEGORIES,
  type DocumentCategory,
} from "@/lib/validation/document";

const UPLOAD_LINK_SECONDS = 10 * 60;
const TOKEN_SECONDS = 30 * 60;

type Context = { organizationId: string; userId: string };

const intentSchema = z.object({
  v: z.literal(1),
  org: z.uuid(),
  caseId: z.uuid(),
  key: z.string(),
  provider: z.enum(STORAGE_PROVIDER_NAMES),
  contentType: z.string(),
  fileName: z.string(),
  exp: z.number().int(),
});
type UploadIntent = z.infer<typeof intentSchema>;

export class UploadRejectedError extends Error {
  constructor(readonly reason: "expired" | "missing" | "not-allowed" | "too-large" | "empty" | "invalid") {
    super(`upload rejected: ${reason}`);
    this.name = "UploadRejectedError";
  }
}

/** A key only for signing upload intents, derived from the field encryption key. */
function intentKey(): Buffer {
  return createHmac("sha256", Buffer.from(requireEnv("FIELD_ENCRYPTION_KEY"), "base64")).update("upload-intent-v1").digest();
}

/** Exported for tests; the app only signs inside startUpload. */
export function signIntent(intent: UploadIntent): string {
  const payload = Buffer.from(JSON.stringify(intent)).toString("base64url");
  const signature = createHmac("sha256", intentKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** Reads back an intent this server signed; anything altered, foreign or expired is refused. */
export function readIntent(token: string, organizationId: string, caseId: string, now = Date.now()): UploadIntent {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new UploadRejectedError("invalid");
  const expected = createHmac("sha256", intentKey()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new UploadRejectedError("invalid");

  const parsed = intentSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  if (!parsed.success) throw new UploadRejectedError("invalid");
  const intent = parsed.data;
  if (intent.org !== organizationId || intent.caseId !== caseId || !keyBelongsToOrganization(intent.key, organizationId)) {
    throw new UploadRejectedError("invalid");
  }
  if (intent.exp < Math.floor(now / 1000)) throw new UploadRejectedError("expired");
  return intent;
}

/** Step 1: a one-time link to upload one file straight to the store, and a signed token describing it. */
export async function startUpload(
  supabase: SupabaseClient,
  organizationId: string,
  caseId: string,
  file: { fileName: string; contentType: string },
) {
  const { data, error } = await supabase.from("cases").select("id").eq("id", caseId).eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error(`case check failed: ${error.code}`);
  if (!data) throw new UploadRejectedError("invalid");

  const storage = getStorage();
  const key = buildStorageKey(organizationId);
  const upload = await storage.getSignedUploadUrl(key, { contentType: file.contentType, expiresInSeconds: UPLOAD_LINK_SECONDS });
  const token = signIntent({
    v: 1,
    org: organizationId,
    caseId,
    key,
    provider: storage.name,
    contentType: file.contentType,
    fileName: file.fileName,
    exp: Math.floor(Date.now() / 1000) + TOKEN_SECONDS,
  });
  return { ...upload, token };
}

/**
 * Step 3, after the browser uploaded: read the object back, check its real type
 * and size, and only then register it in the case. A rejected file is deleted.
 */
export async function finishUpload(
  supabase: SupabaseClient,
  context: Context,
  caseId: string,
  input: { token: string; title: string; category: DocumentCategory; clientId?: string },
): Promise<string> {
  const intent = readIntent(input.token, context.organizationId, caseId);
  const storage = getStorageByName(intent.provider as StorageProviderName);

  let body: Uint8Array;
  try {
    body = await storage.get(intent.key);
  } catch (error) {
    if (error instanceof StorageNotFoundError) throw new UploadRejectedError("missing");
    throw error;
  }

  const check = validateFile(body, intent.contentType);
  if (!check.ok) {
    await storage.delete(intent.key);
    throw new UploadRejectedError(check.reason === "too-large" ? "too-large" : check.reason === "empty" ? "empty" : "not-allowed");
  }

  const { data: file, error: fileError } = await supabase
    .from("files")
    .insert({
      organization_id: context.organizationId,
      storage_provider: intent.provider,
      storage_key: intent.key,
      original_name: intent.fileName.slice(0, 255),
      content_type: check.contentType,
      size_bytes: body.length,
      sha256: createHash("sha256").update(body).digest("hex"),
      is_sensitive: SENSITIVE_CATEGORIES.includes(input.category),
      uploaded_by: context.userId,
    })
    .select("id")
    .single();
  // 23505: this upload was already registered (the same token used twice).
  if (fileError?.code === "23505") throw new UploadRejectedError("invalid");
  if (fileError || !file) {
    await storage.delete(intent.key);
    throw new Error(`file insert failed: ${fileError?.code ?? "no row"}`);
  }
  const fileId = z.object({ id: z.uuid() }).parse(file).id;

  const { data: document, error: documentError } = await supabase
    .from("case_documents")
    .insert({
      organization_id: context.organizationId,
      case_id: caseId,
      file_id: fileId,
      client_id: input.clientId ?? null,
      category: input.category,
      title: input.title,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (documentError || !document) throw new Error(`document insert failed: ${documentError?.code ?? "no row"}`);
  return z.object({ id: z.uuid() }).parse(document).id;
}

const fileInfo = z.object({ content_type: z.string(), size_bytes: z.number().int(), is_sensitive: z.boolean() });
const documentRow = z.object({
  id: z.uuid(),
  title: z.string(),
  category: z.enum(DOCUMENT_CATEGORIES),
  client_id: z.uuid().nullable(),
  created_at: z.string(),
  files: z.union([fileInfo, z.array(fileInfo).length(1).transform((items) => items[0] as z.infer<typeof fileInfo>)]),
});
export type CaseDocument = z.infer<typeof documentRow>;

/** The visible documents of a case, newest first. */
export async function listDocuments(supabase: SupabaseClient, organizationId: string, caseId: string): Promise<CaseDocument[]> {
  const { data, error } = await supabase
    .from("case_documents")
    .select("id, title, category, client_id, created_at, files(content_type, size_bytes, is_sensitive)")
    .eq("organization_id", organizationId)
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`documents read failed: ${error.code}`);
  return z.array(documentRow).parse(data ?? []);
}

const storedFile = z.object({
  storage_provider: z.enum(STORAGE_PROVIDER_NAMES),
  storage_key: z.string(),
  content_type: z.string(),
});

/** What is needed to send one document to the browser, or null when it is not visible to this account. */
export async function getDocumentFile(supabase: SupabaseClient, organizationId: string, documentId: string) {
  const { data, error } = await supabase
    .from("case_documents")
    .select("id, case_id, title, files(storage_provider, storage_key, content_type)")
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`document read failed: ${error.code}`);
  if (!data) return null;
  return z
    .object({
      id: z.uuid(),
      case_id: z.uuid(),
      title: z.string(),
      files: z.union([storedFile, z.array(storedFile).length(1).transform((items) => items[0] as z.infer<typeof storedFile>)]),
    })
    .parse(data);
}

export async function updateDocument(
  supabase: SupabaseClient,
  organizationId: string,
  caseId: string,
  documentId: string,
  input: { title: string; category: DocumentCategory; clientId?: string },
) {
  const { data, error } = await supabase
    .from("case_documents")
    .update({ title: input.title, category: input.category, client_id: input.clientId ?? null })
    .eq("id", documentId)
    .eq("case_id", caseId)
    .eq("organization_id", organizationId)
    .select("file_id")
    .maybeSingle();
  if (error) throw new Error(`document update failed: ${error.code}`);
  if (!data) return;
  // Moving a document into or out of "medical" changes whether its file is sensitive.
  const fileId = z.object({ file_id: z.uuid() }).parse(data).file_id;
  const { error: fileError } = await supabase
    .from("files")
    .update({ is_sensitive: SENSITIVE_CATEGORIES.includes(input.category) })
    .eq("id", fileId)
    .eq("organization_id", organizationId);
  if (fileError) throw new Error(`file update failed: ${fileError.code}`);
}

/** Hides a document from the case. The file itself is kept. */
export async function hideDocument(supabase: SupabaseClient, organizationId: string, caseId: string, documentId: string) {
  const { error } = await supabase
    .from("case_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("case_id", caseId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(`document hide failed: ${error.code}`);
}
