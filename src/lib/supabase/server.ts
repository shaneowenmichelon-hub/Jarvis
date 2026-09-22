import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireEnv } from "@/lib/env";

/**
 * Auth-only Supabase client, bound to the request's cookies.
 *
 * This client carries the signed-in user's session and is used purely to ask
 * "who is this". All application data goes through the service-role client,
 * behind an allowlist check.
 */
export async function supabaseAuth() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot set cookies; middleware refreshes the
            // session instead, so this is safe to ignore here.
          }
        },
      },
    },
  );
}
