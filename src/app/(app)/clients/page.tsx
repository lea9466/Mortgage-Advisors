import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { requireSession } from "@/lib/auth/session";
import { searchClients } from "@/lib/clients/clients";
import { ageFromBirthDate, formatPhone, maskedIdNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { clientSearchSchema } from "@/lib/validation/client";
import styles from "./clients.module.css";

export const metadata: Metadata = { title: "לקוחות" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const search = clientSearchSchema.parse(await searchParams);
  const supabase = await createClient();
  const clients = await searchClients(supabase, session.organization.id, search.q);

  return (
    <div className={styles.page}>
      <PageHeader
        title="לקוחות"
        description="מאגר הלקוחות. כל לקוח מוזן פעם אחת ומצורף לתיקים שלו."
        actions={
          <ButtonLink href="/clients/new">
            <Plus aria-hidden="true" className={styles.icon} />
            לקוח חדש
          </ButtonLink>
        }
      />

      <form role="search" action="/clients" className={styles.search}>
        <label htmlFor="q" className="visually-hidden">
          חיפוש לקוח
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search.q}
          maxLength={60}
          placeholder="שם או מספר תעודת זהות"
          className={styles.searchInput}
        />
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" className={styles.icon} />
          חיפוש
        </Button>
      </form>

      {clients.length === 0 ? (
        <div className={styles.empty}>
          {search.q ? (
            <p>לא נמצאו לקוחות שמתאימים לחיפוש. חיפוש לפי תעודת זהות דורש את המספר המלא.</p>
          ) : (
            <p>עדיין אין לקוחות. לחצו על &quot;לקוח חדש&quot; כדי להוסיף את הראשון.</p>
          )}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">שם</th>
                <th scope="col">תעודת זהות</th>
                <th scope="col">טלפון</th>
                <th scope="col">יישוב</th>
                <th scope="col">גיל</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link href={`/clients/${client.id}`} className={styles.name}>
                      {client.first_name} {client.last_name}
                    </Link>
                  </td>
                  <td><span dir="ltr" className={styles.ltr}>{maskedIdNumber(client.id_number_last4)}</span></td>
                  <td><span dir="ltr" className={styles.ltr}>{formatPhone(client.phone)}</span></td>
                  <td>{client.city}</td>
                  <td className={styles.num}>{ageFromBirthDate(client.birth_date) ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {clients.length === 50 && <p className={styles.note}>מוצגים 50 הלקוחות הראשונים. חפשו כדי לצמצם.</p>}
    </div>
  );
}
