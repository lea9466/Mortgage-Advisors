import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LOG_KINDS, type AnyLogKind } from "@/lib/validation/case";

const entrySchema = z.object({
  id: z.uuid(),
  kind: z.enum([...LOG_KINDS, "system"]),
  body: z.string(),
  created_at: z.string(),
});
export type LogEntry = z.infer<typeof entrySchema>;

type Context = { organizationId: string; userId: string };

export async function addLogEntry(
  supabase: SupabaseClient,
  context: Context,
  caseId: string,
  entry: { kind: AnyLogKind; body: string },
): Promise<void> {
  const { error } = await supabase.from("case_log").insert({
    organization_id: context.organizationId,
    case_id: caseId,
    created_by: context.userId,
    kind: entry.kind,
    body: entry.body.slice(0, 4000),
  });
  if (error) throw new Error(`log insert failed: ${error.code}`);
}

/**
 * Records something the app did in a case (stage change, borrower added).
 * A failure here must not undo the action itself, so it is only reported.
 */
export async function logSystemEvent(supabase: SupabaseClient, context: Context, caseId: string, body: string) {
  try {
    await addLogEntry(supabase, context, caseId, { kind: "system", body });
  } catch (error) {
    console.error("system log failed", error instanceof Error ? error.message : "unknown");
  }
}

/** A case's log, newest first, optionally filtered by words and a start date. */
export async function listLog(
  supabase: SupabaseClient,
  organizationId: string,
  caseId: string,
  filter: { q?: string; from?: string },
): Promise<LogEntry[]> {
  let request = supabase
    .from("case_log")
    .select("id, kind, body, created_at")
    .eq("organization_id", organizationId)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(200);

  const term = filter.q?.trim();
  if (term) request = request.ilike("body", `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
  // Dates are entered in Israel time; the start of that day in UTC is close enough for a filter.
  if (filter.from) request = request.gte("created_at", `${filter.from}T00:00:00+02:00`);

  const { data, error } = await request;
  if (error) throw new Error(`log read failed: ${error.code}`);
  return z.array(entrySchema).parse(data ?? []);
}
