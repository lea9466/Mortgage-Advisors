import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { NAV_ITEMS } from "@/components/AppShell/navigation";
import { requireSession } from "@/lib/auth/session";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "לוח בקרה" };

const AREA_NOTES: Record<string, string> = {
  "/clients": "מאגר הלקוחות: הוספה, חיפוש לפי שם או תעודת זהות, וכרטיס לקוח.",
  "/cases": "סביבת העבודה המרכזית. ייבנה בשלב 2.",
  "/tasks": "משימות ותזכורות. ייבנה בשלב 5.",
  "/leads": "לקוחות פוטנציאליים. ייבנה בשלב 5.",
  "/calendar": "פגישות ותזכורות. ייבנה בשלב 5.",
};

export default async function DashboardPage() {
  const session = await requireSession();
  const areas = NAV_ITEMS.filter((item) => item.href !== "/");

  return (
    <>
      <header className={clsx("stack", styles.header)}>
        <h1>לוח בקרה</h1>
        <p className={styles.lead}>
          התשתית מוכנה: כניסה מאובטחת עם אימות דו-שלבי, הפרדה בין משרדים ויומן פעולות. המשרד
          המחובר הוא {session.organization.name}.
        </p>
      </header>
      <ul className={clsx("card-row", styles.areas)}>
        {areas.map((area) => (
          <li key={area.href} className={clsx("stack", styles.area)}>
            <h2 className={styles.areaTitle}>
              <Link href={area.href}>{area.label}</Link>
            </h2>
            <p className={styles.areaNote}>{AREA_NOTES[area.href]}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
