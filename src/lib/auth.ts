import { redirect } from "next/navigation";

import { isLocalMode } from "./data";
import { isAllowed } from "./env";
import { supabaseAuth } from "./supabase/server";

export interface SessionUser {
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Who is signed in.
 *
 * In local mode there is no sign-in: the app is running on someone's own
 * machine against a file on that machine, so a login screen would guard
 * nothing. Every edit is still attributed, just to a local user.
 */
export async function currentUser(): Promise<SessionUser | null> {
  if (isLocalMode()) {
    return { email: "local@zmmevents.com", name: "Local", avatarUrl: null };
  }

  const supabase = await supabaseAuth();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase() ?? null;
  if (!email || !isAllowed(email)) return null;

  const metadata = (user?.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
  };

  return {
    email,
    name: metadata.full_name ?? metadata.name ?? null,
    avatarUrl: metadata.avatar_url ?? null,
  };
}

/** For pages: send anyone who is not on the allowlist to the sign-in screen. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** For API routes: returns the user, or null for the caller to 401 on. */
export async function apiUser(): Promise<SessionUser | null> {
  return currentUser();
}
