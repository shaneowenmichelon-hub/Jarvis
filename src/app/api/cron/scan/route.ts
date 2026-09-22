import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runScan } from "@/lib/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The hourly scan.
 *
 * Triggered by Vercel Cron, or by the GitHub Actions workflow in
 * `.github/workflows/scan.yml` — both send the same bearer token, so whichever
 * scheduler the agency ends up on, this endpoint does not change.
 *
 * It is a plain HTTP endpoint on the public internet, so the secret is the
 * only thing standing between a stranger and a forced inbox scan. Compared in
 * constant time.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server" },
      { status: 500 },
    );
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runScan({ trigger: "cron" });

    // A skipped run means the previous one is still going — that is a normal
    // outcome, not a failure, so it must not show up red in the cron log.
    const status = summary.status === "error" ? 500 : 200;
    return NextResponse.json(summary, { status });
  } catch (error) {
    // `runScan` records its own failures, but it can only do that once it has
    // a row to write to. A database that is unreachable fails before then, so
    // the reason has to come back in the response or it is lost entirely.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
