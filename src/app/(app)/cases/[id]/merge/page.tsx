import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { MergeForm } from "@/components/cases/documents/MergeForm";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { requireSession } from "@/lib/auth/session";
import { caseTitle, getCase } from "@/lib/cases/cases";
import { listDocuments } from "@/lib/cases/documents";
import { createClient } from "@/lib/supabase/server";
import { mergeDocumentsAction } from "../../document-actions";
import styles from "../case.module.css";

export const metadata: Metadata = { title: "איחוד מסמכים" };

const MERGEABLE = new Set(["application/pdf", "image/jpeg", "image/png"]);

/** Merge documents of a case into one PDF, or turn a picture into a PDF. */
export default async function MergePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const record = await getCase(supabase, session.organization.id, id.data);
  if (!record) notFound();
  const documents = await listDocuments(supabase, session.organization.id, record.id);
  const candidates = documents
    .filter((document) => MERGEABLE.has(document.files.content_type))
    .map((document) => ({
      id: document.id,
      title: document.title,
      category: document.category,
      contentType: document.files.content_type,
      size: document.files.size_bytes,
    }));
  const backHref = `/cases/${record.id}?tab=documents`;

  return (
    <div className={styles.page}>
      <PageHeader
        title="איחוד מסמכים והמרה ל-PDF"
        description={caseTitle(record.purpose, record.case_borrowers.map((link) => link.clients))}
        back={{ href: backHref, label: "חזרה למסמכים" }}
      />
      {candidates.length === 0 ? (
        <p className={styles.later}>אין בתיק קובצי PDF או תמונות. העלו מסמכים בלשונית המסמכים.</p>
      ) : (
        <MergeForm candidates={candidates} action={mergeDocumentsAction.bind(null, record.id)} cancelHref={backHref} />
      )}
    </div>
  );
}
