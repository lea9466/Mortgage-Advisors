"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import { FileImage, FileText } from "lucide-react";
import type { MergeState } from "@/app/(app)/cases/document-actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, formatFileSize, type DocumentCategory } from "@/lib/validation/document";
import styles from "./Merge.module.css";

export type MergeCandidate = { id: string; title: string; category: DocumentCategory; contentType: string; size: number };
type MergeAction = (state: MergeState, formData: FormData) => Promise<MergeState>;

const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({ value, label: DOCUMENT_CATEGORY_LABELS[value] }));
const initialState: MergeState = {};

/** Pick documents in the order their pages should appear; a single picture becomes a PDF. */
export function MergeForm({ candidates, action, cancelHref }: { candidates: MergeCandidate[]; action: MergeAction; cancelHref: string }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [order, setOrder] = useState<string[]>([]);
  const first = candidates.find((candidate) => candidate.id === order[0]);

  function toggle(id: string) {
    setOrder((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  const onlyPicture = order.length === 1 && first?.contentType.startsWith("image/");
  const defaultTitle = order.length === 1 && first ? first.title : "מסמך מאוחד";

  return (
    <form action={formAction} className={styles.form}>
      <p className={styles.explain}>לחצו על המסמכים לפי הסדר שבו הדפים יופיעו בקובץ החדש. לחיצה נוספת מבטלת בחירה.</p>
      <ul className={styles.list}>
        {candidates.map((candidate) => {
          const position = order.indexOf(candidate.id);
          const selected = position >= 0;
          const Icon = candidate.contentType.startsWith("image/") ? FileImage : FileText;
          return (
            <li key={candidate.id}>
              <button
                type="button"
                className={clsx(styles.item, selected && styles.selected)}
                aria-pressed={selected}
                onClick={() => toggle(candidate.id)}
              >
                <span className={styles.badge} aria-hidden="true">{selected ? position + 1 : ""}</span>
                <Icon aria-hidden="true" className={styles.icon} />
                <span className={styles.title}>{candidate.title}</span>
                <span className={styles.meta}>
                  {candidate.contentType === "application/pdf" ? "PDF" : "תמונה"} · {formatFileSize(candidate.size)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {order.map((id) => (
        <input key={id} type="hidden" name="documentId" value={id} />
      ))}

      <div className={styles.fields}>
        <TextField key={`title-${defaultTitle}`} id="title" label="שם המסמך החדש" defaultValue={defaultTitle} maxLength={200} required />
        <SelectField key={`category-${first?.category ?? "other"}`} id="category" label="קטגוריה" options={CATEGORY_OPTIONS} defaultValue={first?.category ?? "other"} />
      </div>
      <FormMessage message={state.error} />
      <div className={styles.actions}>
        <Button type="submit" disabled={isPending || order.length === 0}>
          {isPending ? "יוצר..." : onlyPicture ? "המרה ל-PDF" : order.length > 1 ? `איחוד ${order.length} מסמכים` : "יצירת PDF"}
        </Button>
        <ButtonLink href={cancelHref} variant="quiet">ביטול</ButtonLink>
      </div>
      <p className={styles.note}>המסמכים המקוריים נשארים בתיק כמו שהם. התוצאה נשמרת כמסמך חדש.</p>
    </form>
  );
}
