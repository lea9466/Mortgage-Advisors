import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { decryptField, encryptField } from "@/lib/crypto/fieldEncryption";
import { requireEnv } from "@/lib/env";
import {
  ACCOUNT_BANKS,
  INCOME_KINDS,
  LIABILITY_KINDS,
  type BankAccountInput,
  type IncomeInput,
  type LiabilityInput,
} from "@/lib/validation/finance";

const incomeRow = z.object({
  id: z.uuid(),
  client_id: z.uuid(),
  kind: z.enum(INCOME_KINDS),
  title: z.string(),
  job_title: z.string().nullable(),
  seniority_months: z.number().int().nullable(),
  monthly_amount: z.number().int(),
});
const liabilityRow = z.object({
  id: z.uuid(),
  client_id: z.uuid(),
  kind: z.enum(LIABILITY_KINDS),
  lender: z.string().nullable(),
  balance: z.number().int().nullable(),
  monthly_payment: z.number().int(),
  remaining_months: z.number().int().nullable(),
});
const accountRow = z.object({
  id: z.uuid(),
  client_id: z.uuid(),
  bank: z.enum(ACCOUNT_BANKS),
  branch: z.string().nullable(),
  account_last4: z.string(),
  is_joint: z.boolean(),
});

export type IncomeRecord = z.infer<typeof incomeRow>;
export type LiabilityRecord = z.infer<typeof liabilityRow>;
export type BankAccountRecord = z.infer<typeof accountRow>;
export type CaseFinances = { incomes: IncomeRecord[]; liabilities: LiabilityRecord[]; accounts: BankAccountRecord[] };

type Context = { organizationId: string; userId: string };
type Table = "case_incomes" | "case_liabilities" | "case_bank_accounts";

/** All financial rows of a case, oldest first so each borrower's list keeps its order. */
export async function getCaseFinances(supabase: SupabaseClient, organizationId: string, caseId: string): Promise<CaseFinances> {
  const scoped = (table: Table, columns: string) =>
    supabase.from(table).select(columns).eq("organization_id", organizationId).eq("case_id", caseId).order("created_at");

  const [incomes, liabilities, accounts] = await Promise.all([
    scoped("case_incomes", "id, client_id, kind, title, job_title, seniority_months, monthly_amount"),
    scoped("case_liabilities", "id, client_id, kind, lender, balance, monthly_payment, remaining_months"),
    scoped("case_bank_accounts", "id, client_id, bank, branch, account_last4, is_joint"),
  ]);
  const failed = incomes.error ?? liabilities.error ?? accounts.error;
  if (failed) throw new Error(`finances read failed: ${failed.code}`);

  return {
    incomes: z.array(incomeRow).parse(incomes.data ?? []),
    liabilities: z.array(liabilityRow).parse(liabilities.data ?? []),
    accounts: z.array(accountRow).parse(accounts.data ?? []),
  };
}

export function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function incomeColumns(input: IncomeInput) {
  return {
    client_id: input.clientId,
    kind: input.kind,
    title: input.title,
    job_title: input.jobTitle ?? null,
    seniority_months: input.seniorityMonths ?? null,
    monthly_amount: input.monthlyAmount,
  };
}

function liabilityColumns(input: LiabilityInput) {
  return {
    client_id: input.clientId,
    kind: input.kind,
    lender: input.lender ?? null,
    balance: input.balance ?? null,
    monthly_payment: input.monthlyPayment,
    remaining_months: input.remainingMonths ?? null,
  };
}

/** Bank account columns. Without a new account number the stored one is kept. */
function accountColumns(input: BankAccountInput) {
  const number = input.accountNumber
    ? { account_number_encrypted: encryptField(input.accountNumber, requireEnv("FIELD_ENCRYPTION_KEY")), account_last4: input.accountNumber.slice(-4) }
    : {};
  return { client_id: input.clientId, bank: input.bank, branch: input.branch ?? null, is_joint: input.isJoint, ...number };
}

const COLUMN_BUILDERS = {
  case_incomes: (input: IncomeInput) => incomeColumns(input),
  case_liabilities: (input: LiabilityInput) => liabilityColumns(input),
  case_bank_accounts: (input: BankAccountInput) => accountColumns(input),
};
type Inputs = { case_incomes: IncomeInput; case_liabilities: LiabilityInput; case_bank_accounts: BankAccountInput };

export async function insertFinanceRow<T extends Table>(
  supabase: SupabaseClient,
  context: Context,
  table: T,
  caseId: string,
  input: Inputs[T],
): Promise<void> {
  const columns = (COLUMN_BUILDERS[table] as (value: Inputs[T]) => Record<string, unknown>)(input);
  const { error } = await supabase
    .from(table)
    .insert({ ...columns, organization_id: context.organizationId, case_id: caseId, created_by: context.userId });
  if (error) throw new Error(`${table} insert failed: ${error.code}`);
}

export async function updateFinanceRow<T extends Table>(
  supabase: SupabaseClient,
  organizationId: string,
  table: T,
  caseId: string,
  rowId: string,
  input: Inputs[T],
): Promise<void> {
  const columns = (COLUMN_BUILDERS[table] as (value: Inputs[T]) => Record<string, unknown>)(input);
  const { error } = await supabase
    .from(table)
    .update(columns)
    .eq("id", rowId)
    .eq("case_id", caseId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(`${table} update failed: ${error.code}`);
}

export async function deleteFinanceRow(supabase: SupabaseClient, organizationId: string, table: Table, caseId: string, rowId: string) {
  const { error } = await supabase.from(table).delete().eq("id", rowId).eq("case_id", caseId).eq("organization_id", organizationId);
  if (error) throw new Error(`${table} delete failed: ${error.code}`);
}

/** Decrypts one bank account number. The caller writes the reveal to the audit log first. */
export async function revealAccountNumber(supabase: SupabaseClient, organizationId: string, accountId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("case_bank_accounts")
    .select("account_number_encrypted")
    .eq("id", accountId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`account read failed: ${error.code}`);
  const parsed = z.object({ account_number_encrypted: z.string() }).safeParse(data);
  return parsed.success ? decryptField(parsed.data.account_number_encrypted, requireEnv("FIELD_ENCRYPTION_KEY")) : null;
}
