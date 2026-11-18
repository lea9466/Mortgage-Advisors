"use client";

import { useActionState, useState } from "react";
import type { CaseDetailsState } from "@/app/(app)/cases/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { TextField } from "@/components/ui/TextField";
import {
  APARTMENT_CLASS_LABELS,
  APARTMENT_CLASSES,
  HAND_LABELS,
  HANDS,
  type CaseDetailsFormValues,
  type MortgagePurpose,
} from "@/lib/validation/case";
import styles from "./PropertyForm.module.css";

type DetailsAction = (state: CaseDetailsState, formData: FormData) => Promise<CaseDetailsState>;

type PropertyFormProps = {
  action: DetailsAction;
  purpose: MortgagePurpose;
  initialValues: CaseDetailsFormValues;
  saved: boolean;
};

const initialState: CaseDetailsState = {};
const toNumber = (value: string | undefined) => {
  const digits = value?.replace(/[\s,₪]/g, "") ?? "";
  return /^\d+$/.test(digits) ? Number(digits) : null;
};
const shekels = (value: number) => `₪${value.toLocaleString("en-US")}`;

export function PropertyForm({ action, purpose, initialValues, saved }: PropertyFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const values = state.values ?? initialValues;
  const formKey = state.values ? JSON.stringify(state.values) : "initial";

  return (
    <form key={formKey} action={formAction} noValidate className={styles.form}>
      {purpose === "purchase" ? (
        <PurchaseFields values={values} errors={state.fieldErrors ?? {}} />
      ) : (
        <div className={styles.fields}>
          <TextField id="propertyValue" label="שווי הנכס" inputMode="numeric" ltr defaultValue={values.propertyValue} error={state.fieldErrors?.propertyValue?.[0]} />
          <TextField id="requestedAmount" label="משכנתא מבוקשת" inputMode="numeric" ltr defaultValue={values.requestedAmount} error={state.fieldErrors?.requestedAmount?.[0]} />
          <p className={styles.note}>השדות הנוספים של מטרה זו יתווספו כשהיועץ ישלח אותם.</p>
        </div>
      )}
      <FormMessage message={state.error} />
      <div className={styles.actions}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "שומר..." : "שמירה"}
        </Button>
        {saved && !state.values && (
          <span role="status" className={styles.saved}>
            נשמר
          </span>
        )}
      </div>
    </form>
  );
}

function PurchaseFields({ values, errors }: { values: CaseDetailsFormValues; errors: Partial<Record<string, string[]>> }) {
  const [contract, setContract] = useState(values.contractPrice ?? "");
  const [equity, setEquity] = useState(values.equity ?? "");
  const [requested, setRequested] = useState(values.requestedAmount ?? "");
  const c = toNumber(contract);
  const e = toNumber(equity);
  const r = toNumber(requested);
  const expected = c !== null && e !== null ? c - e : null;

  return (
    <>
      <div className={styles.fields}>
        <ChoiceGroup name="hand" legend="יד ראשונה / שנייה" options={HANDS} labels={HAND_LABELS} value={values.hand} />
        <ChoiceGroup name="apartmentClass" legend="סיווג הדירה" options={APARTMENT_CLASSES} labels={APARTMENT_CLASS_LABELS} value={values.apartmentClass} />
      </div>
      <div className={styles.fields}>
        <TextField id="contractPrice" label="מחיר חוזה" inputMode="numeric" ltr value={contract} onChange={(event) => setContract(event.target.value)} error={errors.contractPrice?.[0]} />
        <TextField id="equity" label="הון עצמי" inputMode="numeric" ltr value={equity} onChange={(event) => setEquity(event.target.value)} error={errors.equity?.[0]} />
        <TextField id="requestedAmount" label="משכנתא מבוקשת" inputMode="numeric" ltr value={requested} onChange={(event) => setRequested(event.target.value)} error={errors.requestedAmount?.[0]} />
      </div>
      {expected !== null && (
        <p className={styles.calc} aria-live="polite">
          מחיר חוזה {shekels(c ?? 0)} פחות הון עצמי {shekels(e ?? 0)} = <b>{shekels(expected)}</b>
          {r !== null && r !== expected && <span className={styles.mismatch}> · לא תואם למשכנתא המבוקשת ({shekels(r)})</span>}
        </p>
      )}
    </>
  );
}

type ChoiceGroupProps<T extends string> = {
  name: string;
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
  value?: string;
};

function ChoiceGroup<T extends string>({ name, legend, options, labels, value }: ChoiceGroupProps<T>) {
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.chips}>
        {options.map((option) => (
          <label key={option} className={styles.chip}>
            <input type="radio" name={name} value={option} defaultChecked={value === option} />
            <span>{labels[option]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
