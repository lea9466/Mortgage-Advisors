import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { requireSession } from "@/lib/auth/session";
import { caseTitle, listCases } from "@/lib/cases/cases";
import { formatDate, formatShekels } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  CASE_STAGE_LABELS,
  CASE_STAGES,
  CLOSED_STAGES,
  caseListSearchSchema,
  formatCaseNumber,
  type CaseStage,
} from "@/lib/validation/case";
import styles from "./cases.module.css";

export const metadata: Metadata = { title: "תיקי משכנתאות" };

type StageFilter = CaseStage | "active" | "all";
const FILTERS: { value: StageFilter; label: string }[] = [
  { value: "active", label: "פעילים" },
  ...CASE_STAGES.map((stage) => ({ value: stage, label: CASE_STAGE_LABELS[stage] })),
  { value: "all", label: "הכול" },
];

function filterHref(stage: StageFilter, q: string | undefined) {
  const params = new URLSearchParams();
  if (stage !== "active") params.set("stage", stage);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/cases?${query}` : "/cases";
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const filter = caseListSearchSchema.parse(await searchParams);
  const supabase = await createClient();
  const cases = await listCases(supabase, session.organization.id, filter);

  return (
    <div className={styles.page}>
      <PageHeader
        title="תיקי משכנתאות"
        actions={
          <ButtonLink href="/cases/new">
            <Plus aria-hidden="true" className={styles.icon} />
            תיק חדש
          </ButtonLink>
        }
      />

      <form role="search" action="/cases" className={styles.search}>
        {filter.stage !== "active" && <input type="hidden" name="stage" value={filter.stage} />}
        <label htmlFor="q" className="visually-hidden">
          חיפוש תיק
        </label>
        <input id="q" name="q" type="search" defaultValue={filter.q} maxLength={60} placeholder="שם לווה או מספר תיק (2026-001)" className={styles.searchInput} />
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" className={styles.icon} />
          חיפוש
        </Button>
      </form>

      <nav aria-label="סינון לפי שלב" className={styles.filters}>
        {FILTERS.map((item) => (
          <Link
            key={item.value}
            href={filterHref(item.value, filter.q)}
            aria-current={filter.stage === item.value ? "page" : undefined}
            className={clsx(styles.filter, filter.stage === item.value && styles.filterOn)}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {cases.length === 0 ? (
        <div className={styles.empty}>
          <p>{filter.q ? "לא נמצאו תיקים שמתאימים לחיפוש." : "אין תיקים בשלב הזה. לחצו על \"תיק חדש\" כדי לפתוח תיק."}</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">תיק</th>
                <th scope="col">שלב</th>
                <th scope="col">לווים</th>
                <th scope="col">משכנתא מבוקשת</th>
                <th scope="col">עודכן</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((item) => {
                const borrowers = item.case_borrowers.map((link) => link.clients);
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/cases/${item.id}`} className={styles.title}>
                        {caseTitle(item.purpose, borrowers)}
                      </Link>
                      <span className={styles.number}>{formatCaseNumber(item.case_year, item.case_seq)}</span>
                    </td>
                    <td>
                      <span className={clsx(styles.stage, CLOSED_STAGES.includes(item.stage) && styles.stageClosed)}>
                        {CASE_STAGE_LABELS[item.stage]}
                      </span>
                    </td>
                    <td className={styles.wrap}>{borrowers.map((b) => `${b.first_name} ${b.last_name}`).join(", ")}</td>
                    <td className={styles.num}><span dir="ltr">{formatShekels(item.requested_amount)}</span></td>
                    <td className={styles.num}>{formatDate(item.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
