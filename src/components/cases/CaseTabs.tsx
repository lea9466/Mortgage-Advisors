import Link from "next/link";
import clsx from "clsx";
import styles from "./CaseTabs.module.css";

export const CASE_TABS = [
  { id: "personal", label: "פרטים אישיים" },
  { id: "property", label: "הנכס והמשכנתא" },
  { id: "income", label: "הכנסות" },
  { id: "debts", label: "התחייבויות" },
  { id: "bank", label: 'חשבונות עו"ש' },
  { id: "documents", label: "מסמכים" },
  { id: "messages", label: "הודעות ללקוח" },
] as const;
export type CaseTabId = (typeof CASE_TABS)[number]["id"];

/** Work areas of a case. Each is a link, so a tab can be bookmarked and works without JavaScript. */
export function CaseTabs({ caseId, current }: { caseId: string; current: CaseTabId }) {
  return (
    <nav aria-label="אזורי העבודה בתיק" className={styles.tabs}>
      {CASE_TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/cases/${caseId}?tab=${tab.id}`}
          aria-current={tab.id === current ? "page" : undefined}
          className={clsx(styles.tab, tab.id === current && styles.current)}
          scroll={false}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
