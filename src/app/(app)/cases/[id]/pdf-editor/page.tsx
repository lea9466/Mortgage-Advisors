import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PdfEditor } from "@/components/cases/documents/editor/PdfEditor";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { requireSession } from "@/lib/auth/session";
import { caseTitle, getCase } from "@/lib/cases/cases";
import { listDocuments } from "@/lib/cases/documents";
import { createClient } from "@/lib/supabase/server";
import { composeDocumentAction } from "../../document-actions";
import styles from "../case.module.css";

export const metadata: Metadata = { title: "עריכת מסמכים" };

const EDITABLE = new Set(["application/pdf", "image/jpeg", "image/png"]);

/** Build a new PDF from pages of the case's documents: merge, split, reorder, turn, or a picture to PDF. */
export default async function PdfEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const record = await getCase(supabase, session.organization.id, id.data);
  if (!record) notFound();
  const documents = await listDocuments(supabase, session.organization.id, record.id);
  const sources = documents
    .filter((document) => EDITABLE.has(document.files.content_type))
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
        title="עריכת מסמכים"
        description={caseTitle(record.purpose, record.case_borrowers.map((link) => link.clients))}
        back={{ href: backHref, label: "חזרה למסמכים" }}
      />
      {sources.length === 0 ? (
        <p className={styles.later}>אין בתיק קובצי PDF או תמונות. העלו מסמכים בלשונית המסמכים.</p>
      ) : (
        <PdfEditor sources={sources} save={composeDocumentAction.bind(null, record.id)} cancelHref={backHref} />
      )}
    </div>
  );
}
