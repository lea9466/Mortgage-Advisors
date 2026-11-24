"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import type { RequirementResult } from "@/app/(app)/cases/requirement-actions";
import type { CaseRequirement } from "@/lib/cases/requirements";
import { REQUIREMENT_STATUS_LABELS, REQUIREMENT_STATUSES, type RequirementStatus, type RequirementUpdate } from "@/lib/validation/requirement";
import styles from "./Requirements.module.css";

type RequirementRowProps = {
  item: CaseRequirement;
  documents: { id: string; title: string }[];
  save: (input: RequirementUpdate) => Promise<RequirementResult>;
};

const STATUS_CLASS: Record<RequirementStatus, string | undefined> = {
  missing: styles.missing,
  received: styles.received,
  approved: styles.approved,
  needs_fix: styles.needsFix,
  not_needed: styles.notNeeded,
};

/** One required document: its status, the document in the case that answers it, and a short note. Saved on change. */
export function RequirementRow({ item, documents, save }: RequirementRowProps) {
  const [values, setValues] = useState<RequirementUpdate>({ status: item.status, documentId: item.document_id, note: item.note ?? "" });
  const [error, setError] = useState<string | undefined>();
  const [isSaving, startSaving] = useTransition();

  function commit(next: RequirementUpdate) {
    setValues(next);
    setError(undefined);
    startSaving(async () => {
      const result = await save(next);
      if (result.error) setError(result.error);
    });
  }

  function chooseDocument(documentId: string | null) {
    // Linking a document to a missing item means it arrived.
    const status = documentId && values.status === "missing" ? "received" : values.status;
    commit({ ...values, documentId, status });
  }

  const statusId = `status-${item.id}`;
  const documentFieldId = `document-${item.id}`;
  const noteId = `note-${item.id}`;

  return (
    <li className={clsx(styles.row, values.status === "not_needed" && styles.rowMuted)} aria-busy={isSaving}>
      <span className={styles.rowTitle}>{item.title}</span>
      <label htmlFor={statusId} className="visually-hidden">
        מצב: {item.title}
      </label>
      <select
        id={statusId}
        value={values.status}
        onChange={(event) => commit({ ...values, status: REQUIREMENT_STATUSES.find((status) => status === event.target.value) ?? "missing" })}
        className={clsx(styles.status, STATUS_CLASS[values.status])}
      >
        {REQUIREMENT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {REQUIREMENT_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <label htmlFor={documentFieldId} className="visually-hidden">
        המסמך בתיק: {item.title}
      </label>
      <select
        id={documentFieldId}
        value={values.documentId ?? ""}
        onChange={(event) => chooseDocument(documents.find((document) => document.id === event.target.value)?.id ?? null)}
        className={styles.document}
      >
        <option value="">{documents.length === 0 ? "אין עדיין מסמכים בתיק" : "קישור למסמך מהתיק"}</option>
        {documents.map((document) => (
          <option key={document.id} value={document.id}>
            {document.title}
          </option>
        ))}
      </select>
      <label htmlFor={noteId} className="visually-hidden">
        הערה: {item.title}
      </label>
      <input
        id={noteId}
        value={values.note}
        maxLength={300}
        placeholder="הערה (למשל: חסר עמוד 2)"
        onChange={(event) => setValues({ ...values, note: event.target.value })}
        onBlur={() => {
          if (values.note.trim() !== (item.note ?? "")) commit(values);
        }}
        className={styles.note}
      />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </li>
  );
}
