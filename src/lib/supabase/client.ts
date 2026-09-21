"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Used only to start the Google sign-in redirect — the
 * dashboard's data never comes through it, and RLS grants it nothing.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
