"use server";

import { refresh } from "next/cache";
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
import { addLogEntry, logSystemEvent } from "@/lib/cases/log";
import { getClientRecord } from "@/lib/clients/clients";
import { formatShekels } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  APARTMENT_CLASS_LABELS,
  CASE_STAGE_LABELS,
  caseDetailsSchema,
  HAND_LABELS,
  insightSchema,
  logEntrySchema,
  openCaseSchema,
  PURPOSE_LABELS,
  readCaseDetailsForm,
  stageSchema,
  type CaseDetailsFormValues,
  type CaseDetailsInput,
} from "@/lib/validation/case";
import type { CaseRecord } from "@/lib/cases/cases";

export type CaseDetailsState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  values?: CaseDetailsFormValues;
};
export type InsightState = { error?: string; fieldError?: string; savedAt?: number };
export type LogState = { error?: string; savedAt?: number };

const GENERIC_ERROR = "השמירה נכשלה. נסו שוב בעוד רגע";
const uuid = z.uuid();

function context(session: SessionContext) {
  return { organizationId: session.organization.id, userId: session.user.id };
}

/** "מחיר החוזה עודכן ל-₪1,780,000 · הון עצמי עודכן ל-₪630,000", or null when nothing changed. */
function describeDetailChanges(before: CaseRecord, after: CaseDetailsInput): string | null {
  const isPurchase = before.purpose === "purchase";
  const amounts: [string, number | null, number | undefined, boolean][] = [
    ["משכנתא מבוקשת", before.requested_amount, after.requestedAmount, true],
    ["שווי הנכס", before.property_value, after.propertyValue, !isPurchase],
    ["מחיר החוזה", before.contract_price, after.contractPrice, isPurchase],
    ["הון עצמי", before.equity, after.equity, isPurchase],
  ];
  const changes = amounts
    .filter(([, old, next, applies]) => applies && (old ?? null) !== (next ?? null))
    .map(([label, , next]) => (next === undefined ? `${label} נמחק` : `${label} עודכן ל-${formatShekels(next)}`));

  if (isPurchase && (before.hand ?? undefined) !== after.hand && after.hand) changes.push(HAND_LABELS[after.hand]);
  if (isPurchase && (before.apartment_class ?? undefined) !== after.apartmentClass && after.apartmentClass) {
    changes.push(APARTMENT_CLASS_LABELS[after.apartmentClass]);
  }
  return changes.length > 0 ? changes.join(" · ") : null;
}

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
  await logSystemEvent(supabase, context(session), caseId, `התיק נפתח · ${PURPOSE_LABELS[parsed.data.purpose]}`);
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
  const changes = describeDetailChanges(record, parsed.data);
  if (changes) await logSystemEvent(supabase, context(session), id.data, changes);
  redirect(`/cases/${id.data}?tab=property&saved=1`);
}

export async function changeStageAction(caseId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  const stage = stageSchema.safeParse(formData.get("stage"));
  if (!id.success) redirect("/cases");
  if (!stage.success) redirect(`/cases/${id.data}`);

  const supabase = await createClient();
  const record = await getCase(supabase, session.organization.id, id.data);
  if (record && record.stage !== stage.data) {
    await updateCaseStage(supabase, session.organization.id, id.data, stage.data);
    await audit(session, "case.change_stage", id.data, { stage: stage.data });
    await logSystemEvent(supabase, context(session), id.data, `עבר לשלב ${CASE_STAGE_LABELS[stage.data]}`);
  }
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
  const client = await getClientRecord(supabase, session.organization.id, clientId.data);
  if (client) {
    await logSystemEvent(supabase, context(session), id.data, `${client.first_name} ${client.last_name} צורף/ה לתיק`);
  }
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
    const removed = record.case_borrowers.find((link) => link.clients.id === clientId.data)?.clients;
    if (removed) {
      await logSystemEvent(supabase, context(session), id.data, `${removed.first_name} ${removed.last_name} הוסר/ה מהתיק`);
    }
  }
  redirect(`/cases/${id.data}?tab=personal`);
}

/** Adds a note, call or meeting to the case log. The form clears and the log refreshes. */
export async function createLogEntryAction(caseId: string, _prev: LogState, formData: FormData): Promise<LogState> {
  const session = await requireSession();
  const id = uuid.safeParse(caseId);
  if (!id.success) return { error: GENERIC_ERROR };

  const parsed = logEntrySchema.safeParse({ kind: formData.get("kind"), body: formData.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  const supabase = await createClient();
  try {
    await addLogEntry(supabase, context(session), id.data, parsed.data);
  } catch (error) {
    console.error("log entry failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR };
  }
  refresh();
  return { savedAt: Date.now() };
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
