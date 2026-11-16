"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MAX_CHILDREN } from "@/lib/validation/client";
import styles from "./ClientForm.module.css";

type ChildrenAgesFieldProps = { initialAges: string[]; error?: string };

type Row = { key: number; age: string };

/** Ages of the client's children, as many rows as needed. Saved as birth years. */
export function ChildrenAgesField({ initialAges, error }: ChildrenAgesFieldProps) {
  const [rows, setRows] = useState<Row[]>(() => initialAges.map((age, index) => ({ key: index, age })));
  const [nextKey, setNextKey] = useState(initialAges.length);

  const under18 = rows.filter((row) => row.age !== "" && Number(row.age) < 18).length;

  function addRow() {
    setRows((current) => [...current, { key: nextKey, age: "" }]);
    setNextKey((key) => key + 1);
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function changeAge(key: number, age: string) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, age } : row)));
  }

  return (
    <fieldset className={styles.children} aria-describedby={error ? "children-error" : undefined}>
      <legend className={styles.childrenLegend}>גילאי הילדים</legend>
      {rows.length === 0 && <p className={styles.muted}>לא הוזנו ילדים.</p>}
      <ul className={styles.childRows}>
        {rows.map((row, index) => (
          <li key={row.key} className={styles.childRow}>
            <label htmlFor={`child-${row.key}`} className="visually-hidden">
              גיל ילד {index + 1}
            </label>
            <input
              id={`child-${row.key}`}
              name="childAge"
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              value={row.age}
              onChange={(event) => changeAge(row.key, event.target.value)}
              className={styles.childInput}
            />
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => removeRow(row.key)}
              aria-label={`הסרת ילד ${index + 1}`}
            >
              <X aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.childrenFooter}>
        <Button variant="secondary" onClick={addRow} disabled={rows.length >= MAX_CHILDREN}>
          <Plus aria-hidden="true" className={styles.buttonIcon} />
          הוספת ילד
        </Button>
        <span className={styles.muted} aria-live="polite">
          מתחת לגיל 18: {under18}
        </span>
      </div>
      {error && (
        <p id="children-error" className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
