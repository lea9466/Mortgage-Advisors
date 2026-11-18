import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { MARITAL_STATUSES } from "@/lib/validation/client";
import {
  APARTMENT_CLASSES,
  CASE_STAGES,
  CLOSED_STAGES,
  HANDS,
  MORTGAGE_PURPOSES,
  PURPOSE_LABELS,
  parseCaseNumber,
  type CaseDetailsInput,
  type CaseStage,
  type MortgagePurpose,
} from "@/lib/validation/case";

const LIST_LIMIT = 100;
const nullableText = z.string().nullable();
const nullableAmount = z.number().int().nullable();

const borrowerClientSchema = z.object({
  id: z.uuid(),
  first_name: z.string(),
  last_name: z.string(),
  id_number_last4: nullableText,
  birth_date: nullableText,
  phone: nullableText,
  phone_receives_sms: z.boolean(),
  marital_status: z.enum(MARITAL_STATUSES).nullable(),
  children_birth_years: z.array(z.number().int()),
  city: nullableText,
  street: nullableText,
  house_number: nullableText,
});

/** PostgREST returns a to-one relation as an object, or as a one-item array in some setups. */
function toOne<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.array(schema).length(1).transform((items) => items[0] as z.infer<T>)]);
}

const caseSchema = z.object({
  id: z.uuid(),
  case_year: z.number().int(),
  case_seq: z.number().int(),
  purpose: z.enum(MORTGAGE_PURPOSES),
  stage: z.enum(CASE_STAGES),
  requested_amount: nullableAmount,
  property_value: nullableAmount,
  contract_price: nullableAmount,
  equity: nullableAmount,
  hand: z.enum(HANDS).nullable(),
  apartment_class: z.enum(APARTMENT_CLASSES).nullable(),
  updated_at: z.string(),
  case_borrowers: z.array(z.object({ position: z.number().int(), clients: toOne(borrowerClientSchema) })),
});

const listItemSchema = caseSchema
  .pick({ id: true, case_year: true, case_seq: true, purpose: true, stage: true, requested_amount: true, updated_at: true })
  .extend({
    case_borrowers: z.array(
      z.object({ position: z.number().int(), clients: toOne(z.object({ first_name: z.string(), last_name: z.string() })) }),
    ),
  });

export type CaseRecord = z.infer<typeof caseSchema>;
export type CaseBorrower = CaseRecord["case_borrowers"][number]["clients"];
export type CaseListItem = z.infer<typeof listItemSchema>;

const BORROWER_COLUMNS =
  "id, first_name, last_name, id_number_last4, birth_date, phone, phone_receives_sms, marital_status, children_birth_years, city, street, house_number";
const CASE_COLUMNS = `id, case_year, case_seq, purpose, stage, requested_amount, property_value, contract_price, equity, hand, apartment_class, updated_at, case_borrowers(position, clients(${BORROWER_COLUMNS}))`;
const LIST_COLUMNS =
  "id, case_year, case_seq, purpose, stage, requested_amount, updated_at, case_borrowers(position, clients(first_name, last_name))";

function sortBorrowers<T extends { position: number }>(borrowers: T[]): T[] {
  return [...borrowers].sort((a, b) => a.position - b.position);
}

/** "רכישת דירה · משפחת שטרן", from the purpose and the first borrower. */
export function caseTitle(purpose: MortgagePurpose, borrowers: { last_name: string }[]): string {
  const lastName = borrowers[0]?.last_name;
  return lastName ? `${PURPOSE_LABELS[purpose]} · משפחת ${lastName}` : PURPOSE_LABELS[purpose];
}

/** The property value shown on top of every case. For a purchase it is the contract price. */
export function shownPropertyValue(record: Pick<CaseRecord, "purpose" | "contract_price" | "property_value">) {
  return record.purpose === "purchase" ? record.contract_price : record.property_value;
}

export async function openCase(supabase: SupabaseClient, clientId: string, purpose: MortgagePurpose): Promise<string> {
  const { data, error } = await supabase.rpc("open_case", { p_purpose: purpose, p_client: clientId });
  if (error) throw new Error(`open case failed: ${error.code}`);
  return z.uuid().parse(data);
}

export async function getCase(supabase: SupabaseClient, organizationId: string, caseId: string): Promise<CaseRecord | null> {
  const { data, error } = await supabase
    .from("cases")
    .select(CASE_COLUMNS)
    .eq("id", caseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`case read failed: ${error.code}`);
  if (!data) return null;
  const record = caseSchema.parse(data);
  return { ...record, case_borrowers: sortBorrowers(record.case_borrowers) };
}

