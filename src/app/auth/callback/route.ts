import { NextResponse } from "next/server";

import { isAllowed, siteUrl } from "@/lib/env";
import { supabaseAuth } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Where Google drops the user after sign-in.
 *
 * Signing in with Google is not the same as being allowed in. Anyone with a
 * Google account can reach this route, so the allowlist is enforced here: an
 * unlisted address gets its session torn down immediately rather than being
 * left half-authenticated.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${siteUrl()}/login?error=${encodeURIComponent(oauthError)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${siteUrl()}/login?error=missing_code`);
  }

  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${siteUrl()}/login?error=${encodeURIComponent(error.message)}`);
  }

  if (!isAllowed(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${siteUrl()}/login?error=not_allowed`);
  }

  return NextResponse.redirect(siteUrl());
}
