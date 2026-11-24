import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BorrowersPanel } from "@/components/cases/BorrowersPanel";
import { CaseLog } from "@/components/cases/CaseLog";
import { DocumentsPanel } from "@/components/cases/documents/DocumentsPanel";
import { RequirementsPanel } from "@/components/cases/requirements/RequirementsPanel";
import { listDocuments } from "@/lib/cases/documents";
import { getCaseRequirements } from "@/lib/cases/requirements";
import { countTrashForCase } from "@/lib/cases/trash";
import { BankAccountPanel, IncomePanel, LiabilityPanel } from "@/components/cases/finance/FinancePanels";
import { CaseStats } from "@/components/cases/CaseStats";
import { CASE_TABS, CaseTabs, type CaseTabId } from "@/components/cases/CaseTabs";
import { InsightBox } from "@/components/cases/InsightBox";
import { PropertyForm } from "@/components/cases/PropertyForm";
import { StageForm } from "@/components/cases/StageForm";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { FileText } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { caseTitle, getCase, shownPropertyValue, type CaseRecord } from "@/lib/cases/cases";
import { findPreviousIncomes, getCaseFinances, sumBy } from "@/lib/cases/finances";
import { getChildrenOf } from "@/lib/clients/family";
import { listLog } from "@/lib/cases/log";
import { formatAmountInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { CLOSED_STAGES, formatCaseNumber, logSearchSchema, type CaseDetailsFormValues } from "@/lib/validation/case";
import { createInsightAction, createLogEntryAction, updateCaseDetailsAction } from "../actions";
import styles from "./case.module.css";

export const metadata: Metadata = { title: "תיק משכנתא" };

const TAB_IDS = CASE_TABS.map((tab) => tab.id) as [CaseTabId, ...CaseTabId[]];
const searchSchema = z.object({
  tab: z.enum(TAB_IDS).catch("property").default("property"),
  saved: z.literal("1").optional().catch(undefined),
  edit: z.uuid().optional().catch(undefined),
  notice: z.literal("has-finances").optional().catch(undefined),
});

const LATER: Partial<Record<CaseTabId, { title: string; text: string }>> = {
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
  const { tab, saved, edit, notice } = searchSchema.parse(rawSearch);
  const logFilter = logSearchSchema.parse(rawSearch);

  const supabase = await createClient();
  const record = await getCase(supabase, session.organization.id, id.data);
  if (!record) notFound();
  const borrowerIds = record.case_borrowers.map((link) => link.clients.id);
  const [logEntries, finances, children, previousIncomes] = await Promise.all([
    listLog(supabase, session.organization.id, record.id, { q: logFilter.logq, from: logFilter.logfrom }),
    getCaseFinances(supabase, session.organization.id, record.id),
    getChildrenOf(supabase, session.organization.id, borrowerIds),
    findPreviousIncomes(supabase, session.organization.id, record.id, borrowerIds),
  ]);
  const [documents, trashCount, requirements] =
    tab === "documents"
      ? await Promise.all([
          listDocuments(supabase, session.organization.id, record.id),
          countTrashForCase(supabase, session.organization.id, record.id),
          // An open case picks up items it does not have yet (a new borrower, or items added in the settings).
          getCaseRequirements(supabase, { organizationId: session.organization.id, userId: session.user.id }, record.id, {
            borrowerIds,
            addMissing: !CLOSED_STAGES.includes(record.stage),
          }),
        ])
      : [[], 0, []];

  const borrowers = record.case_borrowers.map((link) => link.clients);
  const later = LATER[tab];

  return (
    <div className={styles.page}>
      <PageHeader
        title={caseTitle(record.purpose, borrowers)}
        description={`תיק ${formatCaseNumber(record.case_year, record.case_seq)}`}
        back={{ href: "/cases", label: "תיקי משכנתאות" }}
        actions={
          <>
            <StageForm caseId={record.id} stage={record.stage} />
            {/* No prefetch: opening the report is recorded in the audit log, so it must load only on a click. */}
            <ButtonLink href={`/cases/${record.id}/report`} prefetch={false}>
              <FileText aria-hidden="true" className={styles.icon} />
              דוח לבנק
            </ButtonLink>
          </>
        }
      />

      <CaseStats
        propertyValue={shownPropertyValue(record)}
        requestedAmount={record.requested_amount}
        isPurchase={record.purpose === "purchase"}
        incomes={{ total: sumBy(finances.incomes, (row) => row.monthly_amount), count: finances.incomes.length }}
        liabilities={{ total: sumBy(finances.liabilities, (row) => row.monthly_payment), count: finances.liabilities.length }}
        borrowerCount={borrowers.length}
      />

      <div className={styles.work}>
        <section className={styles.panel} aria-label="אזור עבודה">
          <CaseTabs caseId={record.id} current={tab} />
          <div className={styles.tabBody}>
            {tab === "personal" && (
              <BorrowersPanel
                caseId={record.id}
                borrowers={borrowers}
                childrenOf={children}
                hasFinancesNotice={notice === "has-finances"}
              />
            )}
            {tab === "income" && (
              <IncomePanel
                caseId={record.id}
                borrowers={borrowers}
                rows={finances.incomes}
                editId={edit}
                previous={previousIncomes.filter((item) => !finances.incomes.some((row) => row.client_id === item.clientId))}
              />
            )}
            {tab === "debts" && (
              <LiabilityPanel caseId={record.id} borrowers={borrowers} rows={finances.liabilities} editId={edit} />
            )}
            {tab === "documents" && (
              <>
                <RequirementsPanel
                  caseId={record.id}
                  borrowers={borrowers.map((borrower) => ({ value: borrower.id, label: `${borrower.first_name} ${borrower.last_name}` }))}
                  requirements={requirements}
                  documents={documents.map((document) => ({ id: document.id, title: document.title }))}
                />
                <DocumentsPanel caseId={record.id} borrowers={borrowers} documents={documents} editId={edit} trashCount={trashCount} />
              </>
            )}
            {tab === "bank" && (
              <BankAccountPanel caseId={record.id} borrowers={borrowers} rows={finances.accounts} editId={edit} />
            )}
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
