import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ClientPicker } from "@/components/clients/ClientPicker";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { requireSession } from "@/lib/auth/session";
import { getClientRecord, searchClients } from "@/lib/clients/clients";
import { createClient } from "@/lib/supabase/server";
import { clientIdSchema } from "@/lib/validation/client";
import { linkSpouseAction } from "../../actions";
import styles from "../../clients.module.css";

export const metadata: Metadata = { title: "קישור בן/בת זוג" };

const searchSchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  error: z.enum(["taken", "invalid"]).optional().catch(undefined),
});

const ERRORS = {
  taken: "הלקוח שנבחר כבר מקושר לבן/בת זוג אחר/ת. נתקו את הקישור הקיים בכרטיס שלו, ואז נסו שוב.",
  invalid: "אי אפשר לקשר את שני הלקוחות האלה.",
} as const;

/** Picks an existing client from the registry as this client's spouse. */
export default async function LinkSpousePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const id = clientIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const search = searchSchema.parse(await searchParams);

  const supabase = await createClient();
  const client = await getClientRecord(supabase, session.organization.id, id.data);
  if (!client) notFound();
  // Without a search, suggest clients with the same family name first.
  const clients = (await searchClients(supabase, session.organization.id, search.q ?? client.last_name)).filter(
    (item) => item.id !== client.id,
  );
  const link = linkSpouseAction.bind(null, client.id);

  return (
    <div className={styles.page}>
      <PageHeader
        title={`בן/בת הזוג של ${client.first_name} ${client.last_name}`}
        description="בחרו לקוח קיים. אחרי הקישור הילדים המשותפים יופיעו אצל שניהם."
        back={{ href: `/clients/${client.id}`, label: "חזרה לכרטיס" }}
      />
      <FormMessage message={search.error ? ERRORS[search.error] : undefined} />
      <ClientPicker
        action={`/clients/${client.id}/spouse`}
        query={search.q ?? client.last_name}
        clients={clients}
        renderChoice={(item) => (
          <form action={link}>
            <input type="hidden" name="spouseId" value={item.id} />
            <Button type="submit" variant="secondary">
              קישור כבני זוג
            </Button>
          </form>
        )}
        empty={
          <p>
            לא נמצאו לקוחות. <Link href={`/clients/new?spouseOf=${client.id}`}>הוספת בן/בת זוג חדש/ה</Link>.
          </p>
        }
      />
    </div>
  );
}
