import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { RotateCcw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { requireSession } from "@/lib/auth/session";
import { listTrash } from "@/lib/cases/trash";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatCaseNumber, PURPOSE_LABELS } from "@/lib/validation/case";
import { DOCUMENT_CATEGORY_LABELS, formatFileSize } from "@/lib/validation/document";
import { deleteDocumentPermanentlyAction, restoreDocumentAction } from "./actions";
import styles from "./trash.module.css";

export const metadata: Metadata = { title: "סל מחזור" };

const searchSchema = z.object({
  case: z.uuid().optional().catch(undefined),
  confirm: z.uuid().optional().catch(undefined),
});

/** Documents removed from cases. Restore them, or delete them for good. */
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const search = searchSchema.parse(await searchParams);
  const supabase = await createClient();
  const documents = await listTrash(supabase, session.organization.id, search.case);

  const base = search.case ? `/trash?case=${search.case}` : "/trash";
  const confirmHref = (id: string) => `${base}${search.case ? "&" : "?"}confirm=${id}`;

  return (
    <div className={styles.page}>
      <PageHeader
        title="סל מחזור"
        description="מסמכים שהוסרו מתיקים. אפשר להחזיר אותם לתיק, או למחוק לצמיתות."
        actions={search.case ? <ButtonLink href="/trash" variant="secondary">כל המסמכים בסל</ButtonLink> : undefined}
      />

      {documents.length === 0 ? (
        <p className={styles.empty}>{search.case ? "אין בסל מסמכים מהתיק הזה." : "סל המחזור ריק."}</p>
      ) : (
        <ul className={styles.list}>
          {documents.map((document) => {
            const caseLabel = `${PURPOSE_LABELS[document.cases.purpose]} ${formatCaseNumber(document.cases.case_year, document.cases.case_seq)}`;
            return (
              <li key={document.id} className={styles.row}>
                <div className={styles.text}>
                  <span className={styles.title}>{document.title}</span>
                  <span className={styles.meta}>
                    <Link href={`/cases/${document.cases.id}?tab=documents`}>{caseLabel}</Link>
                    <span>{DOCUMENT_CATEGORY_LABELS[document.category]}</span>
                    <span>{formatFileSize(document.files.size_bytes)}</span>
                    <span>הוסר {formatDate(document.deleted_at)}</span>
                  </span>
                </div>

                {search.confirm === document.id ? (
                  <form action={deleteDocumentPermanentlyAction} className={styles.confirm}>
                    <input type="hidden" name="documentId" value={document.id} />
                    <input type="hidden" name="confirm" value="delete" />
                    {search.case && <input type="hidden" name="caseFilter" value={search.case} />}
                    <p role="alert" className={styles.warning}>
                      למחוק לצמיתות? הקובץ יימחק מהמערכת ואי אפשר יהיה לשחזר אותו.
                    </p>
                    <div className={styles.actions}>
                      <Button type="submit" className={styles.danger}>
                        <Trash2 aria-hidden="true" className={styles.icon} />
                        כן, למחוק לצמיתות
                      </Button>
                      <ButtonLink href={base} variant="quiet">ביטול</ButtonLink>
                    </div>
                  </form>
                ) : (
                  <div className={styles.actions}>
                    <form action={restoreDocumentAction}>
                      <input type="hidden" name="documentId" value={document.id} />
                      {search.case && <input type="hidden" name="caseFilter" value={search.case} />}
                      <Button type="submit" variant="secondary">
                        <RotateCcw aria-hidden="true" className={styles.icon} />
                        שחזור לתיק
                      </Button>
                    </form>
                    <Link href={confirmHref(document.id)} className={styles.deleteLink} scroll={false}>
                      מחיקה לצמיתות
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.note}>מחיקה לצמיתות נרשמת ביומן הפעולות: מי מחק ומתי. תוכן הקובץ לא נשמר.</p>
    </div>
  );
}
