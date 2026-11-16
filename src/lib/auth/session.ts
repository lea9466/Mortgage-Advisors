import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type MemberRole = "owner" | "member" | "support";

export type SessionContext = {
  user: { id: string; email: string };
  organization: { id: string; name: string };
  role: MemberRole;
};

const organizationSchema = z.object({ id: z.uuid(), name: z.string() });
const membershipSchema = z.object({
  role: z.enum(["owner", "member", "support"]),
  // PostgREST returns a to-one relation as an object, but older versions and
  // ambiguous relations return an array.
  organizations: z.union([organizationSchema, z.array(organizationSchema).min(1)]),
});

export type Membership = { organization: { id: string; name: string }; role: MemberRole };

/** The signed-in user's organization, or null when they belong to none. */
export async function findMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<Membership | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organizations(id, name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("membership lookup failed", error.code);
    return null;
  }
  const parsed = membershipSchema.safeParse(data?.[0]);
  if (!parsed.success) return null;

  const { organizations, role } = parsed.data;
  const organization = Array.isArray(organizations) ? organizations[0] : organizations;
  return organization ? { organization, role } : null;
}

export type AuthStage =
  | { stage: "signed-out" }
  | { stage: "needs-mfa-enrollment"; userId: string }
  | { stage: "needs-mfa-verification"; userId: string }
  | { stage: "verified"; userId: string; email: string };

/** Where the current visitor is in the sign-in flow. Always checked on the server. */
export async function getAuthStage(supabase: SupabaseClient): Promise<AuthStage> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { stage: "signed-out" };
  const user = userData.user;

  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aal) return { stage: "signed-out" };

  if (aal.currentLevel === "aal2") {
    return { stage: "verified", userId: user.id, email: user.email ?? "" };
  }
  return aal.nextLevel === "aal2"
    ? { stage: "needs-mfa-verification", userId: user.id }
    : { stage: "needs-mfa-enrollment", userId: user.id };
}

/**
 * The one gate for every page and action inside the app. It returns only after
 * the visitor has signed in, completed the second factor, and been matched to
 * an organization; otherwise it redirects.
 */
export const requireSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const auth = await getAuthStage(supabase);

  if (auth.stage === "signed-out") redirect("/login");
  if (auth.stage === "needs-mfa-enrollment") redirect("/mfa/enroll");
  if (auth.stage === "needs-mfa-verification") redirect("/mfa/verify");

  const membership = await findMembership(supabase, auth.userId);
  if (!membership) redirect("/onboarding");

  return {
    user: { id: auth.userId, email: auth.email },
    organization: membership.organization,
    role: membership.role,
  };
});
