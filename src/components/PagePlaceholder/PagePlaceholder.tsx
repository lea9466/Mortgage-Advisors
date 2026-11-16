import { Construction } from "lucide-react";
import clsx from "clsx";
import styles from "./PagePlaceholder.module.css";

type PagePlaceholderProps = {
  title: string;
  summary: string;
  stage: string;
};

/** Stand-in for an area that is built in a later stage. */
export function PagePlaceholder({ title, summary, stage }: PagePlaceholderProps) {
  return (
    <>
      <header className={clsx("stack", styles.header)}>
        <h1>{title}</h1>
        <p className={styles.summary}>{summary}</p>
      </header>
      <section className={styles.notice}>
        <Construction aria-hidden="true" className={styles.icon} />
        <p>האזור הזה ייבנה ב{stage}.</p>
      </section>
    </>
  );
}
