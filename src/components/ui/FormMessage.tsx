import { CircleAlert } from "lucide-react";
import styles from "./FormMessage.module.css";

type FormMessageProps = { message?: string };

/** Error line for a form. Rendered as text only, with an icon as well as colour. */
export function FormMessage({ message }: FormMessageProps) {
  if (!message) return null;
  return (
    <p role="alert" className={styles.error}>
      <CircleAlert aria-hidden="true" className={styles.icon} />
      <span>{message}</span>
    </p>
  );
}
