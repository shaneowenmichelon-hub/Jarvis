import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs on every request:
 *
 *   1. refresh the Supabase session cookie, which server components cannot do
 *      themselves, so nobody gets logged out mid-shift
 *   2. bounce anyone without a session away from the dashboard
 *
 * The allowlist check itself lives in `lib/auth.ts` and runs again inside every
 * page and API route. Middleware is the cheap first gate, not the only one —
 * it reads a cookie, and a cookie is not a decision about who you are.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    // The cron endpoint authenticates with a bearer token, not a session.
    pathname.startsWith("/api/cron/");

  if (!user && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next's own assets and the favicon.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
