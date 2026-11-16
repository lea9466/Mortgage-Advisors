import type { SelectHTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./TextField.module.css";

type Option = { value: string; label: string };

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "name"> & {
  id: string;
  label: string;
  options: readonly Option[];
  placeholder?: string;
  error?: string;
};

export function SelectField({ id, label, options, placeholder, error, className, ...rest }: SelectFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={clsx(styles.input, error && styles.inputError, className)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
