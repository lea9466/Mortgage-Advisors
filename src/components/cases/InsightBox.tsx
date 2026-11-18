"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import type { InsightState } from "@/app/(app)/cases/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { BANK_LABELS, BANKS } from "@/lib/validation/case";
import styles from "./InsightBox.module.css";

const initialState: InsightState = {};

/**
 * "What did I learn from this case": a lesson typed here is sent to the
 * insights centre, and the box clears for the next one.
 */
type InsightAction = (state: InsightState, formData: FormData) => Promise<InsightState>;

export function InsightBox({ action }: { action: InsightAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={styles.box} aria-labelledby="insight-title">
      <div className={styles.head}>
        <Lightbulb aria-hidden="true" className={styles.icon} />
        <h2 id="insight-title" className={styles.title}>
          מה למדתי מהתיק הזה
        </h2>
      </div>
      <label htmlFor="insight-body" className="visually-hidden">
        התובנה
      </label>
      <textarea
        id="insight-body"
        name="body"
        rows={2}
        maxLength={1000}
        required
        placeholder="למשל: טפחות מאשרים הכנסה חדשה עם ותק של חודש"
        aria-invalid={state.fieldError ? true : undefined}
        aria-describedby="insight-hint"
        className={styles.text}
      />
      <p id="insight-hint" className={styles.hint}>
        בלי שמות או פרטים של לקוחות. התובנה נשמרת ב
        <Link href="/insights">מרכז התובנות</Link> ומשותפת לכל התיקים.
      </p>
      <div className={styles.row}>
        <label htmlFor="insight-bank" className={styles.bankLabel}>
          בנק
        </label>
        <select id="insight-bank" name="bank" defaultValue="" className={styles.select}>
          <option value="">לא קשור לבנק מסוים</option>
          {BANKS.map((bank) => (
            <option key={bank} value={bank}>
              {BANK_LABELS[bank]}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={isPending}>
          {isPending ? "שולח..." : "שליחה למרכז התובנות"}
        </Button>
        {state.savedAt && !isPending && (
          <span role="status" className={styles.saved}>
            נשמר במרכז התובנות
          </span>
        )}
      </div>
      <FormMessage message={state.fieldError ?? state.error} />
    </form>
  );
}
