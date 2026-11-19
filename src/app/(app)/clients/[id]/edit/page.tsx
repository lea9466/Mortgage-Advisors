import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientForm } from "@/components/clients/ClientForm";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { requireSession } from "@/lib/auth/session";
import { getClientRecord, type ClientRecord } from "@/lib/clients/clients";
import { getChildrenOf, getSpouse, type ClientChildren } from "@/lib/clients/family";
import { maskedIdNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { clientIdSchema, type ClientFormValues } from "@/lib/validation/client";
import { updateClientAction } from "../../actions";
import styles from "../../clients.module.css";

export const metadata: Metadata = { title: "עריכת לקוח" };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const id = clientIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const client = await getClientRecord(supabase, session.organization.id, id.data);
  if (!client) notFound();
  const [children, spouse] = await Promise.all([
    getChildrenOf(supabase, session.organization.id, [client.id]),
    getSpouse(supabase, session.organization.id, client.id),
  ]);

  const cardHref = `/clients/${client.id}`;
  return (
    <div className={styles.page}>
      <PageHeader
        title={`עריכת ${client.first_name} ${client.last_name}`}
        back={{ href: cardHref, label: "חזרה לכרטיס" }}
      />
      <ClientForm
        action={updateClientAction.bind(null, client.id)}
        initialValues={toFormValues(client, children.get(client.id) ?? { shared: [], personal: [] })}
        submitLabel="שמירת שינויים"
        cancelHref={cardHref}
        storedIdNumber={client.id_number_last4 ? maskedIdNumber(client.id_number_last4) : undefined}
        family={spouse ? { clientName: client.first_name, spouseName: spouse.first_name } : undefined}
      />
    </div>
  );
}

/** The stored record as form defaults. The ID number is never sent back to the form. */
function toFormValues(client: ClientRecord, children: ClientChildren): ClientFormValues {
  const year = new Date().getFullYear();
  const optional = (value: string | null) => value ?? undefined;
  const asRows = (birthYears: number[], personal: boolean) =>
    birthYears.map((birthYear) => ({ age: String(year - birthYear), personal }));
  return {
    firstName: client.first_name,
    lastName: client.last_name,
    idIssueDate: optional(client.id_issue_date),
    idExpiryDate: optional(client.id_expiry_date),
    birthDate: optional(client.birth_date),
    phone: optional(client.phone),
    phoneReceivesSms: client.phone_receives_sms,
    phoneAlt: optional(client.phone_alt),
    email: optional(client.email),
    maritalStatus: optional(client.marital_status),
    hasOtherCitizenship: client.has_other_citizenship,
    otherCitizenship: optional(client.other_citizenship),
    city: optional(client.city),
    street: optional(client.street),
    houseNumber: optional(client.house_number),
    children: [...asRows(children.shared, false), ...asRows(children.personal, true)],
  };
}
