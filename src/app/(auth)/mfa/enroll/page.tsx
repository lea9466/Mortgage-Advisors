import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard/AuthCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { MfaEnrollment } from "@/components/auth/MfaEnrollment";
import { getAuthStage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "הגדרת אימות דו-שלבי" };

export default async function MfaEnrollPage() {
  const supabase = await createClient();
  const auth = await getAuthStage(supabase);

  if (auth.stage === "signed-out") redirect("/login");
  if (auth.stage === "verified") redirect("/");
  if (auth.stage === "needs-mfa-verification") redirect("/mfa/verify");

  return (
    <AuthCard
      title="הגדרת אימות דו-שלבי"
      description="המערכת שומרת מידע רגיש, ולכן הכניסה אליה דורשת גם קוד מהטלפון. ההגדרה נעשית פעם אחת."
    >
      <MfaEnrollment />
      <LogoutButton variant="secondary" />
    </AuthCard>
  );
}
