"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/log";
import { requireSession } from "@/lib/auth/session";
import { addBorrower } from "@/lib/cases/cases";
import { logSystemEvent } from "@/lib/cases/log";
import {
  createClientRecord,
  DuplicateIdNumberError,
  revealClientIdNumber,
  updateClientRecord,
} from "@/lib/clients/clients";
import { createClient } from "@/lib/supabase/server";
import {
  clientIdSchema,
  clientSchema,
  readClientForm,
  type ClientFormValues,
} from "@/lib/validation/client";

export type ClientFormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  values?: ClientFormValues;
};

export type RevealState = { idNumber?: string; error?: string };

const GENERIC_ERROR = "השמירה נכשלה. נסו שוב בעוד רגע";
const DUPLICATE_ID = "כבר קיים לקוח עם תעודת הזהות הזו. חפשו אותו ברשימת הלקוחות";

function parseClientForm(formData: FormData) {
  const values = readClientForm(formData);
  const parsed = clientSchema.safeParse(values);
  return { values, parsed };
}

export async function createClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const session = await requireSession();
  const { values, parsed } = parseClientForm(formData);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const supabase = await createClient();
  let clientId: string;
  try {
    clientId = await createClientRecord(
      supabase,
      { organizationId: session.organization.id, userId: session.user.id },
      parsed.data,
    );
  } catch (error) {
    if (error instanceof DuplicateIdNumberError) return { fieldErrors: { idNumber: [DUPLICATE_ID] }, values };
    console.error("create client failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR, values };
  }

  await recordAudit(supabase, {
    organizationId: session.organization.id,
    actorId: session.user.id,
    action: "client.create",
    entityType: "client",
    entityId: clientId,
  });

  // Opened from a case: the new client joins it as a borrower.
  const caseId = clientIdSchema.safeParse(formData.get("caseId"));
  if (caseId.success) {
    await addBorrower(supabase, session.organization.id, caseId.data, clientId);
    await recordAudit(supabase, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      action: "case.add_borrower",
      entityType: "case",
      entityId: caseId.data,
      metadata: { clientId },
    });
    await logSystemEvent(
      supabase,
      { organizationId: session.organization.id, userId: session.user.id },
      caseId.data,
      `${parsed.data.firstName} ${parsed.data.lastName} נוסף/ה כלקוח חדש וצורף/ה לתיק`,
    );
    redirect(`/cases/${caseId.data}?tab=personal`);
  }
  // Created while opening a case: continue to choosing its purpose.
  if (formData.get("then") === "open-case") redirect(`/cases/new?client=${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function updateClientAction(
  clientId: string,
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const session = await requireSession();
  const id = clientIdSchema.safeParse(clientId);
  if (!id.success) return { error: GENERIC_ERROR };

  const { values, parsed } = parseClientForm(formData);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const supabase = await createClient();
  try {
    const updated = await updateClientRecord(
      supabase,
      { organizationId: session.organization.id },
      id.data,
      parsed.data,
    );
    if (!updated) return { error: "הלקוח לא נמצא", values };
  } catch (error) {
    if (error instanceof DuplicateIdNumberError) return { fieldErrors: { idNumber: [DUPLICATE_ID] }, values };
    console.error("update client failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR, values };
  }

  await recordAudit(supabase, {
    organizationId: session.organization.id,
    actorId: session.user.id,
    action: parsed.data.idNumber ? "client.update_with_id_number" : "client.update",
    entityType: "client",
    entityId: id.data,
  });
  redirect(`/clients/${id.data}`);
}

/**
 * Shows one client's full ID number. Every reveal is written to the audit log
 * first; if that write fails, the number is not shown.
 */
export async function revealIdNumberAction(clientId: string): Promise<RevealState> {
  const session = await requireSession();
  const id = clientIdSchema.safeParse(clientId);
  if (!id.success) return { error: "לא ניתן להציג" };

  const supabase = await createClient();
  const logged = await recordAudit(supabase, {
    organizationId: session.organization.id,
    actorId: session.user.id,
    action: "client.reveal_id_number",
    entityType: "client",
    entityId: id.data,
  });
  if (!logged) return { error: "לא ניתן להציג כרגע. נסו שוב" };

  try {
    const idNumber = await revealClientIdNumber(supabase, session.organization.id, id.data);
    return idNumber ? { idNumber } : { error: "לא הוזן מספר" };
  } catch (error) {
    console.error("reveal id failed", error instanceof Error ? error.name : "unknown");
    return { error: "לא ניתן להציג כרגע. נסו שוב" };
  }
}
