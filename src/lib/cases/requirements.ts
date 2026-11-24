import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/lib/validation/document";
import { BASE_REQUIREMENTS, REQUIREMENT_STATUSES, type RequirementUpdate } from "@/lib/validation/requirement";

type Context = { organizationId: string; userId: string };

const templateSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  category: z.enum(DOCUMENT_CATEGORIES),
  per_borrower: z.boolean(),
});
export type RequirementTemplate = z.infer<typeof templateSchema>;

const caseRequirementSchema = z.object({
  id: z.uuid(),
  client_id: z.uuid().nullable(),
  template_key: z.string(),
  title: z.string(),
  category: z.enum(DOCUMENT_CATEGORIES),
  status: z.enum(REQUIREMENT_STATUSES),
  note: z.string().nullable(),
  document_id: z.uuid().nullable(),
});
export type CaseRequirement = z.infer<typeof caseRequirementSchema>;

/** The adviser's own items, in the order they were added. */
export async function listTemplates(supabase: SupabaseClient, organizationId: string): Promise<RequirementTemplate[]> {
  const { data, error } = await supabase
    .from("document_requirements")
    .select("id, title, category, per_borrower")
    .eq("organization_id", organizationId)
    .order("created_at");
  if (error) throw new Error(`requirement templates failed: ${error.code}`);
  return z.array(templateSchema).parse(data ?? []);
}

export async function addTemplate(
  supabase: SupabaseClient,
  context: Context,
  input: { title: string; category: DocumentCategory; perBorrower: boolean },
): Promise<void> {
  const { error } = await supabase.from("document_requirements").insert({
    organization_id: context.organizationId,
    title: input.title,
    category: input.category,
    per_borrower: input.perBorrower,
    created_by: context.userId,
  });
  if (error) throw new Error(`requirement template insert failed: ${error.code}`);
}

export async function deleteTemplate(supabase: SupabaseClient, organizationId: string, id: string): Promise<void> {
  const { error } = await supabase.from("document_requirements").delete().eq("organization_id", organizationId).eq("id", id);
  if (error) throw new Error(`requirement template delete failed: ${error.code}`);
}

type Row = { client_id: string | null; template_key: string; title: string; category: DocumentCategory };

/** Every item a case should have: the basic list and the adviser's items, once per borrower where needed. */
function expectedRows(borrowerIds: readonly string[], templates: readonly RequirementTemplate[]): Row[] {
  const items = [
    ...BASE_REQUIREMENTS.map((item) => ({ key: `base:${item.key}`, title: item.title, category: item.category, perBorrower: item.perBorrower })),
    ...templates.map((item) => ({ key: `custom:${item.id}`, title: item.title, category: item.category, perBorrower: item.per_borrower })),
  ];
  return items.flatMap((item): Row[] =>
    item.perBorrower
      ? borrowerIds.map((clientId) => ({ client_id: clientId, template_key: item.key, title: item.title, category: item.category }))
      : [{ client_id: null, template_key: item.key, title: item.title, category: item.category }],
  );
}

const rowKey = (row: { client_id: string | null; template_key: string }) => `${row.client_id ?? "case"}|${row.template_key}`;

/**
 * The case's list, after adding any items it does not have yet (a new
 * borrower, or an item the adviser added in the settings). Items marked "not
 * needed" stay, so they are not added again.
 */
export async function getCaseRequirements(
  supabase: SupabaseClient,
  context: Context,
  caseId: string,
  options: { borrowerIds: readonly string[]; addMissing: boolean },
): Promise<CaseRequirement[]> {
  const existing = await listCaseRequirements(supabase, context.organizationId, caseId);
  if (!options.addMissing) return existing;

  const have = new Set(existing.map(rowKey));
  const missing = expectedRows(options.borrowerIds, await listTemplates(supabase, context.organizationId)).filter((row) => !have.has(rowKey(row)));
  if (missing.length === 0) return existing;

  const { error } = await supabase
    .from("case_requirements")
    .insert(missing.map((row) => ({ ...row, organization_id: context.organizationId, case_id: caseId, updated_by: context.userId })));
  // 23505: another tab added the same items a moment ago. The list below has them.
  if (error && error.code !== "23505") throw new Error(`case requirements insert failed: ${error.code}`);
  return listCaseRequirements(supabase, context.organizationId, caseId);
}

async function listCaseRequirements(supabase: SupabaseClient, organizationId: string, caseId: string): Promise<CaseRequirement[]> {
  const { data, error } = await supabase
    .from("case_requirements")
    .select("id, client_id, template_key, title, category, status, note, document_id")
    .eq("organization_id", organizationId)
    .eq("case_id", caseId)
    .order("created_at")
    .order("title");
  if (error) throw new Error(`case requirements failed: ${error.code}`);
  return z.array(caseRequirementSchema).parse(data ?? []);
}

/** An item for this case only, for one borrower or the whole case. */
export async function addCaseRequirement(
  supabase: SupabaseClient,
  context: Context,
  caseId: string,
  input: { title: string; category: DocumentCategory; clientId?: string },
): Promise<void> {
  const { error } = await supabase.from("case_requirements").insert({
    organization_id: context.organizationId,
    case_id: caseId,
    client_id: input.clientId ?? null,
    template_key: `manual:${crypto.randomUUID()}`,
    title: input.title,
    category: input.category,
    updated_by: context.userId,
  });
  if (error) throw new Error(`case requirement insert failed: ${error.code}`);
}

/** Changes an item's status, note and linked document. Returns its title, for the case log. */
export async function updateCaseRequirement(
  supabase: SupabaseClient,
  context: Context,
  caseId: string,
  id: string,
  input: RequirementUpdate,
): Promise<{ title: string } | null> {
  const { data, error } = await supabase
    .from("case_requirements")
    .update({ status: input.status, note: input.note || null, document_id: input.documentId, updated_by: context.userId })
    .eq("organization_id", context.organizationId)
    .eq("case_id", caseId)
    .eq("id", id)
    .select("title")
    .maybeSingle();
  if (error) throw new Error(`case requirement update failed: ${error.code}`);
  return data ? z.object({ title: z.string() }).parse(data) : null;
}