/** Cases by stage, and optionally by case number ("2026-007") or a borrower's name. */
export async function listCases(
  supabase: SupabaseClient,
  organizationId: string,
  filter: { q?: string; stage: CaseStage | "active" | "all" },
): Promise<CaseListItem[]> {
  let request = supabase
    .from("cases")
    .select(LIST_COLUMNS)
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (filter.stage === "active") request = request.not("stage", "in", `(${CLOSED_STAGES.join(",")})`);
  else if (filter.stage !== "all") request = request.eq("stage", filter.stage);

  const term = filter.q?.trim();
  if (term) {
    const number = parseCaseNumber(term);
    if (number) {
      request = request.eq("case_year", number.year).eq("case_seq", number.seq);
    } else {
      const caseIds = await caseIdsForBorrowerName(supabase, organizationId, term);
      if (caseIds.length === 0) return [];
      request = request.in("id", caseIds);
    }
  }

  const { data, error } = await request;
  if (error) throw new Error(`case list failed: ${error.code}`);
  return z
    .array(listItemSchema)
    .parse(data ?? [])
    .map((item) => ({ ...item, case_borrowers: sortBorrowers(item.case_borrowers) }));
}

async function caseIdsForBorrowerName(supabase: SupabaseClient, organizationId: string, term: string) {
  const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("full_name", pattern)
    .limit(200);
  if (error) throw new Error(`client lookup failed: ${error.code}`);
  const clientIds = z.array(z.object({ id: z.uuid() })).parse(clients ?? []).map((row) => row.id);
  if (clientIds.length === 0) return [];

  const { data: links, error: linkError } = await supabase
    .from("case_borrowers")
    .select("case_id")
    .eq("organization_id", organizationId)
    .in("client_id", clientIds)
    .limit(500);
  if (linkError) throw new Error(`borrower lookup failed: ${linkError.code}`);
  return [...new Set(z.array(z.object({ case_id: z.uuid() })).parse(links ?? []).map((row) => row.case_id))];
}

/** All cases a client appears in, newest first, for the client card. */
export async function listClientCases(supabase: SupabaseClient, organizationId: string, clientId: string) {
  const { data: links, error } = await supabase
    .from("case_borrowers")
    .select("case_id")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId);
  if (error) throw new Error(`client cases failed: ${error.code}`);
  const caseIds = z.array(z.object({ case_id: z.uuid() })).parse(links ?? []).map((row) => row.case_id);
  if (caseIds.length === 0) return [];

  const { data, error: caseError } = await supabase
    .from("cases")
    .select(LIST_COLUMNS)
    .eq("organization_id", organizationId)
    .in("id", caseIds)
    .order("created_at", { ascending: false });
  if (caseError) throw new Error(`client cases failed: ${caseError.code}`);
  return z.array(listItemSchema).parse(data ?? []);
}

export async function updateCaseDetails(
  supabase: SupabaseClient,
  organizationId: string,
  caseId: string,
  purpose: MortgagePurpose,
  input: CaseDetailsInput,
): Promise<void> {
  const isPurchase = purpose === "purchase";
  const { error } = await supabase
    .from("cases")
    .update({
      requested_amount: input.requestedAmount ?? null,
      property_value: isPurchase ? null : (input.propertyValue ?? null),
      contract_price: isPurchase ? (input.contractPrice ?? null) : null,
      equity: isPurchase ? (input.equity ?? null) : null,
      hand: isPurchase ? (input.hand ?? null) : null,
      apartment_class: isPurchase ? (input.apartmentClass ?? null) : null,
    })
    .eq("id", caseId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(`case update failed: ${error.code}`);
}

export async function updateCaseStage(supabase: SupabaseClient, organizationId: string, caseId: string, stage: CaseStage) {
  const { error } = await supabase.from("cases").update({ stage }).eq("id", caseId).eq("organization_id", organizationId);
  if (error) throw new Error(`stage update failed: ${error.code}`);
}

export async function addBorrower(supabase: SupabaseClient, organizationId: string, caseId: string, clientId: string) {
  const { count } = await supabase
    .from("case_borrowers")
    .select("*", { count: "exact", head: true })
    .eq("case_id", caseId);
  const { error } = await supabase
    .from("case_borrowers")
    .insert({ case_id: caseId, client_id: clientId, organization_id: organizationId, position: count ?? 0 });
  // 23505: already a borrower in this case, which is fine.
  if (error && error.code !== "23505") throw new Error(`add borrower failed: ${error.code}`);
}

export class BorrowerHasFinancesError extends Error {
  constructor() {
    super("The borrower still has incomes, liabilities or bank accounts in this case");
    this.name = "BorrowerHasFinancesError";
  }
}

export async function removeBorrower(supabase: SupabaseClient, organizationId: string, caseId: string, clientId: string) {
  const { error } = await supabase
    .from("case_borrowers")
    .delete()
    .eq("case_id", caseId)
    .eq("client_id", clientId)
    .eq("organization_id", organizationId);
  // 23503: financial rows still point at this borrower in this case.
  if (error?.code === "23503") throw new BorrowerHasFinancesError();
  if (error) throw new Error(`remove borrower failed: ${error.code}`);
}
