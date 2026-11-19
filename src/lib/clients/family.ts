import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const childRow = z.object({ client_id: z.uuid(), birth_year: z.number().int(), shared: z.boolean() });
const spouseRow = z.object({ id: z.uuid(), spouse_id: z.uuid().nullable() });

export type ClientChildren = {
  /** Shared with the spouse: this client's shared children plus the spouse's. */
  shared: number[];
  /** This client's own, not shared with the spouse. */
  personal: number[];
};

export type Spouse = { id: string; first_name: string; last_name: string };

export class SpouseLinkError extends Error {
  constructor(readonly reason: "taken" | "invalid") {
    super(`spouse link refused: ${reason}`);
    this.name = "SpouseLinkError";
  }
}

/**
 * Children of several clients at once, as birth years. Each child belongs to
 * the client who entered it; a client also sees their spouse's shared children.
 */
export async function getChildrenOf(
  supabase: SupabaseClient,
  organizationId: string,
  clientIds: string[],
): Promise<Map<string, ClientChildren>> {
  const result = new Map<string, ClientChildren>(clientIds.map((id) => [id, { shared: [], personal: [] }]));
  if (clientIds.length === 0) return result;

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, spouse_id")
    .eq("organization_id", organizationId)
    .in("id", clientIds);
  if (error) throw new Error(`spouse read failed: ${error.code}`);
  const spouses = z.array(spouseRow).parse(clients ?? []);
  const owners = [...new Set([...clientIds, ...spouses.map((row) => row.spouse_id).filter((id): id is string => id !== null)])];

  const { data: children, error: childError } = await supabase
    .from("client_children")
    .select("client_id, birth_year, shared")
    .eq("organization_id", organizationId)
    .in("client_id", owners)
    .order("birth_year", { ascending: false });
  if (childError) throw new Error(`children read failed: ${childError.code}`);
  const rows = z.array(childRow).parse(children ?? []);

  for (const client of spouses) {
    const entry = result.get(client.id);
    if (!entry) continue;
    entry.shared = rows
      .filter((row) => row.shared && (row.client_id === client.id || row.client_id === client.spouse_id))
      .map((row) => row.birth_year);
    entry.personal = rows.filter((row) => !row.shared && row.client_id === client.id).map((row) => row.birth_year);
  }
  return result;
}

export async function getSpouse(supabase: SupabaseClient, organizationId: string, clientId: string): Promise<Spouse | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("spouse:spouse_id(id, first_name, last_name)")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`spouse read failed: ${error.code}`);
  const spouseSchema = z.object({ id: z.uuid(), first_name: z.string(), last_name: z.string() });
  const parsed = z
    .object({ spouse: z.union([spouseSchema, z.array(spouseSchema).max(1).transform((items) => items[0] ?? null)]).nullable() })
    .safeParse(data);
  return parsed.success ? parsed.data.spouse : null;
}

/** Saves the children from one client's form; shared ones replace the family's shared children. */
export async function setClientChildren(supabase: SupabaseClient, clientId: string, children: ClientChildren): Promise<void> {
  const { error } = await supabase.rpc("set_client_children", {
    p_client: clientId,
    p_shared: children.shared,
    p_personal: children.personal,
  });
  if (error) throw new Error(`children save failed: ${error.code}`);
}

export async function linkSpouses(supabase: SupabaseClient, clientId: string, spouseId: string): Promise<void> {
  const { error } = await supabase.rpc("link_spouses", { p_client: clientId, p_spouse: spouseId });
  if (error?.code === "23505") throw new SpouseLinkError("taken");
  if (error?.code === "22023") throw new SpouseLinkError("invalid");
  if (error) throw new Error(`spouse link failed: ${error.code}`);
}

/** Unlinks spouses; each keeps a copy of the children they shared. */
export async function unlinkSpouse(supabase: SupabaseClient, clientId: string): Promise<void> {
  const { error } = await supabase.rpc("unlink_spouse", { p_client: clientId });
  if (error) throw new Error(`spouse unlink failed: ${error.code}`);
}

/** All children of one family once: both spouses see the same shared children. */
export function familyChildren(members: ClientChildren[]): number[] {
  const shared = members[0]?.shared ?? [];
  return [...shared, ...members.flatMap((member) => member.personal)].sort((a, b) => b - a);
}
