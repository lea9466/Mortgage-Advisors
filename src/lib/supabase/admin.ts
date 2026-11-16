import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, requireEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Supabase client with the secret key. It bypasses Row Level Security, so it is
 * used only for file storage, and only after the caller has checked that the
 * signed-in user may touch the file.
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(getEnv().NEXT_PUBLIC_SUPABASE_URL, requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
