"use client";

import { useActionState } from "react";
import { verifyMfaCodeAction, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { TextField } from "@/components/ui/TextField";

const initialState: FormState = {};

type MfaCodeFormProps = {
  factorId: string;
  submitLabel: string;
};

export function MfaCodeForm({ factorId, submitLabel }: MfaCodeFormProps) {
  const [state, formAction, isPending] = useActionState(verifyMfaCodeAction, initialState);

  return (
    <form action={formAction} noValidate className="stack">
      <input type="hidden" name="factorId" value={factorId} />
      <TextField
        id="code"
        label="קוד בן 6 ספרות"
        hint="הקוד מופיע באפליקציית האימות בטלפון ומתחלף כל חצי דקה"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        ltr
      />
      <FormMessage message={state.error} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "בודק..." : submitLabel}
      </Button>
    </form>
  );
}
