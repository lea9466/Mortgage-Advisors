import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard/AuthCard";
import { MfaEnrollment } from "@/components/auth/MfaEnrollment";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "הגדרת אפליקציית אימות" };

/** Optional: set up an authenticator app. A code by email works without it. */
export default async function MfaEnrollPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.some((factor) => factor.status === "verified")) redirect("/mfa/verify");

  return (
    <AuthCard
      title="הגדרת אפליקציית אימות"
      description="סורקים פעם אחת, ומאז אפשר להיכנס עם קוד מהאפליקציה. אפשר גם להמשיך עם קוד למייל בלבד."
    >
      <MfaEnrollment />
      <Link href="/mfa/verify">חזרה, בלי להגדיר אפליקציה</Link>
    </AuthCard>
  );
}
