"use client";

import { useActionState } from "react";
import { createOrganizationAction, type OrganizationState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { TextField } from "@/components/ui/TextField";

const initialState: OrganizationState = {};

export function OrganizationForm() {
  const [state, formAction, isPending] = useActionState(createOrganizationAction, initialState);

  return (
    <form action={formAction} noValidate className="stack">
      <TextField
        id="name"
        label="שם החשבון"
        autoComplete="organization"
        minLength={2}
        maxLength={120}
        required
        hint="השם שלכם או שם העסק. יופיע בראש המסך, ואפשר יהיה לשנות אותו."
        error={state.fieldError}
      />
      <FormMessage message={state.error} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "פותח..." : "המשך למערכת"}
      </Button>
    </form>
  );
}
