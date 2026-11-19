import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderPlus, Pencil } from "lucide-react";
import { RevealSecret } from "@/components/clients/RevealSecret";
import { revealIdNumberAction, unlinkSpouseAction } from "../actions";
import { getChildrenOf, getSpouse, type ClientChildren } from "@/lib/clients/family";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { requireSession } from "@/lib/auth/session";
import { listClientCases } from "@/lib/cases/cases";
import { getClientRecord, type ClientRecord } from "@/lib/clients/clients";
import { CASE_STAGE_LABELS, PURPOSE_LABELS } from "@/lib/validation/case";
import { ageFromBirthDate, formatDate, formatPhone, maskedIdNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { clientIdSchema, MARITAL_STATUS_LABELS } from "@/lib/validation/client";
import styles from "./card.module.css";

export const metadata: Metadata = { title: "כרטיס לקוח" };

export default async function ClientCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const id = clientIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const justLinked = (await searchParams).linked === "1";

  const supabase = await createClient();
  const client = await getClientRecord(supabase, session.organization.id, id.data);
  if (!client) notFound();
  const [cases, spouse, childrenMap] = await Promise.all([
    listClientCases(supabase, session.organization.id, client.id),
    getSpouse(supabase, session.organization.id, client.id),
    getChildrenOf(supabase, session.organization.id, [client.id]),
  ]);
  const children = childrenMap.get(client.id) ?? { shared: [], personal: [] };

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
      {justLinked && spouse && (
        <p role="status" className={styles.notice}>
          {client.first_name} ו{spouse.first_name} מקושרים עכשיו כבני זוג, והילדים המשותפים מופיעים אצל שניהם. אם הילדים הוזנו
          קודם אצל כל אחד מהם בנפרד, בדקו בעריכת הכרטיס שאין ילדים כפולים.
        </p>
      )}
      <div className={styles.layout}>
        <div className={styles.details}>
          <DetailsSection title="פרטים אישיים">
            <Row label="תעודת זהות">
              {client.id_number_last4 ? (
                <RevealSecret masked={maskedIdNumber(client.id_number_last4)} reveal={revealIdNumberAction.bind(null, client.id)} />
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
            <Row label="בן/בת זוג">
              {spouse ? (
                <span className={styles.spouse}>
                  <Link href={`/clients/${spouse.id}`}>
                    {spouse.first_name} {spouse.last_name}
                  </Link>
                  <form action={unlinkSpouseAction.bind(null, client.id)}>
                    <button type="submit" className={styles.inlineAction}>
                      ניתוק הקישור
                    </button>
                  </form>
                </span>
              ) : (
                <span className={styles.spouse}>
                  <Link href={`/clients/new?spouseOf=${client.id}`}>הוספת בן/בת זוג</Link>
                  <Link href={`/clients/${client.id}/spouse`}>קישור ללקוח קיים</Link>
                </span>
              )}
            </Row>
            <Row label="ילדים">{childrenLine(children, spouse?.first_name, client.first_name)}</Row>
            <Row label="אזרחות נוספת">{client.has_other_citizenship ? (client.other_citizenship ?? "כן") : "לא"}</Row>
          </DetailsSection>
          <DetailsSection title="כתובת">
            <Row label="כתובת">{addressLine(client)}</Row>
          </DetailsSection>
        </div>

        <aside className={styles.cases} aria-labelledby="cases-title">
          <h2 id="cases-title" className={styles.sectionTitle}>התיקים של {client.first_name}</h2>
          {cases.length === 0 ? (
            <p className={styles.muted}>אין עדיין תיקים ללקוח הזה.</p>
          ) : (
            <ul className={styles.caseList}>
              {cases.map((item) => (
                <li key={item.id}>
                  <Link href={`/cases/${item.id}`} className={styles.caseLink}>
                    <span>
                      {PURPOSE_LABELS[item.purpose]} · {item.case_year}
                    </span>
                    <span className={styles.stage}>{CASE_STAGE_LABELS[item.stage]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <ButtonLink href={`/cases/new?client=${client.id}`} variant="secondary">
            <FolderPlus aria-hidden="true" className={styles.icon} />
            פתיחת תיק חדש ללקוח
          </ButtonLink>
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

function childrenLine(children: ClientChildren, spouseName: string | undefined, clientName: string): ReactNode {
  const all = [...children.shared, ...children.personal];
  if (all.length === 0) return null;
  const year = new Date().getFullYear();
  const ages = (birthYears: number[]) => birthYears.map((birthYear) => year - birthYear).sort((a, b) => a - b).join(", ");
  const under18 = all.filter((birthYear) => year - birthYear < 18).length;
  return (
    <span className={styles.childrenLines}>
      <span>
        {all.length} ילדים, {under18} מתחת לגיל 18
      </span>
      {children.shared.length > 0 && (
        <span className={styles.childrenDetail}>
          {spouseName ? `משותפים עם ${spouseName}` : "גילאים"}: {ages(children.shared)}
        </span>
      )}
      {children.personal.length > 0 && (
        <span className={styles.childrenDetail}>
          רק של {clientName}: {ages(children.personal)}
        </span>
      )}
    </span>
  );
}

function addressLine(client: ClientRecord): string | null {
  const street = [client.street, client.house_number].filter(Boolean).join(" ");
  const parts = [client.city, street].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
