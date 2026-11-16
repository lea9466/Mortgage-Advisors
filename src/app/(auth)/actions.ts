"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/log";
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

  redirect("/mfa/verify");
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

  const membership = await findMembership(supabase, userData.user.id);
  if (membership) {
    await recordAudit(supabase, {
      organizationId: membership.organization.id,
      actorId: userData.user.id,
      action: "auth.sign_in",
    });
  }
  redirect("/");
}
