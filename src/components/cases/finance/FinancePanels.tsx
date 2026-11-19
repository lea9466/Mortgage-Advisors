import {
  copyPreviousIncomesAction,
  deleteFinanceAction,
  revealAccountNumberAction,
  saveFinanceAction,
} from "@/app/(app)/cases/finance-actions";
import { RevealSecret } from "@/components/clients/RevealSecret";
import { Button } from "@/components/ui/Button";
import type { CaseBorrower } from "@/lib/cases/cases";
import {
  sumBy,
  type BankAccountRecord,
  type IncomeRecord,
  type LiabilityRecord,
  type PreviousIncomes,
} from "@/lib/cases/finances";
import { formatCaseNumber, PURPOSE_LABELS } from "@/lib/validation/case";
import { formatAmountInput, formatShekels, maskedIdNumber } from "@/lib/format";
import {
  ACCOUNT_BANK_LABELS,
  formatSeniority,
  INCOME_KIND_LABELS,
  LIABILITY_KIND_LABELS,
} from "@/lib/validation/finance";
import { BankAccountForm } from "./BankAccountForm";
import { FinanceList } from "./FinanceList";
import { IncomeForm } from "./IncomeForm";
import { LiabilityForm } from "./LiabilityForm";
import styles from "./Finance.module.css";

type PanelProps<T> = { caseId: string; borrowers: CaseBorrower[]; rows: T[]; editId?: string };

const options = (borrowers: CaseBorrower[]) =>
  borrowers.map((borrower) => ({ value: borrower.id, label: `${borrower.first_name} ${borrower.last_name}` }));
const amountText = (value: number | null) => formatAmountInput(value) || "";

export function IncomePanel({
  caseId,
  borrowers,
  rows,
  editId,
  previous = [],
}: PanelProps<IncomeRecord> & { previous?: PreviousIncomes[] }) {
  const tabHref = `/cases/${caseId}?tab=income`;
  const editing = rows.find((row) => row.id === editId);
  const copyAction = copyPreviousIncomesAction.bind(null, caseId);
  return (
    <div className={styles.panel}>
      {previous.map((item) => {
        const borrower = borrowers.find((candidate) => candidate.id === item.clientId);
        if (!borrower) return null;
        return (
          <form key={item.clientId} action={copyAction} className={styles.copyBox}>
            <input type="hidden" name="clientId" value={item.clientId} />
            <input type="hidden" name="sourceCaseId" value={item.sourceCaseId} />
            <p>
              ל{borrower.first_name} יש {item.count === 1 ? "הכנסה אחת" : `${item.count} הכנסות`} בתיק{" "}
              {PURPOSE_LABELS[item.sourceCase.purpose]} {formatCaseNumber(item.sourceCase.year, item.sourceCase.seq)}.
              אפשר להעתיק אותן לתיק הזה ולעדכן מה שהשתנה.
            </p>
            <Button type="submit" variant="secondary">
              העתקת ההכנסות
            </Button>
          </form>
        );
      })}
      <FinanceList
        borrowers={borrowers}
        total={{ label: "סך הכנסות כל הלווים", value: sumBy(rows, (row) => row.monthly_amount) }}
        rows={rows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          tag: INCOME_KIND_LABELS[row.kind],
          title: row.job_title ? `${row.title} · ${row.job_title}` : row.title,
          details: row.seniority_months === null ? undefined : `ותק ${formatSeniority(row.seniority_months)}`,
          amount: row.monthly_amount,
        }))}
        editHref={(id) => `${tabHref}&edit=${id}`}
        deleteAction={deleteFinanceAction.bind(null, "income", caseId)}
        editing={
          editing && {
            rowId: editing.id,
            form: (
              <IncomeForm
                action={saveFinanceAction.bind(null, "income", caseId, editing.id)}
                borrowers={options(borrowers)}
                editing
                cancelHref={tabHref}
                initialValues={{
                  clientId: editing.client_id,
                  kind: editing.kind,
                  title: editing.title,
                  jobTitle: editing.job_title ?? "",
                  seniorityYears: editing.seniority_months === null ? "" : String(Math.floor(editing.seniority_months / 12)),
                  seniorityMonths: editing.seniority_months === null ? "" : String(editing.seniority_months % 12),
                  monthlyAmount: amountText(editing.monthly_amount),
                }}
              />
            ),
          }
        }
        emptyText="עדיין לא הוזנו הכנסות בתיק."
      />
      {!editing && <IncomeForm action={saveFinanceAction.bind(null, "income", caseId, null)} borrowers={options(borrowers)} />}
    </div>
  );
}

