import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { Button } from "@/components/ui/Button";
import { requireSession } from "@/lib/auth/session";
import { listInsights } from "@/lib/cases/insights";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { BANK_LABELS, BANKS, formatCaseNumber, insightSearchSchema, PURPOSE_LABELS, type Bank } from "@/lib/validation/case";
import { deleteInsightAction } from "../cases/actions";
import styles from "./insights.module.css";

export const metadata: Metadata = { title: "מרכז התובנות" };

function bankHref(bank: Bank | undefined, q: string | undefined) {
  const params = new URLSearchParams();
  if (bank) params.set("bank", bank);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/insights?${query}` : "/insights";
}

/** Lessons learned in cases, collected in one place and filtered by bank. */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const filter = insightSearchSchema.parse(await searchParams);
  const supabase = await createClient();
  const insights = await listInsights(supabase, session.organization.id, filter);

  return (
    <div className={styles.page}>
      <PageHeader
        title="מרכז התובנות"
        description='מה שלמדת בתיקים: נהלים של בנקים, מה עבד ומה לא. נכתב מתוך התיק, בתיבה "מה למדתי מהתיק הזה".'
      />

      <form role="search" action="/insights" className={styles.search}>
        {filter.bank && <input type="hidden" name="bank" value={filter.bank} />}
        <label htmlFor="q" className="visually-hidden">
          חיפוש בתובנות
        </label>
        <input id="q" name="q" type="search" defaultValue={filter.q} maxLength={60} placeholder="למשל: ותק, הכנסה חדשה, גרוש" className={styles.input} />
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" className={styles.icon} />
          חיפוש
        </Button>
      </form>

      <nav aria-label="סינון לפי בנק" className={styles.filters}>
        <Link href={bankHref(undefined, filter.q)} aria-current={!filter.bank ? "page" : undefined} className={clsx(styles.filter, !filter.bank && styles.filterOn)}>
          כל הבנקים
        </Link>
        {BANKS.map((bank) => (
          <Link
            key={bank}
            href={bankHref(bank, filter.q)}
            aria-current={filter.bank === bank ? "page" : undefined}
            className={clsx(styles.filter, filter.bank === bank && styles.filterOn)}
          >
            {BANK_LABELS[bank]}
          </Link>
        ))}
      </nav>

      {insights.length === 0 ? (
        <div className={styles.empty}>
          <p>
            {filter.q || filter.bank
              ? "לא נמצאו תובנות שמתאימות לחיפוש."
              : 'עדיין אין תובנות. בתוך כל תיק יש תיבה "מה למדתי מהתיק הזה". מה שכותבים שם מגיע לכאן.'}
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {insights.map((insight) => (
            <li key={insight.id} className={styles.item}>
              <p className={styles.body}>{insight.body}</p>
              <div className={styles.meta}>
                {insight.bank && <span className={styles.bank}>{BANK_LABELS[insight.bank]}</span>}
                <span>{formatDate(insight.created_at)}</span>
                {insight.cases && (
                  <Link href={`/cases/${insight.cases.id}`}>
                    מתוך {PURPOSE_LABELS[insight.cases.purpose]} {formatCaseNumber(insight.cases.case_year, insight.cases.case_seq)}
                  </Link>
                )}
                <form action={deleteInsightAction} className={styles.deleteForm}>
                  <input type="hidden" name="insightId" value={insight.id} />
                  <button type="submit" className={styles.delete}>
                    מחיקה
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
