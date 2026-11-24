import Link from "next/link";
import { addCaseRequirementAction, updateRequirementAction } from "@/app/(app)/cases/requirement-actions";
import type { CaseRequirement } from "@/lib/cases/requirements";
import { requirementProgress } from "@/lib/validation/requirement";
import { AddRequirementForm } from "./AddRequirementForm";
import { RequirementRow } from "./RequirementRow";
import styles from "./Requirements.module.css";

type RequirementsPanelProps = {
  caseId: string;
  borrowers: { value: string; label: string }[];
  requirements: CaseRequirement[];
  documents: { id: string; title: string }[];
};

/** Which documents the case needs, what arrived and what was approved. */
export function RequirementsPanel({ caseId, borrowers, requirements, documents }: RequirementsPanelProps) {
  const progress = requirementProgress(requirements.map((item) => item.status));
  const groups = [
    { key: "case", title: "לכל התיק", items: requirements.filter((item) => item.client_id === null) },
    ...borrowers.map((borrower) => ({ key: borrower.value, title: borrower.label, items: requirements.filter((item) => item.client_id === borrower.value) })),
  ].filter((group) => group.items.length > 0);

  return (
    <section className={styles.panel} aria-labelledby="requirements-title">
      <div className={styles.header}>
        <h3 id="requirements-title" className={styles.title}>
          מעקב מסמכים
        </h3>
        <Link href="/settings" className={styles.settingsLink}>
          הוספת מסמכים קבועים לכל התיקים
        </Link>
      </div>

      <div className={styles.progress}>
        <span className={styles.percent}>{progress.percent}%</span>
        <progress value={progress.approved} max={Math.max(progress.needed, 1)} className={styles.bar} aria-label="אחוז המסמכים שאושרו" />
        <span className={styles.progressText}>
          {progress.approved} מתוך {progress.needed} אושרו
          {progress.received > 0 && ` · ${progress.received} התקבלו וממתינים לבדיקה`}
        </span>
      </div>

      {groups.map((group) => (
        <div key={group.key} className={styles.group}>
          <h4 className={styles.groupTitle}>{group.title}</h4>
          <ul className={styles.list}>
            {group.items.map((item) => (
              <RequirementRow key={item.id} item={item} documents={documents} save={updateRequirementAction.bind(null, caseId, item.id)} />
            ))}
          </ul>
        </div>
      ))}

      <AddRequirementForm action={addCaseRequirementAction.bind(null, caseId)} borrowers={borrowers} />
    </section>
  );
}
