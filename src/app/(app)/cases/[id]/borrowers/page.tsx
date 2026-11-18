import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ClientPicker } from "@/components/clients/ClientPicker";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { requireSession } from "@/lib/auth/session";
import { caseTitle, getCase } from "@/lib/cases/cases";
import { searchClients } from "@/lib/clients/clients";
import { createClient } from "@/lib/supabase/server";
import { addBorrowerAction } from "../../actions";
import styles from "../case.module.css";

export const metadata: Metadata = { title: "צירוף לווה" };

const searchSchema = z.object({ q: z.string().trim().max(60).optional().catch(undefined) });

export default async function AddBorrowerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { q } = searchSchema.parse(await searchParams);

  const supabase = await createClient();
  const record = await getCase(supabase, session.organization.id, id.data);
  if (!record) notFound();

  const borrowerIds = new Set(record.case_borrowers.map((link) => link.clients.id));
  const clients = (await searchClients(supabase, session.organization.id, q)).filter((client) => !borrowerIds.has(client.id));
  const caseHref = `/cases/${record.id}?tab=personal`;
  const addAction = addBorrowerAction.bind(null, record.id);

  return (
    <div className={styles.page}>
      <PageHeader
        title="צירוף לווה"
        description={caseTitle(record.purpose, record.case_borrowers.map((link) => link.clients))}
        back={{ href: caseHref, label: "חזרה לתיק" }}
        actions={
          <ButtonLink href={`/clients/new?case=${record.id}`} variant="secondary">
            לקוח חדש שיצורף לתיק
          </ButtonLink>
        }
      />
      <ClientPicker
        action={`/cases/${record.id}/borrowers`}
        query={q}
        clients={clients}
        renderChoice={(client) => (
          <form action={addAction}>
            <input type="hidden" name="clientId" value={client.id} />
            <Button type="submit" variant="secondary">
              צירוף לתיק
            </Button>
          </form>
        )}
        empty={
          <p>
            לא נמצאו לקוחות נוספים. <Link href={`/clients/new?case=${record.id}`}>הוספת לקוח חדש</Link> תצרף אותו לתיק מיד.
          </p>
        }
      />
    </div>
  );
}
