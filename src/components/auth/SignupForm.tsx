"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { signupAction, type SignupState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { TextField } from "@/components/ui/TextField";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import styles from "./SignupForm.module.css";

const initialState: SignupState = {};

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signupAction, initialState);

  if (state.sentTo) {
    return (
      <div role="status" className="stack">
        <p className={styles.sent}>
          <MailCheck aria-hidden="true" className={styles.sentIcon} />
          <span>
            שלחנו קישור אישור אל <bdi dir="ltr">{state.sentTo}</bdi>.
          </span>
        </p>
        <p className={styles.note}>
          פתחו את הקישור באותו דפדפן שבו נרשמתם. אם המייל לא הגיע תוך כמה דקות, בדקו בתיקיית
          הספאם.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="stack">
      <TextField
        id="email"
        label="אימייל"
        type="email"
        autoComplete="email"
        maxLength={254}
        required
        ltr
        error={state.fieldErrors?.email?.[0]}
      />
      <TextField
        id="password"
        label="סיסמה"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={200}
        required
        ltr
        hint={`לפחות ${PASSWORD_MIN_LENGTH} תווים. משפט קצר שקל לזכור הוא סיסמה טובה.`}
        error={state.fieldErrors?.password?.[0]}
      />
      <TextField
        id="passwordConfirm"
        label="אימות סיסמה"
        type="password"
        autoComplete="new-password"
        maxLength={200}
        required
        ltr
        error={state.fieldErrors?.passwordConfirm?.[0]}
      />
      <FormMessage message={state.error} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "שולח..." : "פתיחת חשבון"}
      </Button>
    </form>
  );
}
