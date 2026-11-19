import type { BankReport as BankReportData, ReportBorrower } from "@/lib/cases/report";
import { shownPropertyValue } from "@/lib/cases/cases";
import { ageFromBirthDate, formatDate, formatPhone, formatShekels } from "@/lib/format";
import { formatCaseNumber, PURPOSE_LABELS } from "@/lib/validation/case";
import { MARITAL_STATUS_LABELS } from "@/lib/validation/client";
import { formatSeniority, INCOME_KIND_LABELS, LIABILITY_KIND_LABELS } from "@/lib/validation/finance";
import styles from "./BankReport.module.css";

type BankReportProps = { report: BankReportData; organizationName: string; producedAt: Date };

/** The borrower details document for the bank, laid out for an A4 page. */
export function BankReport({ report, organizationName, producedAt }: BankReportProps) {
  const { record, families, incomes, liabilities } = report;
  const borrowers = families.flatMap((family) => family.members);
  const name = (borrower: ReportBorrower) => `${borrower.first_name} ${borrower.last_name}`;
  const propertyValue = shownPropertyValue(record);
  const financing = propertyValue && record.requested_amount ? Math.round((record.requested_amount / propertyValue) * 100) : null;
  const year = producedAt.getFullYear();
  const incomeTotal = incomes.reduce((sum, row) => sum + row.monthly_amount, 0);
  const paymentTotal = liabilities.reduce((sum, row) => sum + row.monthly_payment, 0);

  return (
    <article className={styles.sheet} aria-label="דוח פרטי לווים לבנק">
      <header className={styles.header}>
        <div>
          <p className={styles.org}>{organizationName}</p>
          <h1 className={styles.title}>פרטי לווים לבקשת משכנתא</h1>
        </div>
        <dl className={styles.meta}>
          <div><dt>תיק</dt><dd dir="ltr">{formatCaseNumber(record.case_year, record.case_seq)}</dd></div>
          <div><dt>תאריך</dt><dd>{formatDate(producedAt.toISOString())}</dd></div>
        </dl>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>פרטי העסקה</h2>
        <dl className={styles.facts}>
          <Fact label="מטרה" value={PURPOSE_LABELS[record.purpose]} />
          <Fact label="שווי הנכס" value={formatShekels(propertyValue)} ltr />
          <Fact label="משכנתא מבוקשת" value={formatShekels(record.requested_amount)} ltr />
          <Fact label="אחוז מימון" value={financing === null ? "" : `${financing}%`} ltr />
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>פרטים אישיים</h2>
        {families.map((family) => (
          <div key={family.members[0]?.id} className={styles.family}>
            <table className={styles.table}>
              <thead>
                <tr><th scope="col">שם מלא</th><th scope="col">ת&quot;ז</th><th scope="col">גיל</th><th scope="col">טלפון</th><th scope="col">מצב משפחתי</th><th scope="col">כתובת</th></tr>
              </thead>
              <tbody>
                {family.members.map((borrower) => (
                  <tr key={borrower.id}>
                    <td>{name(borrower)}</td>
                    <td><span dir="ltr" className={styles.num}>{borrower.idNumber ?? ""}</span></td>
                    <td className={styles.num}>{ageFromBirthDate(borrower.birth_date) ?? ""}</td>
                    <td><span dir="ltr" className={styles.num}>{formatPhone(borrower.phone)}</span></td>
                    <td>{borrower.marital_status ? MARITAL_STATUS_LABELS[borrower.marital_status] : ""}</td>
                    <td>{[borrower.city, [borrower.street, borrower.house_number].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.children}>
              {childrenText(family.childBirthYears, year, family.members.length > 1)}
            </p>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>הכנסות חודשיות</h2>
        {incomes.length === 0 ? (
          <p className={styles.none}>לא הוזנו הכנסות.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">לווה</th><th scope="col">סוג</th><th scope="col">מקור</th><th scope="col">ותק</th><th scope="col" className={styles.amountCol}>סכום חודשי</th></tr>
            </thead>
            {borrowers.map((borrower) => {
              const own = incomes.filter((row) => row.client_id === borrower.id);
              if (own.length === 0) return null;
              return (
                <tbody key={borrower.id}>
                  {own.map((row) => (
                    <tr key={row.id}>
                      <td>{name(borrower)}</td>
                      <td>{INCOME_KIND_LABELS[row.kind]}</td>
                      <td>{row.job_title ? `${row.title}, ${row.job_title}` : row.title}</td>
                      <td>{formatSeniority(row.seniority_months)}</td>
                      <td className={styles.amountCol}><Amount value={row.monthly_amount} /></td>
                    </tr>
                  ))}
                  <tr className={styles.subtotal}>
                    <td colSpan={4}>סך הכנסות {name(borrower)}</td>
                    <td className={styles.amountCol}><Amount value={own.reduce((sum, row) => sum + row.monthly_amount, 0)} /></td>
                  </tr>
                </tbody>
              );
            })}
            <tfoot>
              <tr className={styles.total}>
                <td colSpan={4}>סך הכנסות כל הלווים</td>
                <td className={styles.amountCol}><Amount value={incomeTotal} /></td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>התחייבויות</h2>
        {liabilities.length === 0 ? (
          <p className={styles.none}>לא הוזנו התחייבויות.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">לווה</th><th scope="col">סוג</th><th scope="col">גוף מלווה</th><th scope="col">חודשים שנותרו</th><th scope="col" className={styles.amountCol}>יתרה</th><th scope="col" className={styles.amountCol}>החזר חודשי</th></tr>
            </thead>
            <tbody>
              {borrowers.flatMap((borrower) =>
                liabilities
                  .filter((row) => row.client_id === borrower.id)
                  .map((row) => (
                    <tr key={row.id}>
                      <td>{name(borrower)}</td>
                      <td>{LIABILITY_KIND_LABELS[row.kind]}</td>
                      <td>{row.lender ?? ""}</td>
                      <td className={styles.num}>{row.remaining_months ?? ""}</td>
                      <td className={styles.amountCol}>{row.balance === null ? "" : <Amount value={row.balance} />}</td>
                      <td className={styles.amountCol}><Amount value={row.monthly_payment} /></td>
                    </tr>
                  )),
              )}
            </tbody>
            <tfoot>
              <tr className={styles.total}>
                <td colSpan={5}>סך ההחזרים החודשיים</td>
                <td className={styles.amountCol}><Amount value={paymentTotal} /></td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <footer className={styles.footer}>
        הופק ב-{formatDate(producedAt.toISOString())} · {organizationName}. המסמך כולל מידע אישי רגיש ומיועד לבנק בלבד.
      </footer>
    </article>
  );
}

function Fact({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd dir={ltr ? "ltr" : undefined}>{value || "—"}</dd>
    </div>
  );
}

function Amount({ value }: { value: number }) {
  return <span dir="ltr" className={styles.num}>{formatShekels(value)}</span>;
}

function childrenText(birthYears: number[], year: number, isCouple: boolean): string {
  const prefix = isCouple ? "ילדים (משותף לבני הזוג)" : "ילדים";
  if (birthYears.length === 0) return `${prefix}: אין`;
  const ages = birthYears.map((birthYear) => year - birthYear).sort((a, b) => a - b);
  const under18 = ages.filter((age) => age < 18).length;
  return `${prefix}: ${ages.length}, מהם ${under18} מתחת לגיל 18 · גילאים ${ages.join(", ")}`;
}
