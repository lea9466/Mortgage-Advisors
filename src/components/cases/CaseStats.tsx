import { formatShekels } from "@/lib/format";
import styles from "./CaseStats.module.css";

type Total = { total: number; count: number };

type CaseStatsProps = {
  propertyValue: number | null;
  requestedAmount: number | null;
  isPurchase: boolean;
  incomes: Total;
  liabilities: Total;
  borrowerCount: number;
};

/** The four numbers at the top of every case, in the order the adviser chose. */
export function CaseStats({ propertyValue, requestedAmount, isPurchase, incomes, liabilities, borrowerCount }: CaseStatsProps) {
  const financing =
    propertyValue && requestedAmount ? Math.round((requestedAmount / propertyValue) * 100) : null;

  return (
    <dl className={styles.stats} aria-label="ארבעת הנתונים של התיק">
      <Stat label="שווי הנכס" value={formatShekels(propertyValue)} note={isPurchase ? "לפי מחיר החוזה" : undefined} />
      <Stat
        label="משכנתא מבוקשת"
        value={formatShekels(requestedAmount)}
        note={financing === null ? undefined : `מימון ${financing}% משווי הנכס`}
      />
      <Stat
        label="הכנסות חודשיות"
        value={incomes.count > 0 ? formatShekels(incomes.total) : ""}
        note={incomes.count > 0 ? `${borrowerCount === 1 ? "לווה אחד" : `${borrowerCount} לווים`}, ${incomes.count === 1 ? "מקור אחד" : `${incomes.count} מקורות`}` : "לא הוזנו"}
      />
      <Stat
        label="התחייבויות חודשיות"
        value={liabilities.count > 0 ? formatShekels(liabilities.total) : ""}
        note={liabilities.count > 0 ? (liabilities.count === 1 ? "התחייבות אחת" : `${liabilities.count} התחייבויות`) : "לא הוזנו"}
      />
    </dl>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value} dir="ltr">
        {value || "—"}
      </dd>
      {note && <dd className={styles.note}>{note}</dd>}
    </div>
  );
}
