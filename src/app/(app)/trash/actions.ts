"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/log";
import { requireSession } from "@/lib/auth/session";
import { logSystemEvent } from "@/lib/cases/log";
import { deleteDocumentPermanently, restoreDocument } from "@/lib/cases/trash";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();

/** Where to return: the bin, keeping a case filter if there was one. */
function backTo(formData: FormData): string {
  const caseFilter = uuid.safeParse(formData.get("caseFilter"));
  return caseFilter.success ? `/trash?case=${caseFilter.data}` : "/trash";
}

export async function restoreDocumentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = uuid.safeParse(formData.get("documentId"));
  if (id.success) {
    const supabase = await createClient();
    const restored = await restoreDocument(supabase, session.organization.id, id.data);
    if (restored) {
      await recordAudit(supabase, {
        organizationId: session.organization.id,
        actorId: session.user.id,
        action: "document.restore",
        entityType: "document",
        entityId: id.data,
      });
      await logSystemEvent(
        supabase,
        { organizationId: session.organization.id, userId: session.user.id },
        restored.caseId,
        `מסמך שוחזר מסל המחזור: ${restored.title}`,
      );
    }
  }
  redirect(backTo(formData));
}

/**
 * Deletes a binned document for good. Needs the explicit confirmation field
 * from the confirm step, so one stray click never deletes anything.
 */
export async function deleteDocumentPermanentlyAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = uuid.safeParse(formData.get("documentId"));
  if (id.success && formData.get("confirm") === "delete") {
    const supabase = await createClient();
    const deleted = await deleteDocumentPermanently(supabase, session.organization.id, id.data);
    if (deleted) {
      // The audit entry keeps who and when, never the file or its content.
      await recordAudit(supabase, {
        organizationId: session.organization.id,
        actorId: session.user.id,
        action: "document.delete_permanently",
        entityType: "document",
        entityId: id.data,
      });
      await logSystemEvent(
        supabase,
        { organizationId: session.organization.id, userId: session.user.id },
        deleted.caseId,
        `מסמך נמחק לצמיתות: ${deleted.title}`,
      );
    }
  }
  redirect(backTo(formData));
}
