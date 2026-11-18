"use client";

import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { LIABILITY_KIND_LABELS, LIABILITY_KINDS, type FinanceFormValues } from "@/lib/validation/finance";
import { FinanceFormShell, text, type BorrowerOption, type FinanceAction } from "./FinanceFormShell";

const KIND_OPTIONS = LIABILITY_KINDS.map((value) => ({ value, label: LIABILITY_KIND_LABELS[value] }));

type LiabilityFormProps = {
  action: FinanceAction;
  borrowers: BorrowerOption[];
  initialValues?: FinanceFormValues;
  editing?: boolean;
  cancelHref?: string;
};

export function LiabilityForm({ action, borrowers, initialValues = {}, editing = false, cancelHref }: LiabilityFormProps) {
  return (
    <FinanceFormShell
      action={action}
      title={editing ? "עריכת התחייבות" : "הוספת התחייבות"}
      submitLabel={editing ? "שמירת שינויים" : "הוספה"}
      borrowers={borrowers}
      initialValues={initialValues}
      cancelHref={cancelHref}
    >
      {(values, error) => (
        <>
          <SelectField id="kind" label="סוג ההתחייבות" options={KIND_OPTIONS} defaultValue={text(values, "kind") ?? "bank_loan"} error={error("kind")} />
          <TextField id="lender" label="הגוף המלווה" maxLength={80} defaultValue={text(values, "lender")} error={error("lender")} />
          <TextField id="balance" label="יתרת ההלוואה" inputMode="numeric" ltr defaultValue={text(values, "balance")} error={error("balance")} />
          <TextField id="monthlyPayment" label="החזר חודשי" inputMode="numeric" ltr defaultValue={text(values, "monthlyPayment")} error={error("monthlyPayment")} />
          <TextField id="remainingMonths" label="חודשים שנותרו" type="number" min={0} max={600} inputMode="numeric" hint="אם רלוונטי" defaultValue={text(values, "remainingMonths")} error={error("remainingMonths")} />
        </>
      )}
    </FinanceFormShell>
  );
}
