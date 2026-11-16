import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell/AppShell";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <AppShell organizationName={session.organization.name} userEmail={session.user.email}>
      {children}
    </AppShell>
  );
}
