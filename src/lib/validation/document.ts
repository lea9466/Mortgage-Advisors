import { z } from "zod";
import { MAX_FILE_BYTES } from "@/lib/storage/validateFile";

export const DOCUMENT_CATEGORIES = [
  "identity",
  "income",
  "bank_statements",
  "property",
  "liabilities",
  "bank_approvals",
  "medical",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  identity: "תעודות ומסמכים אישיים",
  income: "הכנסות ותלושים",
  bank_statements: 'דפי עו"ש',
  property: "הנכס (חוזה, נסח, שמאות)",
  liabilities: "התחייבויות והלוואות",
  bank_approvals: "אישורים והצעות מהבנקים",
  medical: "מסמכים רפואיים",
  other: "אחר",
};

/** Categories whose files are marked sensitive (medical information). */
export const SENSITIVE_CATEGORIES: readonly DocumentCategory[] = ["medical"];

/** Types the browser may declare; the server re-checks the real type from the content. */
export const UPLOAD_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
] as const;

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";

const optionalClient = z.uuid().optional();

export const startUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().min(1, "הקובץ ריק").max(MAX_FILE_BYTES, "הקובץ גדול מ-25MB"),
  contentType: z.enum(UPLOAD_CONTENT_TYPES, "סוג קובץ שאי אפשר להעלות. אפשר PDF, תמונה או קובץ Office"),
});

export const finishUploadSchema = z.object({
  token: z.string().min(10).max(2000),
  title: z.string().trim().min(1, "חסר שם").max(200, "השם ארוך מדי"),
  category: z.enum(DOCUMENT_CATEGORIES),
  clientId: optionalClient,
});

export const documentEditSchema = z.object({
  title: z.string().trim().min(1, "חסר שם").max(200, "השם ארוך מדי"),
  category: z.enum(DOCUMENT_CATEGORIES),
  clientId: optionalClient,
});

export const MAX_COMPOSE_PAGES = 500;
export const MAX_COMPOSE_SOURCES = 30;
export const PAGE_ROTATIONS = [0, 90, 180, 270] as const;
export type PageRotation = (typeof PAGE_ROTATIONS)[number];

/** One page of a new document: which page of which document, turned by how much. */
export const composePageSchema = z.object({
  documentId: z.uuid(),
  page: z.number().int().min(0).max(9999),
  rotation: z.literal(PAGE_ROTATIONS),
});

/** A new PDF built from pages of the case's documents, in order. The sources are never changed. */
export const composeSchema = z
  .object({
    pages: z.array(composePageSchema).min(1, "אין דפים בקובץ החדש").max(MAX_COMPOSE_PAGES, "אפשר עד 500 דפים בקובץ אחד"),
    title: z.string().trim().min(1, "חסר שם").max(200, "השם ארוך מדי"),
    category: z.enum(DOCUMENT_CATEGORIES),
  })
  .refine((value) => new Set(value.pages.map((page) => page.documentId)).size <= MAX_COMPOSE_SOURCES, {
    message: "אפשר לקחת דפים מעד 30 מסמכים בקובץ אחד",
  });
export type ComposeInput = z.infer<typeof composeSchema>;

/** "חוזה רכישה.pdf" without the extension, as the default document title. */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim();
  return (base || fileName).slice(0, 200);
}

/** The usual extension for a stored type, for the download file name. */
export function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/msword": "doc",
    "application/vnd.ms-excel": "xls",
  };
  return map[contentType] ?? "bin";
}

/** 1536000 bytes as "1.5MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
