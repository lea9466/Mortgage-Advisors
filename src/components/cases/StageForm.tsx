import { changeStageAction } from "@/app/(app)/cases/actions";
import { Button } from "@/components/ui/Button";
import { CASE_STAGE_LABELS, CASE_STAGES, type CaseStage } from "@/lib/validation/case";
import styles from "./StageForm.module.css";

type StageFormProps = { caseId: string; stage: CaseStage };

/** Moves a case to another stage. Works without JavaScript. */
export function StageForm({ caseId, stage }: StageFormProps) {
  return (
    <form action={changeStageAction.bind(null, caseId)} className={styles.form}>
      <label htmlFor="stage" className="visually-hidden">
        שלב התיק
      </label>
      <select id="stage" name="stage" defaultValue={stage} className={styles.select}>
        {CASE_STAGES.map((value) => (
          <option key={value} value={value}>
            {CASE_STAGE_LABELS[value]}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary">
        עדכון שלב
      </Button>
    </form>
  );
}
