import Link from "next/link";
import clsx from "clsx";
import { Search } from "lucide-react";
import type { LogState } from "@/app/(app)/cases/actions";
import type { LogEntry } from "@/lib/cases/log";
import { formatLogTime } from "@/lib/format";
import { LOG_KIND_LABELS } from "@/lib/validation/case";
import { LogComposer } from "./LogComposer";
import styles from "./CaseLog.module.css";

type CaseLogProps = {
  caseId: string;
  tab: string;
  entries: LogEntry[];
  filter: { logq?: string; logfrom?: string };
  action: (state: LogState, formData: FormData) => Promise<LogState>;
};

/** The case log, always beside the work area: write an entry, search, and read newest first. */
export function CaseLog({ caseId, tab, entries, filter, action }: CaseLogProps) {
  const filtered = Boolean(filter.logq || filter.logfrom);

  return (
    <aside className={styles.log} aria-labelledby="log-title">
      <h2 id="log-title" className={styles.title}>
        תיעוד וטיפול
      </h2>
      <LogComposer action={action} />

      <details className={styles.searchBox} open={filtered}>
        <summary className={styles.searchToggle}>
          <Search aria-hidden="true" className={styles.icon} />
          חיפוש בתיעוד
        </summary>
        <form action={`/cases/${caseId}`} className={styles.search}>
          <input type="hidden" name="tab" value={tab} />
          <label htmlFor="logq" className={styles.searchLabel}>
            מילים
          </label>
          <input id="logq" name="logq" type="search" defaultValue={filter.logq} maxLength={60} className={styles.input} />
          <label htmlFor="logfrom" className={styles.searchLabel}>
            מתאריך
          </label>
          <input id="logfrom" name="logfrom" type="date" defaultValue={filter.logfrom} className={styles.input} />
          <div className={styles.searchActions}>
            <button type="submit" className={styles.searchButton}>
              חיפוש
            </button>
            {filtered && (
              <Link href={`/cases/${caseId}?tab=${tab}`} className={styles.clear}>
                ניקוי
              </Link>
            )}
          </div>
        </form>
      </details>

      {entries.length === 0 ? (
        <p className={styles.empty}>{filtered ? "לא נמצאו רשומות שמתאימות לחיפוש." : "עדיין לא נרשם כלום בתיק."}</p>
      ) : (
        <ol className={styles.entries}>
          {entries.map((entry) => (
            <li key={entry.id} className={clsx(styles.entry, entry.kind === "system" && styles.systemEntry)}>
              <div className={styles.meta}>
                <span className={clsx(styles.kindTag, styles[entry.kind])}>{LOG_KIND_LABELS[entry.kind]}</span>
                <time dateTime={entry.created_at}>{formatLogTime(entry.created_at)}</time>
              </div>
              <p className={styles.body}>{entry.body}</p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
