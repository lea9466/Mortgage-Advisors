"use client";

import { useActionState } from "react";
import type { RequirementResult } from "@/app/(app)/cases/requirement-actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/lib/validation/document";
import styles from "./Requirements.module.css";

type AddAction = (state: RequirementResult, formData: FormData) => Promise<RequirementResult>;

const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({ value, label: DOCUMENT_CATEGORY_LABELS[value] }));
const initialState: RequirementResult = {};

/** Adds a required document to this case only. */
export function AddRequirementForm({ action, borrowers }: { action: AddAction; borrowers: { value: string; label: string }[] }) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={styles.addForm}>
      <TextField id="requirementTitle" label="מסמך נוסף לתיק הזה" maxLength={200} required placeholder="למשל: אישור על מענק עבודה" />
      <SelectField id="requirementCategory" label="קטגוריה" options={CATEGORY_OPTIONS} defaultValue="other" />
      {borrowers.length > 0 && <SelectField id="requirementClient" label="של מי" options={borrowers} placeholder="כל התיק" defaultValue="" />}
      <div className={styles.addActions}>
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "מוסיף..." : "הוספה"}
        </Button>
      </div>
      <FormMessage message={state.error} />
    </form>
  );
}
