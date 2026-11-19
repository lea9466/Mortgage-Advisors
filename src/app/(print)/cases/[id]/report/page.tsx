import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChevronRight } from "lucide-react";
import { BankReport } from "@/components/cases/report/BankReport";
import { PrintButton } from "@/components/cases/report/PrintButton";
import { recordAudit } from "@/lib/audit/log";
import { requireSession } from "@/lib/auth/session";
import { logSystemEvent } from "@/lib/cases/log";
import { buildBankReport } from "@/lib/cases/report";
import { createClient } from "@/lib/supabase/server";
import styles from "./report.module.css";

export const metadata: Metadata = { title: "דוח לבנק" };

/**
 * The bank report of a case, ready to print or save as PDF. It shows full ID
 * numbers, so producing it is written to the audit log and the case log.
 */
export default async function BankReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const logged = await recordAudit(supabase, {
    organizationId: session.organization.id,
    actorId: session.user.id,
    action: "case.bank_report",
    entityType: "case",
    entityId: id.data,
  });
  // Like revealing an ID number: if the access cannot be recorded, nothing is shown.
  if (!logged) {
    return <p className={styles.error}>לא ניתן להפיק את הדוח כרגע. נסו שוב בעוד רגע.</p>;
  }

  const report = await buildBankReport(supabase, session.organization.id, id.data);
  if (!report) notFound();
  await logSystemEvent(
    supabase,
    { organizationId: session.organization.id, userId: session.user.id },
    id.data,
    "הופק דוח לבנק",
  );

  return (
    <main id="main" className={styles.page}>
      <div className={styles.toolbar}>
        <Link href={`/cases/${id.data}`} className={styles.back}>
          <ChevronRight aria-hidden="true" className={styles.icon} />
          חזרה לתיק
        </Link>
        <p className={styles.hint}>בחלון ההדפסה בוחרים &quot;שמירה כ-PDF&quot; כדי ליצור קובץ.</p>
        <PrintButton />
      </div>
      <BankReport report={report} organizationName={session.organization.name} producedAt={new Date()} />
    </main>
  );
}
