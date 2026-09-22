import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { apiUser } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { exchangeCodeForTokens } from "@/lib/gmail";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Google hands back an authorization code; we trade it for a refresh token and
 * store it. That token is the long-lived credential the hourly scan runs on,
 * so it lives in a table only the service-role key can read and is never sent
 * to the browser.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login`);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return fail(`Google returned: ${error}`);
  if (!code) return fail("Google did not return an authorization code");

  const jar = await cookies();
  const expected = jar.get("gmail_oauth_state")?.value;
  jar.delete("gmail_oauth_state");

  if (!expected || !state || expected !== state) {
    return fail("The sign-in attempt expired or did not match. Try again.");
  }

  try {
    const tokens = await exchangeCodeForTokens(code, `${siteUrl()}/api/gmail/callback`);

    if (!tokens.refreshToken) {
      // Google only issues a refresh token on first consent. If the account
      // was connected before, revoking access at myaccount.google.com and
      // reconnecting is the fix.
      return fail(
        "Google did not issue a refresh token. Remove this app at myaccount.google.com/permissions, then connect again.",
      );
    }

    const email = tokens.email ?? user.email;

    const { error: dbError } = await supabaseAdmin().from("gmail_accounts").upsert(
      {
        email,
        refresh_token: tokens.refreshToken,
        connected_by: user.email,
        connected_at: new Date().toISOString(),
        active: true,
      },
      { onConflict: "email" },
    );

    if (dbError) return fail(`Could not save the connection: ${dbError.message}`);

    return NextResponse.redirect(`${siteUrl()}/settings?connected=${encodeURIComponent(email)}`);
  } catch (caught) {
    return fail(caught instanceof Error ? caught.message : String(caught));
  }
}

function fail(message: string): NextResponse {
  return NextResponse.redirect(`${siteUrl()}/settings?error=${encodeURIComponent(message)}`);
}
