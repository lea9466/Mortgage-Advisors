"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { RevealState } from "@/app/(app)/clients/actions";
import { recordAudit } from "@/lib/audit/log";
import { requireSession, type SessionContext } from "@/lib/auth/session";
import { getCase } from "@/lib/cases/cases";
import { deleteFinanceRow, insertFinanceRow, revealAccountNumber, updateFinanceRow } from "@/lib/cases/finances";
import { logSystemEvent } from "@/lib/cases/log";
import { formatShekels } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  ACCOUNT_BANK_LABELS,
  BANK_ACCOUNT_FIELDS,
  bankAccountSchema,
  INCOME_FIELDS,
  INCOME_KIND_LABELS,
  incomeSchema,
  LIABILITY_FIELDS,
  LIABILITY_KIND_LABELS,
  liabilitySchema,
  readForm,
  type FinanceFormValues,
} from "@/lib/validation/finance";

export type FinanceFormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  values?: FinanceFormValues;
  savedAt?: number;
};

const GENERIC_ERROR = "השמירה נכשלה. נסו שוב בעוד רגע";
const uuid = z.uuid();

/** One entry per financial area: its table, tab, form fields, schema and log wording. */
const AREAS = {
  income: {
    table: "case_incomes",
    tab: "income",
    fields: INCOME_FIELDS,
    checkboxes: [] as string[],
    schema: incomeSchema,
    describe: (data: z.infer<typeof incomeSchema>) =>
      `הכנסה · ${INCOME_KIND_LABELS[data.kind]} · ${data.title} · ${formatShekels(data.monthlyAmount)}`,
  },
  liability: {
    table: "case_liabilities",
    tab: "debts",
    fields: LIABILITY_FIELDS,
    checkboxes: [] as string[],
    schema: liabilitySchema,
    describe: (data: z.infer<typeof liabilitySchema>) =>
      `התחייבות · ${LIABILITY_KIND_LABELS[data.kind]}${data.lender ? ` · ${data.lender}` : ""} · החזר ${formatShekels(data.monthlyPayment)}`,
  },
  account: {
    table: "case_bank_accounts",
    tab: "bank",
    fields: BANK_ACCOUNT_FIELDS,
    checkboxes: ["isJoint"],
    schema: bankAccountSchema,
    // Never the account number, not even part of it.
    describe: (data: z.infer<typeof bankAccountSchema>) => `חשבון עו"ש · ${ACCOUNT_BANK_LABELS[data.bank]}`,
  },
} as const;
export type FinanceArea = keyof typeof AREAS;
const areaSchema = z.enum(["income", "liability", "account"]);

/** Messages per top-level field, the same shape z.flattenError gives for a single schema. */
function fieldErrorsOf(issues: readonly z.core.$ZodIssue[]): Partial<Record<string, string[]>> {
  const errors: Partial<Record<string, string[]>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field !== "string") continue;
    errors[field] = [...(errors[field] ?? []), issue.message];
  }
  return errors;
}

function context(session: SessionContext) {
  return { organizationId: session.organization.id, userId: session.user.id };
}

/**
 * Adds or edits one income, liability or bank account of a borrower in a case.
 * Adding keeps the page and clears the form for the next one; editing returns to the list.
 */
export async function saveFinanceAction(
  area: FinanceArea,
  caseId: string,
  rowId: string | null,
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const session = await requireSession();
  const areaKey = areaSchema.safeParse(area);
  const id = uuid.safeParse(caseId);
  const row = rowId === null ? null : uuid.safeParse(rowId);
  if (!areaKey.success || !id.success || (row && !row.success)) return { error: GENERIC_ERROR };
  const config = AREAS[areaKey.data];

  const values = readForm(formData, config.fields, config.checkboxes);
  const parsed = config.schema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), values };
  if (areaKey.data === "account" && !row && !("accountNumber" in parsed.data && parsed.data.accountNumber)) {
    return { fieldErrors: { accountNumber: ["שדה חובה"] }, values };
  }

  const supabase = await createClient();
  const record = await getCase(supabase, session.organization.id, id.data);
  const borrower = record?.case_borrowers.find((link) => link.clients.id === parsed.data.clientId)?.clients;
  if (!record || !borrower) return { error: "הלווה לא נמצא בתיק", values };

  try {
    if (row?.success) {
      await updateFinanceRow(supabase, session.organization.id, config.table, id.data, row.data, parsed.data as never);
    } else {
      await insertFinanceRow(supabase, context(session), config.table, id.data, parsed.data as never);
    }
  } catch (error) {
    console.error("finance save failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR, values };
  }

  const verb = row ? "עודכנה" : "נוספה";
  const description = (config.describe as (data: typeof parsed.data) => string)(parsed.data);
  await logSystemEvent(supabase, context(session), id.data, `${verb} ${description} · ${borrower.first_name} ${borrower.last_name}`);
  await recordAudit(supabase, {
    organizationId: session.organization.id,
    actorId: session.user.id,
    action: `case.${row ? "update" : "add"}_${areaKey.data}`,
    entityType: "case",
    entityId: id.data,
  });

  if (row) redirect(`/cases/${id.data}?tab=${config.tab}`);
  refresh();
  return { savedAt: Date.now() };
}

export async function deleteFinanceAction(area: FinanceArea, caseId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const areaKey = areaSchema.safeParse(area);
  const id = uuid.safeParse(caseId);
  const row = uuid.safeParse(formData.get("rowId"));
  if (!areaKey.success || !id.success) redirect("/cases");
  const config = AREAS[areaKey.data];

  if (row.success) {
    const supabase = await createClient();
    await deleteFinanceRow(supabase, session.organization.id, config.table, id.data, row.data);
    const what = { income: "הכנסה", liability: "התחייבות", account: 'חשבון עו"ש' }[areaKey.data];
    await logSystemEvent(supabase, context(session), id.data, `נמחקה רשומת ${what}`);
    await recordAudit(supabase, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      action: `case.delete_${areaKey.data}`,
      entityType: "case",
      entityId: id.data,
    });
  }
  redirect(`/cases/${id.data}?tab=${config.tab}`);
}

/** Shows a full bank account number. Logged first; if logging fails, nothing is shown. */
export async function revealAccountNumberAction(accountId: string): Promise<RevealState> {
  const session = await requireSession();
  const id = uuid.safeParse(accountId);
  if (!id.success) return { error: "לא ניתן להציג" };

  const supabase = await createClient();
  const logged = await recordAudit(supabase, {
    organizationId: session.organization.id,
    actorId: session.user.id,
    action: "case.reveal_account_number",
    entityType: "bank_account",
    entityId: id.data,
  });
  if (!logged) return { error: "לא ניתן להציג כרגע. נסו שוב" };

  try {
    const number = await revealAccountNumber(supabase, session.organization.id, id.data);
    return number ? { value: number } : { error: "לא נמצא" };
  } catch (error) {
    console.error("reveal account failed", error instanceof Error ? error.name : "unknown");
    return { error: "לא ניתן להציג כרגע. נסו שוב" };
  }
}
