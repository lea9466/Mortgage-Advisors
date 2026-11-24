"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireSession, type SessionContext } from "@/lib/auth/session";
import { logSystemEvent } from "@/lib/cases/log";
import { addCaseRequirement, updateCaseRequirement } from "@/lib/cases/requirements";
import { createClient } from "@/lib/supabase/server";
import { caseRequirementSchema, REQUIREMENT_STATUS_LABELS, requirementUpdateSchema } from "@/lib/validation/requirement";

export type RequirementResult = { error?: string };

const uuid = z.uuid();
const GENERIC_ERROR = "השמירה נכשלה. נסו שוב בעוד רגע";

function context(session: SessionContext) {
  return { organizationId: session.organization.id, userId: session.user.id };
}

/** Changes the status, note or linked document of one item in a case's list. */
export async function updateRequirementAction(caseId: string, requirementId: string, input: unknown): Promise<RequirementResult> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  const item = uuid.safeParse(requirementId);
  const parsed = requirementUpdateSchema.safeParse(input);
  if (!id.success || !item.success) return { error: GENERIC_ERROR };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  const supabase = await createClient();
  try {
    const updated = await updateCaseRequirement(supabase, context(session), id.data, item.data, parsed.data);
    if (!updated) return { error: "הפריט כבר לא נמצא ברשימה. רעננו את הדף" };
    // Approvals and requests to fix go in the case log; the other changes are visible in the list itself.
    if (parsed.data.status === "approved" || parsed.data.status === "needs_fix") {
      await logSystemEvent(supabase, context(session), id.data, `${REQUIREMENT_STATUS_LABELS[parsed.data.status]}: ${updated.title}`);
    }
  } catch (error) {
    console.error("requirement update failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR };
  }
  refresh();
  return {};
}

/** Adds an item to this case's list only. */
export async function addCaseRequirementAction(caseId: string, _prev: RequirementResult, formData: FormData): Promise<RequirementResult> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  if (!id.success) return { error: GENERIC_ERROR };
  const clientId = formData.get("requirementClient");
  const parsed = caseRequirementSchema.safeParse({
    title: formData.get("requirementTitle"),
    category: formData.get("requirementCategory"),
    clientId: typeof clientId === "string" && clientId !== "" ? clientId : undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  const supabase = await createClient();
  try {
    await addCaseRequirement(supabase, context(session), id.data, parsed.data);
  } catch (error) {
    console.error("requirement add failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR };
  }
  refresh();
  return {};
}
