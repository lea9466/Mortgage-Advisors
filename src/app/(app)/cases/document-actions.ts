"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/log";
import { requireSession, type SessionContext } from "@/lib/auth/session";
import { finishUpload, moveDocumentToTrash, startUpload, updateDocument, UploadRejectedError } from "@/lib/cases/documents";
import { logSystemEvent } from "@/lib/cases/log";
import { composeDocument, PdfToolError } from "@/lib/cases/pdfTools";
import { createClient } from "@/lib/supabase/server";
import {
  composeSchema,
  DOCUMENT_CATEGORY_LABELS,
  documentEditSchema,
  finishUploadSchema,
  startUploadSchema,
} from "@/lib/validation/document";

export type StartUploadResult = { url: string; headers: Record<string, string>; token: string } | { error: string };
export type FinishUploadResult = { ok: true } | { error: string };

const uuid = z.uuid();
const GENERIC_ERROR = "ההעלאה נכשלה. נסו שוב בעוד רגע";

const REJECTED: Record<UploadRejectedError["reason"], string> = {
  expired: "עבר יותר מדי זמן מתחילת ההעלאה. נסו שוב",
  missing: "הקובץ לא הגיע לשרת. נסו שוב",
  "not-allowed": "הקובץ לא נפתח כ-PDF, תמונה או קובץ Office, ולכן לא נשמר",
  "too-large": "הקובץ גדול מ-25MB",
  empty: "הקובץ ריק",
  invalid: GENERIC_ERROR,
};

function context(session: SessionContext) {
  return { organizationId: session.organization.id, userId: session.user.id };
}

/** Step 1 of an upload: a one-time link for the browser to send the file to storage directly. */
export async function startUploadAction(caseId: string, file: unknown): Promise<StartUploadResult> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  const parsed = startUploadSchema.safeParse(file);
  if (!id.success) return { error: GENERIC_ERROR };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  const supabase = await createClient();
  try {
    return await startUpload(supabase, session.organization.id, id.data, parsed.data);
  } catch (error) {
    if (error instanceof UploadRejectedError) return { error: REJECTED[error.reason] };
    console.error("start upload failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR };
  }
}

/** Step 3: the file arrived; check it and add it to the case. */
export async function finishUploadAction(caseId: string, input: unknown): Promise<FinishUploadResult> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  const parsed = finishUploadSchema.safeParse(input);
  if (!id.success || !parsed.success) return { error: GENERIC_ERROR };

  const supabase = await createClient();
  try {
    const documentId = await finishUpload(supabase, context(session), id.data, parsed.data);
    await recordAudit(supabase, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      action: "document.upload",
      entityType: "document",
      entityId: documentId,
    });
    await logSystemEvent(
      supabase,
      context(session),
      id.data,
      `הועלה מסמך: ${parsed.data.title} (${DOCUMENT_CATEGORY_LABELS[parsed.data.category]})`,
    );
  } catch (error) {
    if (error instanceof UploadRejectedError) return { error: REJECTED[error.reason] };
    console.error("finish upload failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR };
  }
  refresh();
  return { ok: true };
}

export async function updateDocumentAction(caseId: string, documentId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  const doc = uuid.safeParse(documentId);
  if (!id.success) redirect("/cases");
  const clientId = formData.get("clientId");
  const parsed = documentEditSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    clientId: typeof clientId === "string" && clientId !== "" ? clientId : undefined,
  });

  if (doc.success && parsed.success) {
    const supabase = await createClient();
    await updateDocument(supabase, session.organization.id, id.data, doc.data, parsed.data);
    await recordAudit(supabase, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      action: "document.update",
      entityType: "document",
      entityId: doc.data,
    });
  }
  redirect(`/cases/${id.data}?tab=documents`);
}

export type ComposeResult = { error: string };

const COMPOSE_REFUSED: Record<PdfToolError["reason"], string> = {
  "not-found": "אחד המסמכים כבר לא נמצא בתיק. רעננו את הדף ונסו שוב",
  "not-mergeable": "אפשר לקחת דפים רק מ-PDF ומתמונות (JPG, PNG). קובצי Office לא נכללים",
  encrypted: "אחד מקובצי ה-PDF מוגן בסיסמה, ולכן אי אפשר לקחת ממנו דפים",
  unreadable: "אחד הקבצים פגום ולא נפתח",
  "bad-page": "אחד הדפים לא נמצא במסמך המקורי. רעננו את הדף ונסו שוב",
  "too-large": "הקובץ החדש גדול מ-25MB. נסו פחות דפים",
};

/**
 * Saves a new PDF built from pages of the case's documents (merge, split,
 * reorder, turn pages, or a picture to PDF). The sources stay as they are.
 */
export async function composeDocumentAction(caseId: string, input: unknown): Promise<ComposeResult> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  if (!id.success) return { error: GENERIC_ERROR };
  const parsed = composeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  const supabase = await createClient();
  let documentId: string;
  try {
    documentId = await composeDocument(supabase, context(session), id.data, parsed.data);
  } catch (error) {
    if (error instanceof PdfToolError) return { error: COMPOSE_REFUSED[error.reason] };
    console.error("compose failed", error instanceof Error ? error.message : "unknown");
    return { error: "השמירה נכשלה. נסו שוב בעוד רגע" };
  }

  const pageCount = parsed.data.pages.length;
  const sourceCount = new Set(parsed.data.pages.map((page) => page.documentId)).size;
  await recordAudit(supabase, {
    organizationId: session.organization.id,
    actorId: session.user.id,
    action: "document.compose",
    entityType: "document",
    entityId: documentId,
    metadata: { pages: pageCount, sources: sourceCount },
  });
  const pagesText = pageCount === 1 ? "דף אחד" : `${pageCount} דפים`;
  const sourcesText = sourceCount === 1 ? "ממסמך אחד" : `מ-${sourceCount} מסמכים`;
  await logSystemEvent(supabase, context(session), id.data, `נוצר מסמך חדש (${pagesText} ${sourcesText}): ${parsed.data.title}`);
  redirect(`/cases/${id.data}?tab=documents`);
}

/** Moves a document to the recycle bin. It can be restored from there. */
export async function hideDocumentAction(caseId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  const doc = uuid.safeParse(formData.get("documentId"));
  if (!id.success) redirect("/cases");

  if (doc.success) {
    const supabase = await createClient();
    await moveDocumentToTrash(supabase, context(session), id.data, doc.data);
    await recordAudit(supabase, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      action: "document.trash",
      entityType: "document",
      entityId: doc.data,
    });
    const title = formData.get("title");
    await logSystemEvent(supabase, context(session), id.data, `מסמך הועבר לסל המחזור${typeof title === "string" ? `: ${title.slice(0, 200)}` : ""}`);
  }
  redirect(`/cases/${id.data}?tab=documents`);
}
