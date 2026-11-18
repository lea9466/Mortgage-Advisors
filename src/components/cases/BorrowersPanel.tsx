import type { ReactNode } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { removeBorrowerAction } from "@/app/(app)/cases/actions";
import { RevealIdNumber } from "@/components/clients/RevealIdNumber";
import { ButtonLink } from "@/components/ui/Button";
import type { CaseBorrower } from "@/lib/cases/cases";
import { ageFromBirthDate, formatPhone, maskedIdNumber } from "@/lib/format";
import { MARITAL_STATUS_LABELS } from "@/lib/validation/client";
import styles from "./BorrowersPanel.module.css";

type BorrowersPanelProps = { caseId: string; borrowers: CaseBorrower[] };

/** The borrowers of a case, read from their client cards. */
export function BorrowersPanel({ caseId, borrowers }: BorrowersPanelProps) {
  const canRemove = borrowers.length > 1;
  const year = new Date().getFullYear();

  return (
    <div className={styles.panel}>
      <p className={styles.note}>הפרטים נלקחים מכרטיס הלקוח. כדי לשנות אותם, פתחו את הכרטיס.</p>
      <ul className={styles.cards}>
        {borrowers.map((borrower) => {
          const age = ageFromBirthDate(borrower.birth_date);
          const under18 = borrower.children_birth_years.filter((birthYear) => year - birthYear < 18).length;
          const street = [borrower.street, borrower.house_number].filter(Boolean).join(" ");
          const address = [borrower.city, street].filter(Boolean).join(", ");
          return (
            <li key={borrower.id} className={styles.card}>
              <div className={styles.head}>
                <h3 className={styles.name}>
                  {borrower.first_name} {borrower.last_name}
                </h3>
                <Link href={`/clients/${borrower.id}`} className={styles.link}>
                  פתיחת כרטיס
                </Link>
              </div>
              <dl className={styles.list}>
                <Item label='ת"ז'>
                  {borrower.id_number_last4 ? (
                    <RevealIdNumber clientId={borrower.id} masked={maskedIdNumber(borrower.id_number_last4)} />
                  ) : null}
                </Item>
                <Item label="גיל">{age === null ? null : String(age)}</Item>
                <Item label="טלפון">
                  {borrower.phone ? (
                    <>
                      <span dir="ltr">{formatPhone(borrower.phone)}</span>
                      {borrower.phone_receives_sms ? " · מקבל SMS" : " · לא מקבל SMS"}
                    </>
                  ) : null}
                </Item>
                <Item label="מצב משפחתי">
                  {borrower.marital_status
                    ? `${MARITAL_STATUS_LABELS[borrower.marital_status]}${under18 ? `, ${under18} ילדים מתחת ל-18` : ""}`
                    : null}
                </Item>
                <Item label="כתובת">{address || null}</Item>
              </dl>
              {canRemove && (
                <form action={removeBorrowerAction.bind(null, caseId)}>
                  <input type="hidden" name="clientId" value={borrower.id} />
                  <button type="submit" className={styles.remove}>
                    הסרה מהתיק
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <ButtonLink href={`/cases/${caseId}/borrowers`} variant="secondary">
        <UserPlus aria-hidden="true" className={styles.icon} />
        צירוף לווה
      </ButtonLink>
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.item}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{children ?? <span className={styles.empty}>לא הוזן</span>}</dd>
    </div>
  );
}
