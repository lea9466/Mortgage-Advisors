"use client";

import { useActionState, useState } from "react";
import type { ClientFormState } from "@/app/(app)/clients/actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import {
  MARITAL_STATUS_LABELS,
  MARITAL_STATUSES,
  type ClientFormValues,
} from "@/lib/validation/client";
import { ChildrenAgesField } from "./ChildrenAgesField";
import styles from "./ClientForm.module.css";

type ClientAction = (state: ClientFormState, formData: FormData) => Promise<ClientFormState>;

type ClientFormProps = {
  action: ClientAction;
  initialValues: ClientFormValues;
  submitLabel: string;
  cancelHref: string;
  /** Set when editing a client whose ID number is already stored. */
  storedIdNumber?: string;
};

const MARITAL_OPTIONS = MARITAL_STATUSES.map((value) => ({ value, label: MARITAL_STATUS_LABELS[value] }));
const initialState: ClientFormState = {};

export function ClientForm({ action, initialValues, submitLabel, cancelHref, storedIdNumber }: ClientFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const values = state.values ?? initialValues;
  // After a failed save the fields are rebuilt from what the server sent back,
  // so nothing the user typed is lost when the form resets.
  const formKey = state.values ? JSON.stringify(state.values) : "initial";

  return (
    <form key={formKey} action={formAction} noValidate className={styles.form}>
      <ClientFields values={values} errors={state.fieldErrors ?? {}} storedIdNumber={storedIdNumber} />
      <FormMessage message={state.error} />
      <div className={styles.actions}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "שומר..." : submitLabel}
        </Button>
        <ButtonLink href={cancelHref} variant="quiet">
          ביטול
        </ButtonLink>
      </div>
    </form>
  );
}

type ClientFieldsProps = {
  values: ClientFormValues;
  errors: Partial<Record<string, string[]>>;
  storedIdNumber?: string;
};

function ClientFields({ values, errors, storedIdNumber }: ClientFieldsProps) {
  const [hasOtherCitizenship, setHasOtherCitizenship] = useState(values.hasOtherCitizenship ?? false);
  const error = (field: string) => errors[field]?.[0];

  return (
    <>
      <section className={styles.section} aria-labelledby="section-personal">
        <h2 id="section-personal" className={styles.sectionTitle}>פרטים אישיים</h2>
        <div className={styles.fields}>
          <TextField id="firstName" label="שם פרטי" required maxLength={60} autoComplete="off" defaultValue={values.firstName} error={error("firstName")} />
          <TextField id="lastName" label="שם משפחה" required maxLength={60} autoComplete="off" defaultValue={values.lastName} error={error("lastName")} />
          <TextField
            id="idNumber"
            label="מספר תעודת זהות"
            inputMode="numeric"
            maxLength={11}
            autoComplete="off"
            ltr
            defaultValue={values.idNumber}
            hint={storedIdNumber ? `שמור: ${storedIdNumber}. השאירו ריק כדי לא לשנות.` : "נשמר מוצפן."}
            error={error("idNumber")}
          />
          <TextField id="idIssueDate" label="תאריך הנפקת ת״ז" type="date" defaultValue={values.idIssueDate} error={error("idIssueDate")} />
          <TextField id="idExpiryDate" label="תאריך פקיעת ת״ז" type="date" defaultValue={values.idExpiryDate} error={error("idExpiryDate")} />
          <TextField id="birthDate" label="תאריך לידה" type="date" defaultValue={values.birthDate} error={error("birthDate")} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="section-contact">
        <h2 id="section-contact" className={styles.sectionTitle}>פרטי קשר</h2>
        <div className={styles.fields}>
          <TextField id="phone" label="טלפון" type="tel" required maxLength={20} autoComplete="off" ltr defaultValue={values.phone} error={error("phone")} />
          <TextField id="phoneAlt" label="טלפון נוסף" type="tel" maxLength={20} autoComplete="off" ltr defaultValue={values.phoneAlt} error={error("phoneAlt")} />
          <TextField id="email" label="אימייל" type="email" maxLength={254} autoComplete="off" ltr defaultValue={values.email} error={error("email")} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="section-family">
        <h2 id="section-family" className={styles.sectionTitle}>משפחה ואזרחות</h2>
        <div className={styles.fields}>
          <SelectField id="maritalStatus" label="מצב משפחתי" options={MARITAL_OPTIONS} placeholder="לא נבחר" defaultValue={values.maritalStatus ?? ""} error={error("maritalStatus")} />
          <div className={styles.checkField}>
            <label className={styles.check}>
              <input
                type="checkbox"
                name="hasOtherCitizenship"
                checked={hasOtherCitizenship}
                onChange={(event) => setHasOtherCitizenship(event.target.checked)}
              />
              יש אזרחות נוספת
            </label>
            {hasOtherCitizenship && (
              <TextField id="otherCitizenship" label="איזו אזרחות" maxLength={60} defaultValue={values.otherCitizenship} error={error("otherCitizenship")} />
            )}
          </div>
        </div>
        <ChildrenAgesField initialAges={values.childrenAges ?? []} error={error("childrenAges")} />
      </section>

      <section className={styles.section} aria-labelledby="section-address">
        <h2 id="section-address" className={styles.sectionTitle}>כתובת</h2>
        <div className={styles.fields}>
          <TextField id="city" label="יישוב" maxLength={80} defaultValue={values.city} error={error("city")} />
          <TextField id="street" label="רחוב" maxLength={80} defaultValue={values.street} error={error("street")} />
          <TextField id="houseNumber" label="מספר בית" maxLength={10} defaultValue={values.houseNumber} error={error("houseNumber")} />
        </div>
      </section>
    </>
  );
}
