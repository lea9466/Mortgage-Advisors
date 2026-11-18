import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { RevealIdNumber } from "@/components/clients/RevealIdNumber";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { requireSession } from "@/lib/auth/session";
import { getClientRecord, type ClientRecord } from "@/lib/clients/clients";
import { ageFromBirthDate, formatDate, formatPhone, maskedIdNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { clientIdSchema, MARITAL_STATUS_LABELS } from "@/lib/validation/client";
import styles from "./card.module.css";

export const metadata: Metadata = { title: "כרטיס לקוח" };

export default async function ClientCardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const id = clientIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const client = await getClientRecord(supabase, session.organization.id, id.data);
  if (!client) notFound();

  return (
    <div className={styles.page}>
      <PageHeader
        title={`${client.first_name} ${client.last_name}`}
        back={{ href: "/clients", label: "לקוחות" }}
        actions={
          <ButtonLink href={`/clients/${client.id}/edit`} variant="secondary">
            <Pencil aria-hidden="true" className={styles.icon} />
            עריכה
          </ButtonLink>
        }
      />
      <div className={styles.layout}>
        <div className={styles.details}>
          <DetailsSection title="פרטים אישיים">
            <Row label="תעודת זהות">
              {client.id_number_last4 ? (
                <RevealIdNumber clientId={client.id} masked={maskedIdNumber(client.id_number_last4)} />
              ) : null}
            </Row>
            <Row label="תאריך הנפקה">{formatDate(client.id_issue_date) || null}</Row>
            <Row label="תאריך פקיעה">{formatDate(client.id_expiry_date) || null}</Row>
            <Row label="תאריך לידה">{birthLine(client)}</Row>
          </DetailsSection>
          <DetailsSection title="פרטי קשר">
            <Row label="טלפון"><span dir="ltr">{formatPhone(client.phone)}</span></Row>
            <Row label="מקבל SMS">{client.phone_receives_sms ? "כן" : "לא"}</Row>
            <Row label="טלפון נוסף"><span dir="ltr">{formatPhone(client.phone_alt)}</span></Row>
            <Row label="אימייל"><span dir="ltr">{client.email}</span></Row>
          </DetailsSection>
          <DetailsSection title="משפחה ואזרחות">
            <Row label="מצב משפחתי">{client.marital_status ? MARITAL_STATUS_LABELS[client.marital_status] : null}</Row>
            <Row label="ילדים">{childrenLine(client.children_birth_years)}</Row>
            <Row label="אזרחות נוספת">{client.has_other_citizenship ? (client.other_citizenship ?? "כן") : "לא"}</Row>
          </DetailsSection>
          <DetailsSection title="כתובת">
            <Row label="כתובת">{addressLine(client)}</Row>
          </DetailsSection>
        </div>

        <aside className={styles.cases} aria-labelledby="cases-title">
          <h2 id="cases-title" className={styles.sectionTitle}>התיקים של הלקוח</h2>
          <p className={styles.muted}>
            פתיחת תיק משכנתא ושיוך לקוחות לתיק ייבנו בהמשך שלב 2. כאן יופיעו כל התיקים של הלקוח לאורך השנים.
          </p>
        </aside>
      </div>
      <p className={styles.muted}>עודכן לאחרונה {formatDate(client.updated_at)}</p>
    </div>
  );
}

function DetailsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <dl className={styles.list}>{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className={styles.row}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{empty ? <span className={styles.muted}>לא הוזן</span> : children}</dd>
    </div>
  );
}

function birthLine(client: ClientRecord): string | null {
  const age = ageFromBirthDate(client.birth_date);
  if (!client.birth_date) return null;
  return age === null ? formatDate(client.birth_date) : `${formatDate(client.birth_date)} · גיל ${age}`;
}

function childrenLine(birthYears: number[]): string | null {
  if (birthYears.length === 0) return null;
  const year = new Date().getFullYear();
  const ages = birthYears.map((birthYear) => year - birthYear).sort((a, b) => a - b);
  const under18 = ages.filter((age) => age < 18).length;
  return `${ages.length} ילדים, ${under18} מתחת לגיל 18 · גילאים ${ages.join(", ")}`;
}

function addressLine(client: ClientRecord): string | null {
  const street = [client.street, client.house_number].filter(Boolean).join(" ");
  const parts = [client.city, street].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
