"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/log";
import { requireSession, type SessionContext } from "@/lib/auth/session";
import {
  addBorrower,
  getCase,
  openCase,
  removeBorrower,
  updateCaseDetails,
  updateCaseStage,
} from "@/lib/cases/cases";
import { createInsight, deleteInsight } from "@/lib/cases/insights";
import { createClient } from "@/lib/supabase/server";
import {
  caseDetailsSchema,
  insightSchema,
  openCaseSchema,
  readCaseDetailsForm,
  stageSchema,
  type CaseDetailsFormValues,
} from "@/lib/validation/case";

export type CaseDetailsState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  values?: CaseDetailsFormValues;
};
export type InsightState = { error?: string; fieldError?: string; savedAt?: number };

const GENERIC_ERROR = "השמירה נכשלה. נסו שוב בעוד רגע";
const uuid = z.uuid();

async function audit(session: SessionContext, action: string, entityId: string, metadata?: Record<string, string>) {
  const supabase = await createClient();
  await recordAudit(supabase, {
    organizationId: session.organization.id,
    actorId: session.user.id,
    action,
    entityType: "case",
    entityId,
    metadata,
  });
}

export async function openCaseAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = openCaseSchema.safeParse({ clientId: formData.get("clientId"), purpose: formData.get("purpose") });
  if (!parsed.success) redirect("/cases/new");

  const supabase = await createClient();
  const caseId = await openCase(supabase, parsed.data.clientId, parsed.data.purpose);
  await audit(session, "case.open", caseId, { purpose: parsed.data.purpose });
  redirect(`/cases/${caseId}?tab=property`);
}

export async function updateCaseDetailsAction(
  caseId: string,
  _prev: CaseDetailsState,
  formData: FormData,
): Promise<CaseDetailsState> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  if (!id.success) return { error: GENERIC_ERROR };

  const values = readCaseDetailsForm(formData);
  const parsed = caseDetailsSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const supabase = await createClient();
  const record = await getCase(supabase, session.organization.id, id.data);
  if (!record) return { error: "התיק לא נמצא", values };
  try {
    await updateCaseDetails(supabase, session.organization.id, id.data, record.purpose, parsed.data);
  } catch (error) {
    console.error("case details failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR, values };
  }
  await audit(session, "case.update_details", id.data);
  redirect(`/cases/${id.data}?tab=property&saved=1`);
}

export async function changeStageAction(caseId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  const stage = stageSchema.safeParse(formData.get("stage"));
  if (!id.success) redirect("/cases");
  if (!stage.success) redirect(`/cases/${id.data}`);

  const supabase = await createClient();
  await updateCaseStage(supabase, session.organization.id, id.data, stage.data);
  await audit(session, "case.change_stage", id.data, { stage: stage.data });
  redirect(`/cases/${id.data}`);
}

export async function addBorrowerAction(caseId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  const clientId = uuid.safeParse(formData.get("clientId"));
  if (!id.success) redirect("/cases");
  if (!clientId.success) redirect(`/cases/${id.data}/borrowers`);

  const supabase = await createClient();
  await addBorrower(supabase, session.organization.id, id.data, clientId.data);
  await audit(session, "case.add_borrower", id.data, { clientId: clientId.data });
  redirect(`/cases/${id.data}?tab=personal`);
}

export async function removeBorrowerAction(caseId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  const clientId = uuid.safeParse(formData.get("clientId"));
  if (!id.success) redirect("/cases");
  if (!clientId.success) redirect(`/cases/${id.data}?tab=personal`);

  const supabase = await createClient();
  const record = await getCase(supabase, session.organization.id, id.data);
  // A case keeps at least one borrower; the last one cannot be removed.
  if (record && record.case_borrowers.length > 1) {
    await removeBorrower(supabase, session.organization.id, id.data, clientId.data);
    await audit(session, "case.remove_borrower", id.data, { clientId: clientId.data });
  }
  redirect(`/cases/${id.data}?tab=personal`);
}

/** Saves a lesson learned in a case to the insights centre. The form clears on success. */
export async function createInsightAction(caseId: string, _prev: InsightState, formData: FormData): Promise<InsightState> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  if (!id.success) return { error: GENERIC_ERROR };

  const bank = formData.get("bank");
  const parsed = insightSchema.safeParse({
    body: formData.get("body"),
    bank: typeof bank === "string" && bank !== "" ? bank : undefined,
  });
  if (!parsed.success) return { fieldError: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  try {
    const insightId = await createInsight(
      supabase,
      { organizationId: session.organization.id, userId: session.user.id },
      { ...parsed.data, sourceCaseId: id.data },
    );
    await recordAudit(supabase, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      action: "insight.create",
      entityType: "insight",
      entityId: insightId,
    });
  } catch (error) {
    console.error("insight failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR };
  }
  return { savedAt: Date.now() };
}

export async function deleteInsightAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = uuid.safeParse(formData.get("insightId"));
  if (id.success) {
    const supabase = await createClient();
    await deleteInsight(supabase, session.organization.id, id.data);
    await recordAudit(supabase, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      action: "insight.delete",
      entityType: "insight",
      entityId: id.data,
    });
  }
  redirect("/insights");
}
