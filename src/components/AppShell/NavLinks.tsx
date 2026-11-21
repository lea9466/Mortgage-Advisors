"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FolderOpen,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Trash2,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { NAV_ITEMS, NAV_SECONDARY_ITEMS, type NavIconName } from "./navigation";
import styles from "./NavLinks.module.css";

const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  clients: Users,
  cases: FolderOpen,
  tasks: ListChecks,
  leads: UserPlus,
  calendar: CalendarDays,
  insights: Lightbulb,
  trash: Trash2,
};

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The five areas plus the dashboard. Always visible, on every screen of the app. */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="ניווט ראשי">
      <ul className={styles.list}>
        {[...NAV_ITEMS, ...NAV_SECONDARY_ITEMS].map((item, index) => {
          const Icon = ICONS[item.icon];
          const current = isCurrent(pathname, item.href);
          return (
            <li key={item.href} className={clsx(styles.item, index === NAV_ITEMS.length && styles.secondary)}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={clsx(styles.link, current && styles.current)}
              >
                <Icon aria-hidden="true" className={styles.icon} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
