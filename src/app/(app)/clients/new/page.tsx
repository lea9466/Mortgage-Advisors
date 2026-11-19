import type { Metadata } from "next";
import { z } from "zod";
import { ClientForm } from "@/components/clients/ClientForm";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { requireSession } from "@/lib/auth/session";
import { getClientRecord } from "@/lib/clients/clients";
import { createClient } from "@/lib/supabase/server";
import type { ClientFormValues } from "@/lib/validation/client";
import { createClientAction } from "../actions";
import styles from "../clients.module.css";

export const metadata: Metadata = { title: "לקוח חדש" };

const searchSchema = z.object({
  case: z.uuid().optional().catch(undefined),
  then: z.literal("open-case").optional().catch(undefined),
  spouseOf: z.uuid().optional().catch(undefined),
});

/**
 * New client. Opened from a case ("?case=..."), the client joins that case once
 * saved. Opened while starting a case ("?then=open-case"), the next step is
 * choosing the case purpose. Opened as a spouse ("?spouseOf=..."), the family
 * name and address are filled in and the two are linked once saved.
 */
export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { case: caseId, then, spouseOf } = searchSchema.parse(await searchParams);
  const supabase = await createClient();
  const partner = spouseOf ? await getClientRecord(supabase, session.organization.id, spouseOf) : null;
  const openingCase = !caseId && then === "open-case";

  const back = partner
    ? { href: `/clients/${partner.id}`, label: `חזרה לכרטיס של ${partner.first_name}` }
    : caseId
      ? { href: `/cases/${caseId}/borrowers`, label: "חזרה לצירוף לווה" }
      : openingCase
        ? { href: "/cases/new", label: "חזרה לפתיחת תיק" }
        : { href: "/clients", label: "לקוחות" };
  const description = partner
    ? `בן/בת הזוג של ${partner.first_name} ${partner.last_name}. שם המשפחה והכתובת כבר ממולאים, ואפשר לשנות.`
    : caseId
      ? "אחרי השמירה הלקוח יצורף לתיק."
      : openingCase
        ? "אחרי השמירה בוחרים את מטרת התיק."
        : undefined;
  const submitLabel = partner
    ? "שמירה וקישור כבני זוג"
    : caseId
      ? "שמירה וצירוף לתיק"
      : openingCase
        ? "שמירה והמשך לפתיחת התיק"
        : "שמירת לקוח";
  const initialValues: ClientFormValues = partner
    ? {
        lastName: partner.last_name,
        maritalStatus: "married",
        city: partner.city ?? undefined,
        street: partner.street ?? undefined,
        houseNumber: partner.house_number ?? undefined,
      }
    : {};

  return (
    <div className={styles.page}>
      <PageHeader title={partner ? "הוספת בן/בת זוג" : "לקוח חדש"} description={description} back={back} />
      <ClientForm
        action={createClientAction}
        initialValues={initialValues}
        submitLabel={submitLabel}
        cancelHref={back.href}
        caseId={partner ? undefined : caseId}
        openCaseNext={!partner && openingCase}
        spouseOf={partner?.id}
        spouseOfName={partner?.first_name}
      />
    </div>
  );
}
