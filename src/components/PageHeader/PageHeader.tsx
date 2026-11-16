import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import styles from "./PageHeader.module.css";

type PageHeaderProps = {
  title: string;
  description?: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
};

/** Title row of an inner page, with an optional back link and actions on the far side. */
export function PageHeader({ title, description, back, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {back && (
          <Link href={back.href} className={styles.back}>
            <ChevronRight aria-hidden="true" className={styles.backIcon} />
            {back.label}
          </Link>
        )}
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
