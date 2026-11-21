import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, requireEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Supabase client with the secret key. It bypasses Row Level Security, so it is
 * used only for file storage (after the caller checked the user may touch the
 * file) and for the second-step tables that users must never write themselves
 * (lib/auth/secondFactor.ts).
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(getEnv().NEXT_PUBLIC_SUPABASE_URL, requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
