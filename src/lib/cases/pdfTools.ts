import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { degrees, PDFDocument, type PDFImage, type PDFPage } from "pdf-lib";
import { z } from "zod";
import { buildStorageKey, getStorage, getStorageByName, MAX_FILE_BYTES } from "@/lib/storage";
import { STORAGE_PROVIDER_NAMES } from "@/lib/storage/types";
import { DOCUMENT_CATEGORIES, SENSITIVE_CATEGORIES, type ComposeInput, type DocumentCategory, type PageRotation } from "@/lib/validation/document";

const MAX_INPUT_BYTES = 100 * 1024 * 1024;
/** A4 in PDF points, with a margin around pictures. */
const A4 = { width: 595.28, height: 841.89 };
const IMAGE_MARGIN = 24;

type Context = { organizationId: string; userId: string };

export class PdfToolError extends Error {
  constructor(readonly reason: "not-found" | "not-mergeable" | "encrypted" | "unreadable" | "bad-page" | "too-large") {
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

/** Adds a picture as its own A4 page, upright or sideways to match the picture, enlarged or shrunk to fill it. */
function addImagePage(output: PDFDocument, image: PDFImage): PDFPage {
  const landscape = image.width > image.height;
  const page = output.addPage(landscape ? [A4.height, A4.width] : [A4.width, A4.height]);
  const box = { width: page.getWidth() - IMAGE_MARGIN * 2, height: page.getHeight() - IMAGE_MARGIN * 2 };
  // Every picture fills the page up to the margin, so pages of the same direction come out the same size.
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
  return page;
}

export type ComposeSource = { bytes: Uint8Array; contentType: string };
export type ComposePage = { source: string; page: number; rotation: PageRotation };

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes);
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : "";
    throw new PdfToolError(/encrypt/i.test(message) ? "encrypted" : "unreadable");
  }
}

/**
 * Builds one PDF from chosen pages, in order. A page may come from any source,
 * more than once, and be turned by a quarter, half or three quarters. A
 * picture is a source with one page (page 0). Pure: no storage, no database.
 */
export async function buildComposedPdf(sources: ReadonlyMap<string, ComposeSource>, pages: readonly ComposePage[], title: string): Promise<Uint8Array> {
  const output = await PDFDocument.create();

  // Copy each PDF's pages in one go, so fonts and pictures they share are stored once.
  const copied = new Map<string, PDFPage[]>();
  const images = new Map<string, PDFImage>();
  for (const [key, source] of sources) {
    const wanted = pages.filter((page) => page.source === key).map((page) => page.page);
    if (wanted.length === 0) continue;
    if (source.contentType === "application/pdf") {
      const pdf = await loadPdf(source.bytes);
      if (wanted.some((index) => index >= pdf.getPageCount())) throw new PdfToolError("bad-page");
      copied.set(key, await output.copyPages(pdf, wanted));
    } else if (source.contentType === "image/jpeg" || source.contentType === "image/png") {
      if (wanted.some((index) => index !== 0)) throw new PdfToolError("bad-page");
      try {
        images.set(key, source.contentType === "image/png" ? await output.embedPng(source.bytes) : await output.embedJpg(source.bytes));
      } catch {
        throw new PdfToolError("unreadable");
      }
    } else {
      throw new PdfToolError("not-mergeable");
    }
  }

  for (const entry of pages) {
    const image = images.get(entry.source);
    let page: PDFPage | undefined;
    if (image) page = addImagePage(output, image);
    else {
      page = copied.get(entry.source)?.shift();
      if (page) output.addPage(page);
    }
    if (!page) throw new PdfToolError("not-found");
    if (entry.rotation !== 0) page.setRotation(degrees((page.getRotation().angle + entry.rotation) % 360));
  }

  output.setTitle(title);
  output.setProducer("מערכת המשכנתאות");
  const result = await output.save();
  if (result.length > MAX_FILE_BYTES) throw new PdfToolError("too-large");
  return result;
}

/**
 * Builds a new document of the case from pages of its documents (merge,
 * split, reorder, turn, or a picture to PDF: all are one recipe). The sources
 * are left untouched. Returns the new document id.
 */
export async function composeDocument(supabase: SupabaseClient, context: Context, caseId: string, input: ComposeInput): Promise<string> {
  const ids = [...new Set(input.pages.map((page) => page.documentId))];
  const { data, error } = await supabase
    .from("case_documents")
    .select("id, title, category, client_id, files(storage_provider, storage_key, content_type, size_bytes)")
    .eq("organization_id", context.organizationId)
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .in("id", ids);
  if (error) throw new Error(`compose sources failed: ${error.code}`);
  const rows = z.array(sourceRow).parse(data ?? []);
  if (rows.length !== ids.length) throw new PdfToolError("not-found");
  if (rows.some((row) => !MERGEABLE.has(row.files.content_type))) throw new PdfToolError("not-mergeable");
  if (rows.reduce((sum, row) => sum + row.files.size_bytes, 0) > MAX_INPUT_BYTES) throw new PdfToolError("too-large");

  const sources = new Map<string, ComposeSource>();
  for (const row of rows) {
    sources.set(row.id, { bytes: await getStorageByName(row.files.storage_provider).get(row.files.storage_key), contentType: row.files.content_type });
  }
  const bytes = await buildComposedPdf(
    sources,
    input.pages.map((page) => ({ source: page.documentId, page: page.page, rotation: page.rotation })),
    input.title,
  );

  // The result belongs to a borrower only when every source belongs to the same one.
  const owners = new Set(rows.map((row) => row.client_id));
  const clientId = owners.size === 1 ? (rows[0]?.client_id ?? null) : null;
  const sensitive = SENSITIVE_CATEGORIES.includes(input.category) || rows.some((row) => SENSITIVE_CATEGORIES.includes(row.category));

  return saveNewPdf(supabase, context, caseId, bytes, {
    title: input.title,
    category: input.category,
    clientId,
    sensitive,
    parentDocumentId: input.pages[0]?.documentId ?? null,
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
