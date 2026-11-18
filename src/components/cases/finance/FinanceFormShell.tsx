"use client";

import { useActionState, type ReactNode } from "react";
import type { FinanceFormState } from "@/app/(app)/cases/finance-actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { SelectField } from "@/components/ui/SelectField";
import type { FinanceFormValues } from "@/lib/validation/finance";
import styles from "./Finance.module.css";

export type FinanceAction = (state: FinanceFormState, formData: FormData) => Promise<FinanceFormState>;
export type BorrowerOption = { value: string; label: string };

type FinanceFormShellProps = {
  action: FinanceAction;
  title: string;
  submitLabel: string;
  borrowers: BorrowerOption[];
  initialValues: FinanceFormValues;
  cancelHref?: string;
  children: (values: FinanceFormValues, error: (field: string) => string | undefined) => ReactNode;
};

const initialState: FinanceFormState = {};

/**
 * Shared frame of the income, liability and bank account forms: borrower
 * choice, save button, messages. After adding, the fields clear for the next row.
 */
export function FinanceFormShell({ action, title, submitLabel, borrowers, initialValues, cancelHref, children }: FinanceFormShellProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const values = state.values ?? initialValues;
  const formKey = state.values ? JSON.stringify(state.values) : `fresh-${state.savedAt ?? 0}`;
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  const onlyBorrower = borrowers.length === 1 ? borrowers[0] : undefined;

  return (
    <form key={formKey} action={formAction} noValidate className={styles.form} aria-label={title}>
      <h3 className={styles.formTitle}>{title}</h3>
      <div className={styles.fields}>
        {onlyBorrower ? (
          <input type="hidden" name="clientId" value={onlyBorrower.value} />
        ) : (
          <SelectField
            id="clientId"
            label="לווה"
            options={borrowers}
            placeholder="בחירת לווה"
            defaultValue={typeof values.clientId === "string" ? values.clientId : ""}
            error={error("clientId")}
          />
        )}
        {children(values, error)}
      </div>
      <FormMessage message={state.error} />
      <div className={styles.formActions}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "שומר..." : submitLabel}
        </Button>
        {cancelHref && (
          <ButtonLink href={cancelHref} variant="quiet">
            ביטול
          </ButtonLink>
        )}
        {state.savedAt && !isPending && (
          <span role="status" className={styles.saved}>
            נשמר
          </span>
        )}
      </div>
    </form>
  );
}

/** A form value as a string, for defaultValue. */
export function text(values: FinanceFormValues, field: string): string | undefined {
  const value = values[field];
  return typeof value === "string" ? value : undefined;
}
