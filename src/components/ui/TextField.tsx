import type { InputHTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./TextField.module.css";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  ltr?: boolean;
};

export function TextField({ id, label, hint, error, ltr = false, className, ...rest }: TextFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = clsx(hint && hintId, error && errorId) || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        dir={ltr ? "ltr" : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(styles.input, ltr && styles.ltr, error && styles.inputError, className)}
        {...rest}
      />
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
