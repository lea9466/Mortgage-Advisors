"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { sendEmailCodeAction, verifyEmailCodeAction, type EmailCodeState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { TextField } from "@/components/ui/TextField";
import { RememberDevice } from "./RememberDevice";
import styles from "./SecondStep.module.css";

const initialState: EmailCodeState = {};

/** Second step by email: send a code, then type it in. */
export function EmailCodeForm({ email }: { email: string }) {
  const [sendState, sendAction, sending] = useActionState(sendEmailCodeAction, initialState);
  const [verifyState, verifyAction, verifying] = useActionState(verifyEmailCodeAction, initialState);
  const sent = sendState.sent || verifyState.sent;

  return (
    <div className="stack">
      {!sent ? (
        <form action={sendAction} className="stack">
          <p className={styles.explain}>
            נשלח קוד בן 6 ספרות אל <bdi dir="ltr">{email}</bdi>.
          </p>
          <FormMessage message={sendState.error} />
          <Button type="submit" variant="secondary" disabled={sending}>
            <Mail aria-hidden="true" className={styles.icon} />
            {sending ? "שולח..." : "שליחת קוד למייל"}
          </Button>
        </form>
      ) : (
        <>
          <form action={verifyAction} noValidate className="stack">
            <p className={styles.explain} role="status">
              שלחנו קוד אל <bdi dir="ltr">{email}</bdi>. הוא תקף 10 דקות.
            </p>
            <TextField id="emailCode" label="הקוד מהמייל" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required ltr />
            <RememberDevice />
            <FormMessage message={verifyState.error ?? sendState.error} />
            <Button type="submit" disabled={verifying}>
              {verifying ? "בודק..." : "אימות וכניסה"}
            </Button>
          </form>
          <form action={sendAction}>
            <button type="submit" className={styles.link} disabled={sending}>
              לא הגיע? שליחה מחדש
            </button>
          </form>
        </>
      )}
    </div>
  );
}
