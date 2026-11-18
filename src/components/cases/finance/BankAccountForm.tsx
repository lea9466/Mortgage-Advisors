"use client";

import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ACCOUNT_BANK_LABELS, ACCOUNT_BANKS, type FinanceFormValues } from "@/lib/validation/finance";
import { FinanceFormShell, text, type BorrowerOption, type FinanceAction } from "./FinanceFormShell";
import styles from "./Finance.module.css";

const BANK_OPTIONS = ACCOUNT_BANKS.map((value) => ({ value, label: ACCOUNT_BANK_LABELS[value] }));

type BankAccountFormProps = {
  action: FinanceAction;
  borrowers: BorrowerOption[];
  initialValues?: FinanceFormValues;
  /** Masked number of the account being edited, e.g. •••••1234. */
  storedNumber?: string;
  cancelHref?: string;
};

export function BankAccountForm({ action, borrowers, initialValues = {}, storedNumber, cancelHref }: BankAccountFormProps) {
  const editing = storedNumber !== undefined;
  return (
    <FinanceFormShell
      action={action}
      title={editing ? 'עריכת חשבון עו"ש' : 'הוספת חשבון עו"ש'}
      submitLabel={editing ? "שמירת שינויים" : "הוספה"}
      borrowers={borrowers}
      initialValues={initialValues}
      cancelHref={cancelHref}
    >
      {(values, error) => (
        <>
          <SelectField id="bank" label="בנק" options={BANK_OPTIONS} placeholder="בחירת בנק" defaultValue={text(values, "bank") ?? ""} error={error("bank")} />
          <TextField id="branch" label="מספר סניף" inputMode="numeric" maxLength={4} ltr defaultValue={text(values, "branch")} error={error("branch")} />
          <TextField
            id="accountNumber"
            label="מספר חשבון"
            inputMode="numeric"
            maxLength={16}
            autoComplete="off"
            ltr
            defaultValue={text(values, "accountNumber")}
            hint={editing ? `שמור: ${storedNumber}. השאירו ריק כדי לא לשנות.` : "נשמר מוצפן."}
            error={error("accountNumber")}
          />
          <label className={styles.check}>
            <input type="checkbox" name="isJoint" defaultChecked={values.isJoint === true} />
            חשבון משותף
          </label>
        </>
      )}
    </FinanceFormShell>
  );
}
