import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import clsx from "clsx";
import styles from "./AuthCard.module.css";

type AuthCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

/** Centered card used by every screen outside the app (login, second factor, setup). */
export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <main id="main" className={clsx("center", styles.page)}>
      <section className={clsx("stack", styles.card)}>
        <div className={styles.badge}>
          <ShieldCheck aria-hidden="true" className={styles.badgeIcon} />
        </div>
        <header className={clsx("stack", styles.header)}>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </header>
        {children}
      </section>
    </main>
  );
}
