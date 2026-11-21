import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard/AuthCard";
import { EmailCodeForm } from "@/components/auth/EmailCodeForm";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { MfaCodeForm } from "@/components/auth/MfaCodeForm";
import styles from "@/components/auth/SecondStep.module.css";
import { getAuthStage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "אימות כניסה" };

/**
 * The second sign-in step. The user picks how: a code from the authenticator
 * app (when set up) or a code sent by email.
 */
export default async function SecondStepPage() {
  const supabase = await createClient();
  const auth = await getAuthStage(supabase);
  if (auth.stage === "signed-out") redirect("/login");
  if (auth.stage === "verified") redirect("/");

  const [{ data: factors }, { data: userData }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.getUser()]);
  const appFactor = factors?.totp.find((factor) => factor.status === "verified");
  const email = userData.user?.email ?? "";

  return (
    <AuthCard title="אימות כניסה" description="עוד צעד אחד: קוד מהאפליקציה או קוד למייל.">
      <div className={styles.methods}>
        {appFactor && (
          <>
            <section className={styles.method} aria-labelledby="by-app">
              <h2 id="by-app" className={styles.methodTitle}>קוד מאפליקציית האימות</h2>
              <MfaCodeForm factorId={appFactor.id} submitLabel="אימות וכניסה" showRemember />
            </section>
            <p className={styles.divider}>או</p>
          </>
        )}
        <section className={styles.method} aria-labelledby="by-email">
          <h2 id="by-email" className={styles.methodTitle}>קוד למייל</h2>
          <EmailCodeForm email={email} />
        </section>
        {!appFactor && (
          <p className={styles.setup}>
            מעדיפים אפליקציית אימות? <Link href="/mfa/enroll">הגדרה בסריקת קוד</Link>
          </p>
        )}
      </div>
      <LogoutButton variant="secondary" />
    </AuthCard>
  );
}
