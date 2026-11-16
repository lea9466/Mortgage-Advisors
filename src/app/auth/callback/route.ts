import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const codeSchema = z.string().trim().min(1).max(512);

/**
 * The link in the sign-up confirmation email lands here. The one-time code is
 * exchanged for a session, and the new user continues to second-factor setup.
 */
export async function GET(request: NextRequest) {
  const parsed = codeSchema.safeParse(request.nextUrl.searchParams.get("code"));
  if (parsed.success) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.data);
    if (!error) return NextResponse.redirect(new URL("/mfa/enroll", request.url));
    console.error("email confirmation failed", error.code);
  }

  const failed = new URL("/login", request.url);
  failed.searchParams.set("notice", "link-invalid");
  return NextResponse.redirect(failed);
}
