import type { Metadata } from "next";
import { z } from "zod";
import { ClientForm } from "@/components/clients/ClientForm";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { requireSession } from "@/lib/auth/session";
import { createClientAction } from "../actions";
import styles from "../clients.module.css";

export const metadata: Metadata = { title: "לקוח חדש" };

const searchSchema = z.object({ case: z.uuid().optional().catch(undefined) });

/** New client. Opened from a case ("?case=..."), the client joins that case once saved. */
export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const { case: caseId } = searchSchema.parse(await searchParams);
  const back = caseId
    ? { href: `/cases/${caseId}/borrowers`, label: "חזרה לצירוף לווה" }
    : { href: "/clients", label: "לקוחות" };

  return (
    <div className={styles.page}>
      <PageHeader
        title="לקוח חדש"
        description={caseId ? "אחרי השמירה הלקוח יצורף לתיק." : undefined}
        back={back}
      />
      <ClientForm
        action={createClientAction}
        initialValues={{}}
        submitLabel={caseId ? "שמירה וצירוף לתיק" : "שמירת לקוח"}
        cancelHref={back.href}
        caseId={caseId}
      />
    </div>
  );
}
