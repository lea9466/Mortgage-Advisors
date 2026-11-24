"use client";

import { useActionState } from "react";
import type { TemplateResult } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/lib/validation/document";
import styles from "./Settings.module.css";

type TemplateAction = (state: TemplateResult, formData: FormData) => Promise<TemplateResult>;

const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({ value, label: DOCUMENT_CATEGORY_LABELS[value] }));
const initialState: TemplateResult = {};

/** Adds an item to the document list of every case. */
export function TemplateForm({ action }: { action: TemplateAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    // React empties the form by itself after each save.
    <form action={formAction} className={styles.addForm}>
      <TextField id="title" label="שם המסמך" maxLength={200} required placeholder="למשל: אישור ותק מהמעסיק" />
      <SelectField id="category" label="קטגוריה" options={CATEGORY_OPTIONS} defaultValue="other" />
      <fieldset className={styles.scope}>
        <legend className={styles.legend}>למי</legend>
        <label className={styles.radio}>
          <input type="radio" name="scope" value="borrower" defaultChecked />
          לכל לווה בנפרד
        </label>
        <label className={styles.radio}>
          <input type="radio" name="scope" value="case" />
          פעם אחת לכל התיק
        </label>
      </fieldset>
      <div className={styles.addActions}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "מוסיף..." : "הוספה לרשימה"}
        </Button>
      </div>
      <FormMessage message={state.error} />
    </form>
  );
}
