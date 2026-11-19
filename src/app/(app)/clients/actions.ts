"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/log";
import { requireSession, type SessionContext } from "@/lib/auth/session";
import { addBorrower } from "@/lib/cases/cases";
import { linkSpouses, SpouseLinkError, unlinkSpouse } from "@/lib/clients/family";
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

export type RevealState = { value?: string; error?: string };

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

  // Added as a spouse: link the two, so shared children show on both cards.
  const spouseOf = clientIdSchema.safeParse(formData.get("spouseOf"));
  if (spouseOf.success) {
    try {
      await linkSpouses(supabase, spouseOf.data, clientId);
      await auditSpouse(session, "client.link_spouse", spouseOf.data, clientId);
    } catch (error) {
      // The client is saved; only the link failed. The card shows no spouse, and it can be linked from there.
      console.error("spouse link failed", error instanceof Error ? error.message : "unknown");
    }
    redirect(`/clients/${clientId}`);
  }

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

async function auditSpouse(session: SessionContext, action: string, clientId: string, spouseId?: string) {
  const supabase = await createClient();
  await recordAudit(supabase, {
    organizationId: session.organization.id,
    actorId: session.user.id,
    action,
    entityType: "client",
    entityId: clientId,
    metadata: spouseId ? { spouseId } : undefined,
  });
}

/** Links a client to an existing client as spouses. */
export async function linkSpouseAction(clientId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = clientIdSchema.safeParse(clientId);
  const spouseId = clientIdSchema.safeParse(formData.get("spouseId"));
  if (!id.success) redirect("/clients");
  if (!spouseId.success) redirect(`/clients/${id.data}/spouse`);

  const supabase = await createClient();
  try {
    await linkSpouses(supabase, id.data, spouseId.data);
  } catch (error) {
    if (error instanceof SpouseLinkError) redirect(`/clients/${id.data}/spouse?error=${error.reason}`);
    throw error;
  }
  await auditSpouse(session, "client.link_spouse", id.data, spouseId.data);
  redirect(`/clients/${id.data}?linked=1`);
}

/** Unlinks spouses. Each keeps a copy of the children they shared. */
export async function unlinkSpouseAction(clientId: string): Promise<void> {
  const session = await requireSession();
  const id = clientIdSchema.safeParse(clientId);
  if (!id.success) redirect("/clients");

  const supabase = await createClient();
  await unlinkSpouse(supabase, id.data);
  await auditSpouse(session, "client.unlink_spouse", id.data);
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
    return idNumber ? { value: idNumber } : { error: "לא הוזן מספר" };
  } catch (error) {
    console.error("reveal id failed", error instanceof Error ? error.name : "unknown");
    return { error: "לא ניתן להציג כרגע. נסו שוב" };
  }
}
