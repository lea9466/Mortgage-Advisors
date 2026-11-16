import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const auditEventSchema = z.object({
  organizationId: z.uuid(),
  actorId: z.uuid(),
  action: z.string().trim().min(1).max(80),
  entityType: z.string().trim().min(1).max(80).optional(),
  entityId: z.string().trim().min(1).max(80).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

/**
 * Appends one entry to the audit log (who did what, to which record, when).
 * Never put personal data in metadata: record ids only, not names or ID numbers.
 * Returns false when the entry could not be written, so the caller can decide
 * whether to stop a sensitive action.
 */
export async function recordAudit(supabase: SupabaseClient, event: AuditEvent): Promise<boolean> {
  const parsed = auditEventSchema.safeParse(event);
  if (!parsed.success) {
    console.error("audit event rejected", parsed.error.issues[0]?.path.join("."));
    return false;
  }
  const { organizationId, actorId, action, entityType, entityId, metadata } = parsed.data;
  const { error } = await supabase.from("audit_log").insert({
    organization_id: organizationId,
    actor_id: actorId,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    metadata: metadata ?? {},
  });
  if (error) {
    console.error("audit insert failed", error.code);
    return false;
  }
  return true;
}
