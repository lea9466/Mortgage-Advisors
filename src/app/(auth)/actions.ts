"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/log";
import {
  getSessionClaims,
  rememberThisDevice,
  SecondFactorError,
  sendEmailCode,
  tryTrustedDevice,
  verifyEmailCode,
} from "@/lib/auth/secondFactor";
import { findMembership, getAuthStage } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  loginSchema,
  mfaCodeSchema,
  organizationNameSchema,
  signupSchema,
} from "@/lib/validation/auth";

export type FormState = { error?: string };
export type EmailCodeState = { sent?: boolean; error?: string };

const emailCodeSchema = z.string().trim().regex(/^\d{6}$/);

export type SignupState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "passwordConfirm", string[]>>;
  sentTo?: string;
};

export type OrganizationState = { error?: string; fieldError?: string };

export type EnrollmentState = {
  error?: string;
  enrollment?: { factorId: string; qrCode: string; secret: string };
};

const GENERIC_ERROR = "אירעה שגיאה, נסו שוב בעוד רגע";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  // One message for every failure, so the form never reveals which part was wrong.
  if (!parsed.success) return { error: "כתובת האימייל או הסיסמה שגויים" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "כתובת האימייל או הסיסמה שגויים" };

  // A computer remembered after an earlier code skips the second step.
  const claims = await getSessionClaims(supabase);
  if (claims && (await tryTrustedDevice(claims))) {
    await auditSignIn(supabase, claims.userId, "trusted_device");
    redirect("/");
  }
  redirect("/mfa/verify");
}

async function auditSignIn(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, method: string) {
  const membership = await findMembership(supabase, userId);
  if (membership) {
    await recordAudit(supabase, {
      organizationId: membership.organization.id,
      actorId: userId,
      action: "auth.sign_in",
      metadata: { method },
    });
  }
}

/** A short label for a remembered computer, e.g. "Chrome · Windows". */
async function deviceLabel(): Promise<string> {
  const agent = (await headers()).get("user-agent") ?? "";
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "דפדפן";
  const system = /Windows/.test(agent) ? "Windows" : /Mac OS/.test(agent) ? "Mac" : /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : "";
  return system ? `${browser} · ${system}` : browser;
}

/** Sends a sign-in code to the user's email. */
export async function sendEmailCodeAction(_prev: EmailCodeState): Promise<EmailCodeState> {
  const supabase = await createClient();
  const claims = await getSessionClaims(supabase);
  if (!claims) redirect("/login");
  try {
    await sendEmailCode(claims);
    return { sent: true };
  } catch (error) {
    if (error instanceof SecondFactorError && error.reason === "too-soon") return { sent: true, error: "קוד נשלח לפני פחות מדקה. בדקו את המייל, או המתינו ושלחו שוב" };
    if (error instanceof SecondFactorError && error.reason === "too-many") return { error: "נשלחו יותר מדי קודים בשעה האחרונה. נסו שוב מאוחר יותר, או השתמשו באפליקציה" };
    console.error("email code send failed", error instanceof Error ? error.message : "unknown");
    return { error: GENERIC_ERROR };
  }
}

/** Checks the emailed code and completes the second step for this sign-in. */
export async function verifyEmailCodeAction(_prev: EmailCodeState, formData: FormData): Promise<EmailCodeState> {
  const code = emailCodeSchema.safeParse(formData.get("emailCode"));
  if (!code.success) return { sent: true, error: "יש להזין את הקוד בן 6 הספרות מהמייל" };

  const supabase = await createClient();
  const claims = await getSessionClaims(supabase);
  if (!claims) redirect("/login");
  try {
    await verifyEmailCode(claims, code.data);
  } catch (error) {
    if (error instanceof SecondFactorError) {
      const messages: Record<SecondFactorError["reason"], string> = {
        wrong: "הקוד שגוי. בדקו ונסו שוב",
        locked: "יותר מדי ניסיונות. שלחו קוד חדש",
        expired: "פג תוקף הקוד. שלחו קוד חדש",
        "no-code": "לא נשלח קוד. לחצו על שליחת קוד",
        "too-soon": GENERIC_ERROR,
        "too-many": GENERIC_ERROR,
      };
      return { sent: true, error: messages[error.reason] };
    }
    console.error("email code verify failed", error instanceof Error ? error.message : "unknown");
    return { sent: true, error: GENERIC_ERROR };
  }
  if (formData.get("remember") === "on") await rememberThisDevice(claims, await deviceLabel());
  await auditSignIn(supabase, claims.userId, "email");
  redirect("/");
}

/**
 * Creates the user and sends a confirmation email. The reply is the same
 * whether or not the address is already registered, so the form cannot be
 * used to find out who has an account.
 */
export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const { email, password } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: new URL("/auth/callback", getEnv().SITE_URL).toString() },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { fieldErrors: { password: ["הסיסמה חלשה מדי או שהופיעה בדליפת מידע. בחרו סיסמה אחרת"] } };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { error: "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות" };
    }
    if (error.code !== "user_already_exists") {
      console.error("sign-up failed", error.code);
      return { error: GENERIC_ERROR };
    }
  }
  return { sentTo: email };
}

/** Opens the adviser's own account after sign-up. One account per user. */
export async function createOrganizationAction(
  _prev: OrganizationState,
  formData: FormData,
): Promise<OrganizationState> {
  const parsed = organizationNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { fieldError: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const auth = await getAuthStage(supabase);
  if (auth.stage === "signed-out") redirect("/login");
  if (auth.stage !== "verified") redirect("/mfa/verify");

  const { error } = await supabase.rpc("create_my_organization", { org_name: parsed.data.name });
  // 23505: the user already has an account, so there is nothing left to do here.
  if (error && error.code !== "23505") {
    console.error("organization create failed", error.code);
    return { error: GENERIC_ERROR };
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Starts authenticator-app setup and returns the QR code to scan. */
export async function startMfaEnrollmentAction(_prev: EnrollmentState): Promise<EnrollmentState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: GENERIC_ERROR };
  if (factors.totp.length > 0) redirect("/mfa/verify");

  // Clear setups that were started and never finished.
  for (const factor of factors.all) {
    if (factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) return { error: GENERIC_ERROR };

  return {
    enrollment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
  };
}

/** Checks a 6-digit code. Used both to finish setup and on every sign-in. */
export async function verifyMfaCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = mfaCodeSchema.safeParse({
    factorId: formData.get("factorId"),
    code: formData.get("code"),
  });
  if (!parsed.success) return { error: "יש להזין קוד בן 6 ספרות" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return { error: "הקוד שגוי או שפג תוקפו. נסו שוב עם קוד חדש" };

  if (formData.get("remember") === "on") {
    const claims = await getSessionClaims(supabase);
    if (claims) await rememberThisDevice(claims, await deviceLabel());
  }
  await auditSignIn(supabase, userData.user.id, "app");
  redirect("/");
}
