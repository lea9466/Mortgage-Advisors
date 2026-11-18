import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BorrowersPanel } from "@/components/cases/BorrowersPanel";
import { CaseLog } from "@/components/cases/CaseLog";
import { CaseStats } from "@/components/cases/CaseStats";
import { CASE_TABS, CaseTabs, type CaseTabId } from "@/components/cases/CaseTabs";
import { InsightBox } from "@/components/cases/InsightBox";
import { PropertyForm } from "@/components/cases/PropertyForm";
import { StageForm } from "@/components/cases/StageForm";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { requireSession } from "@/lib/auth/session";
import { caseTitle, getCase, shownPropertyValue, type CaseRecord } from "@/lib/cases/cases";
import { listLog } from "@/lib/cases/log";
import { formatAmountInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatCaseNumber, logSearchSchema, type CaseDetailsFormValues } from "@/lib/validation/case";
import { createInsightAction, createLogEntryAction, updateCaseDetailsAction } from "../actions";
import styles from "./case.module.css";

export const metadata: Metadata = { title: "תיק משכנתא" };

const TAB_IDS = CASE_TABS.map((tab) => tab.id) as [CaseTabId, ...CaseTabId[]];
const searchSchema = z.object({
  tab: z.enum(TAB_IDS).catch("property").default("property"),
  saved: z.literal("1").optional().catch(undefined),
});

const LATER: Partial<Record<CaseTabId, { title: string; text: string }>> = {
  income: { title: "הכנסות", text: "ייבנה בשלב 3. לכל לווה כמה מקורות הכנסה: שכיר, עצמאי, אברך כולל, קצבה ואחר." },
  debts: { title: "התחייבויות והלוואות", text: "ייבנה בשלב 3. לכל לווה: סוג, גוף מלווה, יתרה, החזר חודשי ותקופה." },
  bank: { title: 'חשבונות עו"ש', text: "ייבנה בשלב 3. מספרי החשבון יוצפנו ויוסתרו כמו תעודת זהות." },
  documents: { title: "מסמכים ומעקב מסמכים", text: "ייבנה בשלב 4, כולל הקישור ללקוח להעלאת מסמכים." },
  messages: { title: "הודעות ללקוח", text: "ייבנה בשלב 5. בהתחלה: פתיחת WhatsApp עם הודעה מוכנה." },
};

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const rawSearch = await searchParams;
  const { tab, saved } = searchSchema.parse(rawSearch);
  const logFilter = logSearchSchema.parse(rawSearch);

  const supabase = await createClient();
  const record = await getCase(supabase, session.organization.id, id.data);
  if (!record) notFound();
  const logEntries = await listLog(supabase, session.organization.id, record.id, {
    q: logFilter.logq,
    from: logFilter.logfrom,
  });

  const borrowers = record.case_borrowers.map((link) => link.clients);
  const later = LATER[tab];

  return (
    <div className={styles.page}>
      <PageHeader
        title={caseTitle(record.purpose, borrowers)}
        description={`תיק ${formatCaseNumber(record.case_year, record.case_seq)}`}
        back={{ href: "/cases", label: "תיקי משכנתאות" }}
        actions={<StageForm caseId={record.id} stage={record.stage} />}
      />

      <CaseStats
        propertyValue={shownPropertyValue(record)}
        requestedAmount={record.requested_amount}
        isPurchase={record.purpose === "purchase"}
      />

      <div className={styles.work}>
        <section className={styles.panel} aria-label="אזור עבודה">
          <CaseTabs caseId={record.id} current={tab} />
          <div className={styles.tabBody}>
            {tab === "personal" && <BorrowersPanel caseId={record.id} borrowers={borrowers} />}
            {tab === "property" && (
              <PropertyForm
                action={updateCaseDetailsAction.bind(null, record.id)}
                purpose={record.purpose}
                initialValues={toFormValues(record)}
                saved={saved === "1"}
              />
            )}
            {later && (
              <div className={styles.later}>
                <b>{later.title}</b>
                <span>{later.text}</span>
              </div>
            )}
          </div>
        </section>

        <CaseLog
          caseId={record.id}
          tab={tab}
          entries={logEntries}
          filter={logFilter}
          action={createLogEntryAction.bind(null, record.id)}
        />
      </div>

      {/* At the bottom, so it does not interrupt the work on the case. */}
      <InsightBox action={createInsightAction.bind(null, record.id)} />
    </div>
  );
}

function toFormValues(record: CaseRecord): CaseDetailsFormValues {
  const amount = (value: number | null) => formatAmountInput(value) || undefined;
  return {
    requestedAmount: amount(record.requested_amount),
    propertyValue: amount(record.property_value),
    contractPrice: amount(record.contract_price),
    equity: amount(record.equity),
    hand: record.hand ?? undefined,
    apartmentClass: record.apartment_class ?? undefined,
  };
}
