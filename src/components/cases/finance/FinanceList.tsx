import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { CaseBorrower } from "@/lib/cases/cases";
import { formatShekels } from "@/lib/format";
import styles from "./Finance.module.css";

export type FinanceRowView = {
  id: string;
  clientId: string;
  tag: string;
  title: ReactNode;
  details?: string;
  amount?: number;
  amountLabel?: string;
};

type FinanceListProps = {
  borrowers: CaseBorrower[];
  rows: FinanceRowView[];
  /** Shown above the list: the total for all borrowers, when it means something. */
  total?: { label: string; value: number };
  editHref: (rowId: string) => string;
  deleteAction: (formData: FormData) => Promise<void>;
  /** The row being edited is replaced by this form. */
  editing?: { rowId: string; form: ReactNode };
  emptyText: string;
};

/** Financial rows grouped by borrower, each group with its own subtotal. */
export function FinanceList({ borrowers, rows, total, editHref, deleteAction, editing, emptyText }: FinanceListProps) {
  if (rows.length === 0) return <p className={styles.empty}>{emptyText}</p>;

  return (
    <div className={styles.list}>
      {total && (
        <p className={styles.total}>
          <span>{total.label}</span>
          <span dir="ltr" className={styles.amount}>{formatShekels(total.value)}</span>
        </p>
      )}
      {borrowers.map((borrower) => {
        const own = rows.filter((row) => row.clientId === borrower.id);
        if (own.length === 0) return null;
        const subtotal = own.reduce((sum, row) => sum + (row.amount ?? 0), 0);
        return (
          <section key={borrower.id} className={styles.group} aria-label={`${borrower.first_name} ${borrower.last_name}`}>
            <h3 className={styles.groupHead}>
              <span>
                {borrower.first_name} {borrower.last_name}
              </span>
              {total && <span dir="ltr" className={styles.amount}>{formatShekels(subtotal)}</span>}
            </h3>
            <ul className={styles.rows}>
              {own.map((row) =>
                editing?.rowId === row.id ? (
                  <li key={row.id} className={styles.editingRow}>
                    {editing.form}
                  </li>
                ) : (
                  <li key={row.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <span className={styles.tag}>{row.tag}</span>
                      <div className={styles.rowText}>
                        <span className={styles.rowTitle}>{row.title}</span>
                        {row.details && <span className={styles.rowDetails}>{row.details}</span>}
                      </div>
                    </div>
                    <div className={styles.rowSide}>
                      {row.amount !== undefined && (
                        <span className={styles.rowAmount}>
                          {row.amountLabel && <span className={styles.amountLabel}>{row.amountLabel}</span>}
                          <span dir="ltr" className={styles.amount}>{formatShekels(row.amount)}</span>
                        </span>
                      )}
                      <Link href={editHref(row.id)} className={styles.rowLink} scroll={false}>
                        עריכה
                      </Link>
                      <form action={deleteAction}>
                        <input type="hidden" name="rowId" value={row.id} />
                        <Button type="submit" variant="quiet" className={styles.delete}>
                          מחיקה
                        </Button>
                      </form>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
