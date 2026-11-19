import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { decryptField } from "@/lib/crypto/fieldEncryption";
import { requireEnv } from "@/lib/env";
import { familyChildren, getChildrenOf } from "@/lib/clients/family";
import { getCase, type CaseBorrower, type CaseRecord } from "./cases";
import { getCaseFinances, type IncomeRecord, type LiabilityRecord } from "./finances";

export type ReportBorrower = CaseBorrower & { idNumber: string | null };

/** Borrowers who are spouses in this case share one family block, so their children print once. */
export type ReportFamily = { members: ReportBorrower[]; childBirthYears: number[] };

export type BankReport = {
  record: CaseRecord;
  families: ReportFamily[];
  incomes: IncomeRecord[];
  liabilities: LiabilityRecord[];
};

/**
 * Everything the bank report shows. It includes full ID numbers, so the caller
 * must record the report in the audit log.
 */
export async function buildBankReport(
  supabase: SupabaseClient,
  organizationId: string,
  caseId: string,
): Promise<BankReport | null> {
  const record = await getCase(supabase, organizationId, caseId);
  if (!record) return null;
  const borrowers = record.case_borrowers.map((link) => link.clients);
  const ids = borrowers.map((borrower) => borrower.id);

  const [finances, children, encrypted] = await Promise.all([
    getCaseFinances(supabase, organizationId, caseId),
    getChildrenOf(supabase, organizationId, ids),
    supabase.from("clients").select("id, id_number_encrypted").eq("organization_id", organizationId).in("id", ids),
  ]);
  if (encrypted.error) throw new Error(`report ids failed: ${encrypted.error.code}`);

  const key = requireEnv("FIELD_ENCRYPTION_KEY");
  const idRows = z.array(z.object({ id: z.uuid(), id_number_encrypted: z.string().nullable() })).parse(encrypted.data ?? []);
  const idNumbers = new Map(idRows.map((row) => [row.id, row.id_number_encrypted ? decryptField(row.id_number_encrypted, key) : null]));

  const withIds: ReportBorrower[] = borrowers.map((borrower) => ({ ...borrower, idNumber: idNumbers.get(borrower.id) ?? null }));

  // Pair spouses who are both borrowers; everyone else is a family of one.
  const families: ReportFamily[] = [];
  const placed = new Set<string>();
  for (const borrower of withIds) {
    if (placed.has(borrower.id)) continue;
    const spouse = withIds.find((other) => other.id === borrower.spouse_id && !placed.has(other.id));
    const members = spouse ? [borrower, spouse] : [borrower];
    members.forEach((member) => placed.add(member.id));
    families.push({
      members,
      childBirthYears: familyChildren(members.map((member) => children.get(member.id) ?? { shared: [], personal: [] })),
    });
  }

  return { record, families, incomes: finances.incomes, liabilities: finances.liabilities };
}
