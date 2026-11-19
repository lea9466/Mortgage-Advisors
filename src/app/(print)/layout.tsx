import type { ReactNode } from "react";
import { IdleLogout } from "@/components/auth/IdleLogout";
import { requireSession } from "@/lib/auth/session";

/** Pages meant for printing or saving as PDF: same sign-in rules as the app, without the navigation. */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <>
      <IdleLogout />
      {children}
    </>
  );
}
