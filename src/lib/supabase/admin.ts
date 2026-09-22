import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS, so it must never be constructed anywhere
 * that could run in the browser — every caller is a server route or a server
 * component that has already checked the signed-in user against the allowlist.
 */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  cached = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  return cached;
}
