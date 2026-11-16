"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { TextField } from "@/components/ui/TextField";

const initialState: FormState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} noValidate className="stack">
      <TextField
        id="email"
        label="אימייל"
        type="email"
        autoComplete="username"
        maxLength={254}
        required
        ltr
      />
      <TextField
        id="password"
        label="סיסמה"
        type="password"
        autoComplete="current-password"
        maxLength={200}
        required
        ltr
      />
      <FormMessage message={state.error} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "מתחבר..." : "כניסה"}
      </Button>
    </form>
  );
}
