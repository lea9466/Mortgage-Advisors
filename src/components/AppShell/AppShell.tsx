import type { ReactNode } from "react";
import { IdleLogout } from "@/components/auth/IdleLogout";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { NavLinks } from "./NavLinks";
import styles from "./AppShell.module.css";

type AppShellProps = {
  organizationName: string;
  userEmail: string;
  children: ReactNode;
};

/** Frame of the signed-in app: persistent navigation, account strip, page content. */
export function AppShell({ organizationName, userEmail, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <IdleLogout />
      <aside className={styles.sidebar}>
        <p className={styles.organization}>{organizationName}</p>
        <NavLinks />
        <div className={styles.account}>
          <span dir="ltr" className={styles.email}>
            {userEmail}
          </span>
          <LogoutButton />
        </div>
      </aside>
      <main id="main" className={styles.content}>
        {children}
      </main>
    </div>
  );
}
