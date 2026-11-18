import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { blindIndex, decryptField, encryptField } from "@/lib/crypto/fieldEncryption";
import { requireEnv } from "@/lib/env";
import type { ClientInput } from "@/lib/validation/client";
import { MARITAL_STATUSES } from "@/lib/validation/client";
import { canonicalIsraeliId, isValidIsraeliId } from "@/lib/validation/israeliId";

const LIST_LIMIT = 50;

const CLIENT_COLUMNS =
  "id, first_name, last_name, id_number_last4, id_issue_date, id_expiry_date, birth_date, phone, phone_receives_sms, phone_alt, email, marital_status, has_other_citizenship, other_citizenship, children_birth_years, city, street, house_number, created_at, updated_at";

const LIST_COLUMNS = "id, first_name, last_name, id_number_last4, birth_date, phone, city";

const nullableText = z.string().nullable();

const clientRowSchema = z.object({
  id: z.uuid(),
  first_name: z.string(),
  last_name: z.string(),
  id_number_last4: nullableText,
  id_issue_date: nullableText,
  id_expiry_date: nullableText,
  birth_date: nullableText,
  phone: nullableText,
  phone_receives_sms: z.boolean(),
  phone_alt: nullableText,
  email: nullableText,
  marital_status: z.enum(MARITAL_STATUSES).nullable(),
  has_other_citizenship: z.boolean(),
  other_citizenship: nullableText,
  children_birth_years: z.array(z.number().int()),
  city: nullableText,
  street: nullableText,
  house_number: nullableText,
  created_at: z.string(),
  updated_at: z.string(),
});

const listRowSchema = clientRowSchema.pick({
  id: true,
  first_name: true,
  last_name: true,
  id_number_last4: true,
  birth_date: true,
  phone: true,
  city: true,
});

export type ClientRecord = z.infer<typeof clientRowSchema>;
export type ClientListItem = z.infer<typeof listRowSchema>;

export class DuplicateIdNumberError extends Error {
  constructor() {
    super("A client with this ID number already exists");
    this.name = "DuplicateIdNumberError";
  }
}

function idNumberScope(organizationId: string) {
  return `client.id_number:${organizationId}`;
}

/** Encrypted ID columns, or nothing when no ID number was given. */
function idNumberColumns(organizationId: string, idNumber: string | undefined) {
  if (!idNumber) return {};
  return {
    id_number_encrypted: encryptField(idNumber, requireEnv("FIELD_ENCRYPTION_KEY")),
    id_number_index: blindIndex(idNumber, idNumberScope(organizationId), requireEnv("BLIND_INDEX_KEY")),
    id_number_last4: idNumber.slice(-4),
  };
}

function toColumns(input: ClientInput, now: Date) {
  const year = now.getFullYear();
  return {
    first_name: input.firstName,
    last_name: input.lastName,
    id_issue_date: input.idIssueDate ?? null,
    id_expiry_date: input.idExpiryDate ?? null,
    birth_date: input.birthDate ?? null,
    phone: input.phone,
    phone_receives_sms: input.phoneReceivesSms,
    phone_alt: input.phoneAlt ?? null,
    email: input.email ?? null,
    marital_status: input.maritalStatus ?? null,
    has_other_citizenship: input.hasOtherCitizenship,
    other_citizenship: input.hasOtherCitizenship ? (input.otherCitizenship ?? null) : null,
    // Ages are stored as birth years so they stay correct as time passes.
    children_birth_years: input.childrenAges.map((age) => year - age),
    city: input.city ?? null,
    street: input.street ?? null,
    house_number: input.houseNumber ?? null,
  };
}

export async function createClientRecord(
  supabase: SupabaseClient,
  context: { organizationId: string; userId: string },
  input: ClientInput,
): Promise<string> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      organization_id: context.organizationId,
      created_by: context.userId,
      ...toColumns(input, new Date()),
      ...idNumberColumns(context.organizationId, input.idNumber),
    })
    .select("id")
    .single();

  if (error?.code === "23505") throw new DuplicateIdNumberError();
  if (error || !data) throw new Error(`client insert failed: ${error?.code ?? "no row"}`);
  return z.object({ id: z.uuid() }).parse(data).id;
}

/** Updates a client. An empty ID number keeps the one already stored. */
export async function updateClientRecord(
  supabase: SupabaseClient,
  context: { organizationId: string },
  clientId: string,
  input: ClientInput,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("clients")
    .update({
      ...toColumns(input, new Date()),
      ...idNumberColumns(context.organizationId, input.idNumber),
    })
    .eq("id", clientId)
    .eq("organization_id", context.organizationId)
    .select("id");

  if (error?.code === "23505") throw new DuplicateIdNumberError();
  if (error) throw new Error(`client update failed: ${error.code}`);
  return (data ?? []).length === 1;
}

export async function getClientRecord(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string,
): Promise<ClientRecord | null> {
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`client read failed: ${error.code}`);
  if (!data) return null;
  return clientRowSchema.parse(data);
}

/** Escapes the wildcard characters of a LIKE pattern. */
function likeContains(term: string) {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Finds clients by name (partial match) or by ID number (exact match through
 * the fingerprint, since the number itself is encrypted).
 */
export async function searchClients(
  supabase: SupabaseClient,
  organizationId: string,
  query: string | undefined,
): Promise<ClientListItem[]> {
  let request = supabase
    .from("clients")
    .select(LIST_COLUMNS)
    .eq("organization_id", organizationId)
    .order("last_name")
    .order("first_name")
    .limit(LIST_LIMIT);

  const term = query?.trim();
  if (term) {
    const digits = term.replace(/[\s-]/g, "");
    if (/^\d+$/.test(digits)) {
      if (!isValidIsraeliId(digits)) return [];
      const index = blindIndex(
        canonicalIsraeliId(digits),
        idNumberScope(organizationId),
        requireEnv("BLIND_INDEX_KEY"),
      );
      request = request.eq("id_number_index", index);
    } else {
      request = request.ilike("full_name", likeContains(term));
    }
  }

  const { data, error } = await request;
  if (error) throw new Error(`client search failed: ${error.code}`);
  return z.array(listRowSchema).parse(data ?? []);
}

/** Decrypts one client's ID number. The caller records the reveal in the audit log. */
export async function revealClientIdNumber(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("id_number_encrypted")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`client read failed: ${error.code}`);
  const parsed = z.object({ id_number_encrypted: z.string().nullable() }).safeParse(data);
  if (!parsed.success || !parsed.data.id_number_encrypted) return null;
  return decryptField(parsed.data.id_number_encrypted, requireEnv("FIELD_ENCRYPTION_KEY"));
}
