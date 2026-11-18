import type { Metadata } from "next";
import { z } from "zod";
import { ClientForm } from "@/components/clients/ClientForm";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { requireSession } from "@/lib/auth/session";
import { createClientAction } from "../actions";
import styles from "../clients.module.css";

export const metadata: Metadata = { title: "לקוח חדש" };

const searchSchema = z.object({
  case: z.uuid().optional().catch(undefined),
  then: z.literal("open-case").optional().catch(undefined),
});

/**
 * New client. Opened from a case ("?case=..."), the client joins that case once
 * saved. Opened while starting a case ("?then=open-case"), the next step is
 * choosing the case purpose.
 */
export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const { case: caseId, then } = searchSchema.parse(await searchParams);
  const openingCase = !caseId && then === "open-case";

  const back = caseId
    ? { href: `/cases/${caseId}/borrowers`, label: "חזרה לצירוף לווה" }
    : openingCase
      ? { href: "/cases/new", label: "חזרה לפתיחת תיק" }
      : { href: "/clients", label: "לקוחות" };
  const description = caseId
    ? "אחרי השמירה הלקוח יצורף לתיק."
    : openingCase
      ? "אחרי השמירה בוחרים את מטרת התיק."
      : undefined;
  const submitLabel = caseId ? "שמירה וצירוף לתיק" : openingCase ? "שמירה והמשך לפתיחת התיק" : "שמירת לקוח";

  return (
    <div className={styles.page}>
      <PageHeader title="לקוח חדש" description={description} back={back} />
      <ClientForm
        action={createClientAction}
        initialValues={{}}
        submitLabel={submitLabel}
        cancelHref={back.href}
        caseId={caseId}
        openCaseNext={openingCase}
      />
    </div>
  );
}
