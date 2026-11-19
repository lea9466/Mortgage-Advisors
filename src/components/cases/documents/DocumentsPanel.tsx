import Link from "next/link";
import { FileImage, FileSpreadsheet, FileText, ShieldAlert } from "lucide-react";
import {
  finishUploadAction,
  hideDocumentAction,
  startUploadAction,
  updateDocumentAction,
} from "@/app/(app)/cases/document-actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import type { CaseBorrower } from "@/lib/cases/cases";
import type { CaseDocument } from "@/lib/cases/documents";
import { formatDate } from "@/lib/format";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, formatFileSize } from "@/lib/validation/document";
import { DocumentUploader } from "./DocumentUploader";
import styles from "./Documents.module.css";

type DocumentsPanelProps = { caseId: string; borrowers: CaseBorrower[]; documents: CaseDocument[]; editId?: string };

const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((value) => ({ value, label: DOCUMENT_CATEGORY_LABELS[value] }));

function Icon({ contentType }: { contentType: string }) {
  if (contentType.startsWith("image/")) return <FileImage aria-hidden="true" className={styles.fileIcon} />;
  if (contentType.includes("sheet") || contentType.includes("excel")) return <FileSpreadsheet aria-hidden="true" className={styles.fileIcon} />;
  return <FileText aria-hidden="true" className={styles.fileIcon} />;
}

/** The documents of a case by category, with upload, view, download, rename and remove. */
export function DocumentsPanel({ caseId, borrowers, documents, editId }: DocumentsPanelProps) {
  const options = borrowers.map((borrower) => ({ value: borrower.id, label: `${borrower.first_name} ${borrower.last_name}` }));
  const nameOf = (clientId: string | null) => options.find((option) => option.value === clientId)?.label;
  const tabHref = `/cases/${caseId}?tab=documents`;
  const hide = hideDocumentAction.bind(null, caseId);

  return (
    <div className={styles.panel}>
      <DocumentUploader
        borrowers={options}
        start={startUploadAction.bind(null, caseId)}
        finish={finishUploadAction.bind(null, caseId)}
      />

      {documents.length === 0 ? (
        <p className={styles.empty}>עדיין לא הועלו מסמכים לתיק.</p>
      ) : (
        DOCUMENT_CATEGORIES.map((category) => {
          const inCategory = documents.filter((document) => document.category === category);
          if (inCategory.length === 0) return null;
          return (
            <section key={category} className={styles.group} aria-label={DOCUMENT_CATEGORY_LABELS[category]}>
              <h3 className={styles.groupTitle}>
                {DOCUMENT_CATEGORY_LABELS[category]} <span className={styles.count}>{inCategory.length}</span>
              </h3>
              <ul className={styles.list}>
                {inCategory.map((document) =>
                  document.id === editId ? (
                    <li key={document.id} className={styles.editRow}>
                      <form action={updateDocumentAction.bind(null, caseId, document.id)} className={styles.editForm}>
                        <TextField id="title" label="שם המסמך" defaultValue={document.title} maxLength={200} required />
                        <SelectField id="category" label="קטגוריה" options={CATEGORY_OPTIONS} defaultValue={document.category} />
                        {options.length > 0 && (
                          <SelectField id="clientId" label="של מי המסמך" options={options} placeholder="כל התיק" defaultValue={document.client_id ?? ""} />
                        )}
                        <div className={styles.editActions}>
                          <Button type="submit">שמירה</Button>
                          <ButtonLink href={tabHref} variant="quiet">ביטול</ButtonLink>
                        </div>
                      </form>
                    </li>
                  ) : (
                    <li key={document.id} className={styles.row}>
                      <Icon contentType={document.files.content_type} />
                      <div className={styles.rowText}>
                        <a href={`/api/documents/${document.id}`} target="_blank" rel="noopener noreferrer" className={styles.title}>
                          {document.title}
                        </a>
                        <span className={styles.meta}>
                          {nameOf(document.client_id) && <span>{nameOf(document.client_id)}</span>}
                          <span>{formatDate(document.created_at)}</span>
                          <span>{formatFileSize(document.files.size_bytes)}</span>
                          {document.files.is_sensitive && (
                            <span className={styles.sensitive}>
                              <ShieldAlert aria-hidden="true" className={styles.smallIcon} />
                              רגיש
                            </span>
                          )}
                        </span>
                      </div>
                      <div className={styles.rowActions}>
                        <a href={`/api/documents/${document.id}?download=1`} className={styles.action}>הורדה</a>
                        <Link href={`${tabHref}&edit=${document.id}`} className={styles.action} scroll={false}>עריכה</Link>
                        <form action={hide}>
                          <input type="hidden" name="documentId" value={document.id} />
                          <input type="hidden" name="title" value={document.title} />
                          <button type="submit" className={styles.hide}>הסרה</button>
                        </form>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </section>
          );
        })
      )}
      <p className={styles.note}>
        הסרה מוציאה את המסמך מהתיק, אבל הקובץ המקורי נשמר. כל צפייה והורדה נרשמת ביומן הפעולות.
      </p>
    </div>
  );
}
