import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard/AuthCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { OrganizationForm } from "@/components/auth/OrganizationForm";
import { findMembership, getAuthStage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "שם החשבון" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const auth = await getAuthStage(supabase);

  if (auth.stage === "signed-out") redirect("/login");
  if (auth.stage === "needs-second-step") redirect("/mfa/verify");
  if (await findMembership(supabase, auth.userId)) redirect("/");

  return (
    <AuthCard title="עוד צעד אחד" description="איך לקרוא לחשבון שלכם?">
      <OrganizationForm />
      <LogoutButton variant="secondary" />
    </AuthCard>
  );
}
