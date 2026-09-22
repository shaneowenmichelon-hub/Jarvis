import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { apiUser } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { buildAuthUrl } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/** Kick off the one-time Gmail consent flow. */
export async function GET(): Promise<NextResponse> {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // CSRF guard: the callback only accepts a state it handed out itself.
  const state = randomBytes(24).toString("hex");
  const jar = await cookies();
  jar.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(`${siteUrl()}/api/gmail/callback`, state));
}
