"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MAX_CHILDREN } from "@/lib/validation/client";
import styles from "./ClientForm.module.css";

type ChildValue = { age: string; personal: boolean };

type ChildrenAgesFieldProps = {
  initialChildren: ChildValue[];
  /** First names, when the client has a linked spouse: children can then be shared or one parent's own. */
  family?: { clientName: string; spouseName: string };
  error?: string;
};

type Row = ChildValue & { key: number };

/** Ages of the client's children, as many rows as needed. Saved as birth years. */
export function ChildrenAgesField({ initialChildren, family, error }: ChildrenAgesFieldProps) {
  const [rows, setRows] = useState<Row[]>(() => initialChildren.map((child, index) => ({ ...child, key: index })));
  const [nextKey, setNextKey] = useState(initialChildren.length);

  const under18 = rows.filter((row) => row.age !== "" && Number(row.age) < 18).length;

  function addRow() {
    setRows((current) => [...current, { key: nextKey, age: "", personal: false }]);
    setNextKey((key) => key + 1);
  }

  function update(key: number, change: Partial<ChildValue>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  return (
    <fieldset className={styles.children} aria-describedby={error ? "children-error" : undefined}>
      <legend className={styles.childrenLegend}>ילדים</legend>
      {family && (
        <p className={styles.muted}>
          ילדים משותפים מופיעים גם אצל {family.spouseName}. ילד של {family.clientName} בלבד, למשל מנישואים קודמים, מסמנים
          ב&quot;רק של {family.clientName}&quot;.
        </p>
      )}
      {rows.length === 0 && <p className={styles.muted}>לא הוזנו ילדים.</p>}
      <ul className={styles.childRows}>
        {rows.map((row, index) => (
          <li key={row.key} className={styles.childRow}>
            <label htmlFor={`child-${row.key}`} className={styles.childLabel}>
              גיל
            </label>
            <input
              id={`child-${row.key}`}
              name="childAge"
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              value={row.age}
              onChange={(event) => update(row.key, { age: event.target.value })}
              className={styles.childInput}
              aria-label={`גיל ילד ${index + 1}`}
            />
            <input type="hidden" name="childScope" value={row.personal ? "personal" : "shared"} />
            {family && (
              <label className={styles.childScope}>
                <input type="checkbox" checked={row.personal} onChange={(event) => update(row.key, { personal: event.target.checked })} />
                רק של {family.clientName}
              </label>
            )}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
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
