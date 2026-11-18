import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { BANKS, MORTGAGE_PURPOSES, type Bank } from "@/lib/validation/case";

const sourceCaseSchema = z.object({
  id: z.uuid(),
  case_year: z.number().int(),
  case_seq: z.number().int(),
  purpose: z.enum(MORTGAGE_PURPOSES),
});

const insightSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  bank: z.enum(BANKS).nullable(),
  created_at: z.string(),
  source_case_id: z.uuid().nullable(),
  cases: z.union([sourceCaseSchema, z.array(sourceCaseSchema).max(1).transform((items) => items[0] ?? null)]).nullable(),
});

export type InsightRecord = z.infer<typeof insightSchema>;

export async function createInsight(
  supabase: SupabaseClient,
  context: { organizationId: string; userId: string },
  input: { body: string; bank?: Bank; sourceCaseId: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("insights")
    .insert({
      organization_id: context.organizationId,
      created_by: context.userId,
      body: input.body,
      bank: input.bank ?? null,
      source_case_id: input.sourceCaseId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insight insert failed: ${error?.code ?? "no row"}`);
  return z.object({ id: z.uuid() }).parse(data).id;
}

export async function listInsights(
  supabase: SupabaseClient,
  organizationId: string,
  filter: { q?: string; bank?: Bank },
): Promise<InsightRecord[]> {
  let request = supabase
    .from("insights")
    .select("id, body, bank, created_at, source_case_id, cases(id, case_year, case_seq, purpose)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.bank) request = request.eq("bank", filter.bank);
  const term = filter.q?.trim();
  if (term) request = request.ilike("body", `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);

  const { data, error } = await request;
  if (error) throw new Error(`insight list failed: ${error.code}`);
  return z.array(insightSchema).parse(data ?? []);
}

export async function deleteInsight(supabase: SupabaseClient, organizationId: string, insightId: string) {
  const { error } = await supabase.from("insights").delete().eq("id", insightId).eq("organization_id", organizationId);
  if (error) throw new Error(`insight delete failed: ${error.code}`);
}
