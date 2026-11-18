"use client";

import { useActionState } from "react";
import type { LogState } from "@/app/(app)/cases/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { LOG_KIND_LABELS, LOG_KINDS } from "@/lib/validation/case";
import styles from "./CaseLog.module.css";

type LogAction = (state: LogState, formData: FormData) => Promise<LogState>;

const initialState: LogState = {};

/** Writes a note, call or meeting into the case log. Date and time are added on save. */
export function LogComposer({ action }: { action: LogAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={styles.composer}>
      <label htmlFor="log-body" className="visually-hidden">
        מה קרה בתיק
      </label>
      <textarea id="log-body" name="body" rows={3} maxLength={4000} required placeholder="מה קרה בתיק?" className={styles.text} />
      <fieldset className={styles.kinds}>
        <legend className="visually-hidden">סוג הרשומה</legend>
        {LOG_KINDS.map((kind, index) => (
          <label key={kind} className={styles.kind}>
            <input type="radio" name="kind" value={kind} defaultChecked={index === 0} />
            <span>{LOG_KIND_LABELS[kind]}</span>
          </label>
        ))}
      </fieldset>
      <div className={styles.composerFooter}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "שומר..." : "רישום"}
        </Button>
        {state.savedAt && !isPending && (
          <span role="status" className={styles.saved}>
            נרשם
          </span>
        )}
      </div>
      <FormMessage message={state.error} />
    </form>
  );
}
