import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { TemplateForm } from "@/components/settings/TemplateForm";
import styles from "@/components/settings/Settings.module.css";
import { requireSession } from "@/lib/auth/session";
import { listTemplates } from "@/lib/cases/requirements";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from "@/lib/validation/document";
import { BASE_REQUIREMENTS } from "@/lib/validation/requirement";
import { addTemplateAction, deleteTemplateAction } from "./actions";

export const metadata: Metadata = { title: "הגדרות" };

function Item({ title, category, perBorrower }: { title: string; category: DocumentCategory; perBorrower: boolean }) {
  return (
    <span className={styles.itemText}>
      <span className={styles.itemTitle}>{title}</span>
      <span className={styles.itemMeta}>
        {DOCUMENT_CATEGORY_LABELS[category]} · {perBorrower ? "לכל לווה" : "לכל התיק"}
      </span>
    </span>
  );
}

/** The adviser's settings. For now: the documents every case needs. */
export default async function SettingsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const templates = await listTemplates(supabase, session.organization.id);

  return (
    <div className={styles.page}>
      <PageHeader title="הגדרות" />

      <section className={styles.card} aria-labelledby="requirements-title">
        <div className={styles.cardHeader}>
          <h2 id="requirements-title" className={styles.cardTitle}>מסמכים נדרשים בכל תיק</h2>
          <p className={styles.explain}>
            כל תיק פתוח מקבל את הרשימה הבסיסית ואת המסמכים שתוסיפו כאן. בתוך תיק אפשר לסמן מסמך כ&quot;לא נדרש&quot; או להוסיף מסמך רק לאותו תיק.
          </p>
        </div>

        <h3 className={styles.listTitle}>הרשימה הבסיסית</h3>
        <ul className={styles.list}>
          {BASE_REQUIREMENTS.map((item) => (
            <li key={item.key} className={styles.item}>
              <Item title={item.title} category={item.category} perBorrower={item.perBorrower} />
            </li>
          ))}
        </ul>

        <h3 className={styles.listTitle}>מסמכים שהוספתם</h3>
        {templates.length === 0 ? (
          <p className={styles.explain}>עדיין לא הוספתם מסמכים משלכם.</p>
        ) : (
          <ul className={styles.list}>
            {templates.map((item) => (
              <li key={item.id} className={styles.item}>
                <Item title={item.title} category={item.category} perBorrower={item.per_borrower} />
                <form action={deleteTemplateAction}>
                  <input type="hidden" name="templateId" value={item.id} />
                  <button type="submit" className={styles.remove} aria-label={`הסרת ${item.title} מהרשימה`} title="הסרה מהרשימה">
                    <Trash2 aria-hidden="true" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.explain}>הסרה מכאן לא מוחקת את המסמך מתיקים שכבר יש בהם אותו, רק מפסיקה להוסיף אותו לתיקים.</p>

        <h3 className={styles.listTitle}>הוספת מסמך לרשימה</h3>
        <TemplateForm action={addTemplateAction} />
      </section>
    </div>
  );
}
