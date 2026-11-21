import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sendEmail } from "@/lib/email/send";
import { requireEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;
const VERIFIED_SESSION_DAYS = 30;
export const TRUSTED_DEVICE_DAYS = 30;
const DEVICE_COOKIE = "crm_trusted_device";

export type SessionClaims = { userId: string; sessionId: string; email: string; aal: string };

export class SecondFactorError extends Error {
  constructor(readonly reason: "too-soon" | "too-many" | "no-code" | "expired" | "wrong" | "locked") {
    super(`second factor refused: ${reason}`);
    this.name = "SecondFactorError";
  }
}

const claimsSchema = z.object({ sub: z.uuid(), session_id: z.uuid(), email: z.string().optional(), aal: z.string() });

/** The verified claims of the current sign-in, including its session id. Null when signed out. */
export async function getSessionClaims(supabase: SupabaseClient): Promise<SessionClaims | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const parsed = claimsSchema.safeParse(data.claims);
  if (!parsed.success) return null;
  return { userId: parsed.data.sub, sessionId: parsed.data.session_id, email: parsed.data.email ?? "", aal: parsed.data.aal };
}

/** A key for hashing codes, derived from the field encryption key so a database leak alone reveals nothing. */
function codeHash(code: string, sessionId: string): string {
  const key = createHmac("sha256", Buffer.from(requireEnv("FIELD_ENCRYPTION_KEY"), "base64")).update("email-code-v1").digest();
  return createHmac("sha256", key).update(`${sessionId}:${code}`).digest("hex");
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function markSessionVerified(claims: SessionClaims, method: "email" | "trusted_device") {
  const { error } = await createAdminClient()
    .from("mfa_sessions")
    .upsert({
      session_id: claims.sessionId,
      user_id: claims.userId,
      method,
      verified_at: new Date().toISOString(),
      expires_at: daysFromNow(VERIFIED_SESSION_DAYS),
    });
  if (error) throw new Error(`session verify failed: ${error.code}`);
}

/** Sends a 6-digit code to the user's email, with limits on how often. */
export async function sendEmailCode(claims: SessionClaims): Promise<void> {
  const admin = createAdminClient();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { data: recent, error } = await admin
    .from("mfa_email_codes")
    .select("created_at")
    .eq("user_id", claims.userId)
    .gte("created_at", hourAgo)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`code lookup failed: ${error.code}`);
  const rows = z.array(z.object({ created_at: z.string() })).parse(recent ?? []);
  if (rows.length >= MAX_CODES_PER_HOUR) throw new SecondFactorError("too-many");
  const last = rows[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < RESEND_AFTER_SECONDS * 1000) throw new SecondFactorError("too-soon");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error: insertError } = await admin.from("mfa_email_codes").insert({
    user_id: claims.userId,
    session_id: claims.sessionId,
    code_hash: codeHash(code, claims.sessionId),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
  });
  if (insertError) throw new Error(`code insert failed: ${insertError.code}`);

  await sendEmail({
    to: claims.email,
    subject: `קוד כניסה: ${code}`,
    text: `קוד הכניסה שלך למערכת: ${code}\n\nהקוד תקף ${CODE_MINUTES} דקות.\nאם לא ניסית להיכנס, אפשר להתעלם מהמייל, ומומלץ להחליף סיסמה.`,
  });
}

/** Checks a code sent to this session. Five wrong tries lock the code. */
export async function verifyEmailCode(claims: SessionClaims, code: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mfa_email_codes")
    .select("id, code_hash, attempts, expires_at")
    .eq("user_id", claims.userId)
    .eq("session_id", claims.sessionId)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`code read failed: ${error.code}`);
  const row = z.object({ id: z.uuid(), code_hash: z.string(), attempts: z.number().int(), expires_at: z.string() }).nullable().parse(data);
  if (!row) throw new SecondFactorError("no-code");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new SecondFactorError("expired");
  if (row.attempts >= MAX_ATTEMPTS) throw new SecondFactorError("locked");

  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(codeHash(code, claims.sessionId), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await admin.from("mfa_email_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    throw new SecondFactorError(row.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "wrong");
  }

  await admin.from("mfa_email_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  await markSessionVerified(claims, "email");
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Remembers this computer: a random secret in an httpOnly cookie, its hash in the database. */
export async function rememberThisDevice(claims: SessionClaims, label: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient().from("trusted_devices").insert({
    user_id: claims.userId,
    token_hash: tokenHash(token),
    label: label.slice(0, 200),
    expires_at: daysFromNow(TRUSTED_DEVICE_DAYS),
  });
  if (error) throw new Error(`device save failed: ${error.code}`);
  const cookieStore = await cookies();
  cookieStore.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TRUSTED_DEVICE_DAYS * 86_400,
  });
}

/**
 * If this computer was remembered for this user, completes the second step for
 * the new sign-in without a code. Returns whether it did.
 */
export async function tryTrustedDevice(claims: SessionClaims): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(DEVICE_COOKIE)?.value;
  if (!token || token.length > 100) return false;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trusted_devices")
    .select("id")
    .eq("token_hash", tokenHash(token))
    .eq("user_id", claims.userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return false;

  await admin.from("trusted_devices").update({ last_used_at: new Date().toISOString() }).eq("id", z.object({ id: z.uuid() }).parse(data).id);
  await markSessionVerified(claims, "trusted_device");
  return true;
}

/** Forgets this computer (sign out with "forget this computer"). */
export async function forgetThisDevice(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(DEVICE_COOKIE)?.value;
  if (token) await createAdminClient().from("trusted_devices").delete().eq("token_hash", tokenHash(token));
  cookieStore.delete(DEVICE_COOKIE);
}

/** Whether the second step is done for the current sign-in, by any method (asks the database rule itself). */
export async function secondFactorDone(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_mfa");
  return !error && data === true;
}