export function LiabilityPanel({ caseId, borrowers, rows, editId }: PanelProps<LiabilityRecord>) {
  const tabHref = `/cases/${caseId}?tab=debts`;
  const editing = rows.find((row) => row.id === editId);
  return (
    <div className={styles.panel}>
      <FinanceList
        borrowers={borrowers}
        total={{ label: "סך ההחזרים החודשיים", value: sumBy(rows, (row) => row.monthly_payment) }}
        rows={rows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          tag: LIABILITY_KIND_LABELS[row.kind],
          title: row.lender ?? LIABILITY_KIND_LABELS[row.kind],
          details: [
            row.balance === null ? null : `יתרה ${formatShekels(row.balance)}`,
            row.remaining_months === null ? null : `${row.remaining_months} חודשים שנותרו`,
          ]
            .filter(Boolean)
            .join(" · "),
          amount: row.monthly_payment,
          amountLabel: "החזר",
        }))}
        editHref={(id) => `${tabHref}&edit=${id}`}
        deleteAction={deleteFinanceAction.bind(null, "liability", caseId)}
        editing={
          editing && {
            rowId: editing.id,
            form: (
              <LiabilityForm
                action={saveFinanceAction.bind(null, "liability", caseId, editing.id)}
                borrowers={options(borrowers)}
                editing
                cancelHref={tabHref}
                initialValues={{
                  clientId: editing.client_id,
                  kind: editing.kind,
                  lender: editing.lender ?? "",
                  balance: amountText(editing.balance),
                  monthlyPayment: amountText(editing.monthly_payment),
                  remainingMonths: editing.remaining_months === null ? "" : String(editing.remaining_months),
                }}
              />
            ),
          }
        }
        emptyText="עדיין לא הוזנו התחייבויות בתיק."
      />
      {!editing && <LiabilityForm action={saveFinanceAction.bind(null, "liability", caseId, null)} borrowers={options(borrowers)} />}
    </div>
  );
}

export function BankAccountPanel({ caseId, borrowers, rows, editId }: PanelProps<BankAccountRecord>) {
  const tabHref = `/cases/${caseId}?tab=bank`;
  const editing = rows.find((row) => row.id === editId);
  return (
    <div className={styles.panel}>
      <FinanceList
        borrowers={borrowers}
        rows={rows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          tag: ACCOUNT_BANK_LABELS[row.bank],
          title: (
            <RevealSecret masked={maskedIdNumber(row.account_last4)} reveal={revealAccountNumberAction.bind(null, row.id)} />
          ),
          details: [row.branch ? `סניף ${row.branch}` : null, row.is_joint ? "חשבון משותף" : null].filter(Boolean).join(" · "),
        }))}
        editHref={(id) => `${tabHref}&edit=${id}`}
        deleteAction={deleteFinanceAction.bind(null, "account", caseId)}
        editing={
          editing && {
            rowId: editing.id,
            form: (
              <BankAccountForm
                action={saveFinanceAction.bind(null, "account", caseId, editing.id)}
                borrowers={options(borrowers)}
                storedNumber={maskedIdNumber(editing.account_last4)}
                cancelHref={tabHref}
                initialValues={{ clientId: editing.client_id, bank: editing.bank, branch: editing.branch ?? "", isJoint: editing.is_joint }}
              />
            ),
          }
        }
        emptyText='עדיין לא הוזנו חשבונות עו"ש בתיק.'
      />
      {!editing && <BankAccountForm action={saveFinanceAction.bind(null, "account", caseId, null)} borrowers={options(borrowers)} />}
    </div>
  );
}
