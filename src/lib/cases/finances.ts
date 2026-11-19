import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { decryptField, encryptField } from "@/lib/crypto/fieldEncryption";
import { requireEnv } from "@/lib/env";
import { MORTGAGE_PURPOSES, type MortgagePurpose } from "@/lib/validation/case";
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

export type PreviousIncomes = {
  clientId: string;
  sourceCaseId: string;
  sourceCase: { year: number; seq: number; purpose: MortgagePurpose };
  count: number;
};

/**
 * For each borrower, the most recent other case in which they have incomes.
 * Used to offer "copy incomes from the previous case" (incomes only: old
 * liabilities are usually no longer relevant, as the adviser decided).
 */
export async function findPreviousIncomes(
  supabase: SupabaseClient,
  organizationId: string,
  caseId: string,
  clientIds: string[],
): Promise<PreviousIncomes[]> {
  if (clientIds.length === 0) return [];
  const { data, error } = await supabase
    .from("case_incomes")
    .select("client_id, case_id, cases(case_year, case_seq, purpose, created_at)")
    .eq("organization_id", organizationId)
    .neq("case_id", caseId)
    .in("client_id", clientIds);
  if (error) throw new Error(`previous incomes failed: ${error.code}`);

  const caseInfo = z.object({
    case_year: z.number().int(),
    case_seq: z.number().int(),
    purpose: z.enum(MORTGAGE_PURPOSES),
    created_at: z.string(),
  });
  const rows = z
    .array(
      z.object({
        client_id: z.uuid(),
        case_id: z.uuid(),
        cases: z.union([caseInfo, z.array(caseInfo).length(1).transform((items) => items[0] as z.infer<typeof caseInfo>)]),
      }),
    )
    .parse(data ?? []);

  const latest = new Map<string, PreviousIncomes & { createdAt: string }>();
  for (const row of rows) {
    const current = latest.get(row.client_id);
    if (current && current.sourceCaseId === row.case_id) {
      current.count += 1;
    } else if (!current || row.cases.created_at > current.createdAt) {
      latest.set(row.client_id, {
        clientId: row.client_id,
        sourceCaseId: row.case_id,
        sourceCase: { year: row.cases.case_year, seq: row.cases.case_seq, purpose: row.cases.purpose },
        count: 1,
        createdAt: row.cases.created_at,
      });
    }
  }
  return [...latest.values()].map(({ createdAt: _createdAt, ...item }) => item);
}

/** Copies one borrower's incomes from an earlier case into this one. Returns how many were copied. */
export async function copyIncomes(
  supabase: SupabaseClient,
  context: Context,
  caseId: string,
  clientId: string,
  sourceCaseId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("case_incomes")
    .select("id, client_id, kind, title, job_title, seniority_months, monthly_amount")
    .eq("organization_id", context.organizationId)
    .eq("case_id", sourceCaseId)
    .eq("client_id", clientId)
    .order("created_at");
  if (error) throw new Error(`incomes read failed: ${error.code}`);
  const incomes = z.array(incomeRow).parse(data ?? []);
  if (incomes.length === 0) return 0;

  const { error: insertError } = await supabase.from("case_incomes").insert(
    incomes.map((income) => ({
      organization_id: context.organizationId,
      case_id: caseId,
      client_id: clientId,
      created_by: context.userId,
      kind: income.kind,
      title: income.title,
      job_title: income.job_title,
      seniority_months: income.seniority_months,
      monthly_amount: income.monthly_amount,
    })),
  );
  if (insertError) throw new Error(`incomes copy failed: ${insertError.code}`);
  return incomes.length;
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
