import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard/AuthCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { MfaCodeForm } from "@/components/auth/MfaCodeForm";
import { getAuthStage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "אימות דו-שלבי" };

export default async function MfaVerifyPage() {
  const supabase = await createClient();
  const auth = await getAuthStage(supabase);

  if (auth.stage === "signed-out") redirect("/login");
  if (auth.stage === "verified") redirect("/");
  if (auth.stage === "needs-mfa-enrollment") redirect("/mfa/enroll");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (!factor) redirect("/mfa/enroll");

  return (
    <AuthCard title="אימות דו-שלבי" description="הזינו את הקוד מאפליקציית האימות בטלפון.">
      <MfaCodeForm factorId={factor.id} submitLabel="אימות וכניסה" />
      <LogoutButton variant="secondary" />
    </AuthCard>
  );
}
