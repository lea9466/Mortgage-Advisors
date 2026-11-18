"use client";

import { useState } from "react";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import {
  INCOME_FIELD_LABELS,
  INCOME_KIND_LABELS,
  INCOME_KINDS,
  INCOME_KINDS_WITH_SENIORITY,
  type FinanceFormValues,
  type IncomeKind,
} from "@/lib/validation/finance";
import { FinanceFormShell, text, type BorrowerOption, type FinanceAction } from "./FinanceFormShell";
import styles from "./Finance.module.css";

const KIND_OPTIONS = INCOME_KINDS.map((value) => ({ value, label: INCOME_KIND_LABELS[value] }));

type IncomeFormProps = {
  action: FinanceAction;
  borrowers: BorrowerOption[];
  initialValues?: FinanceFormValues;
  editing?: boolean;
  cancelHref?: string;
};

export function IncomeForm({ action, borrowers, initialValues = {}, editing = false, cancelHref }: IncomeFormProps) {
  return (
    <FinanceFormShell
      action={action}
      title={editing ? "עריכת הכנסה" : "הוספת הכנסה"}
      submitLabel={editing ? "שמירת שינויים" : "הוספה"}
      borrowers={borrowers}
      initialValues={initialValues}
      cancelHref={cancelHref}
    >
      {(values, error) => <IncomeFields values={values} error={error} />}
    </FinanceFormShell>
  );
}

function IncomeFields({ values, error }: { values: FinanceFormValues; error: (field: string) => string | undefined }) {
  const initialKind = (INCOME_KINDS as readonly string[]).includes(text(values, "kind") ?? "")
    ? (text(values, "kind") as IncomeKind)
    : "employee";
  const [kind, setKind] = useState<IncomeKind>(initialKind);
  const labels = INCOME_FIELD_LABELS[kind];
  const withSeniority = INCOME_KINDS_WITH_SENIORITY.includes(kind);

  return (
    <>
      <SelectField
        id="kind"
        label="סוג הכנסה"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(event) => setKind(event.target.value as IncomeKind)}
        error={error("kind")}
      />
      <TextField id="title" label={labels.title} maxLength={120} defaultValue={text(values, "title")} error={error("title")} />
      {kind === "employee" && (
        <TextField id="jobTitle" label="תפקיד" maxLength={80} defaultValue={text(values, "jobTitle")} error={error("jobTitle")} />
      )}
      {withSeniority && (
        <fieldset className={styles.seniority}>
          <legend className="visually-hidden">ותק</legend>
          <TextField id="seniorityYears" label="ותק (שנים)" type="number" min={0} max={60} inputMode="numeric" defaultValue={text(values, "seniorityYears")} error={error("seniorityYears")} />
          <TextField id="seniorityMonths" label="ותק (חודשים)" type="number" min={0} max={11} inputMode="numeric" defaultValue={text(values, "seniorityMonths")} error={error("seniorityMonths")} />
        </fieldset>
      )}
      <TextField id="monthlyAmount" label={labels.amount} inputMode="numeric" ltr defaultValue={text(values, "monthlyAmount")} error={error("monthlyAmount")} />
    </>
  );
}
