import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ClientPicker } from "@/components/clients/ClientPicker";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { requireSession } from "@/lib/auth/session";
import { getClientRecord, searchClients } from "@/lib/clients/clients";
import { createClient } from "@/lib/supabase/server";
import { MORTGAGE_PURPOSES, PURPOSE_LABELS } from "@/lib/validation/case";
import { openCaseAction } from "../actions";
import styles from "./new.module.css";

export const metadata: Metadata = { title: "תיק חדש" };

const searchSchema = z.object({
  client: z.uuid().optional().catch(undefined),
  q: z.string().trim().max(60).optional().catch(undefined),
});

/** Step 1: pick the first borrower. Step 2: pick the purpose and open the case. */
export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const search = searchSchema.parse(await searchParams);
  const supabase = await createClient();
  const client = search.client ? await getClientRecord(supabase, session.organization.id, search.client) : null;

  if (!client) {
    const clients = await searchClients(supabase, session.organization.id, search.q);
    return (
      <div className={styles.page}>
        <PageHeader title="תיק חדש" description="שלב 1 מתוך 2: מי הלווה הראשון? אפשר לצרף לווים נוספים אחר כך." back={{ href: "/cases", label: "תיקי משכנתאות" }} />
        <ClientPicker
          action="/cases/new"
          query={search.q}
          clients={clients}
          renderChoice={(item) => (
            <ButtonLink href={`/cases/new?client=${item.id}`} variant="secondary">
              בחירה
            </ButtonLink>
          )}
          empty={
            <p>
              לא נמצאו לקוחות. <Link href="/clients/new">הוספת לקוח חדש</Link>, ואז פתיחת תיק מתוך כרטיס הלקוח.
            </p>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="תיק חדש"
        description={`שלב 2 מתוך 2: מטרת המשכנתא של ${client.first_name} ${client.last_name}`}
        back={{ href: "/cases/new", label: "בחירת לקוח אחר" }}
      />
      <form action={openCaseAction} className={styles.form}>
        <input type="hidden" name="clientId" value={client.id} />
        <fieldset className={styles.purposes}>
          <legend className={styles.legend}>מטרת המשכנתא</legend>
          <div className={styles.chips}>
            {MORTGAGE_PURPOSES.map((purpose, index) => (
              <label key={purpose} className={styles.chip}>
                <input type="radio" name="purpose" value={purpose} defaultChecked={index === 0} required />
                <span>{PURPOSE_LABELS[purpose]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Button type="submit">פתיחת התיק</Button>
        </div>
      </form>
    </div>
  );
}
