import { formatShekels } from "@/lib/format";
import styles from "./CaseStats.module.css";

type CaseStatsProps = {
  propertyValue: number | null;
  requestedAmount: number | null;
  isPurchase: boolean;
};

/** The four numbers at the top of every case, in the order the adviser chose. */
export function CaseStats({ propertyValue, requestedAmount, isPurchase }: CaseStatsProps) {
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
      <Stat label="הכנסות חודשיות" value="" note="ייבנה בשלב 3" />
      <Stat label="התחייבויות חודשיות" value="" note="ייבנה בשלב 3" />
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
