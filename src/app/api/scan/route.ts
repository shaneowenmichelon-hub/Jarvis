import { NextResponse } from "next/server";

import { apiUser } from "@/lib/auth";
import { isLocalMode } from "@/lib/data";
import { runScan } from "@/lib/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** "Scan now", from the dashboard header. Same engine, signed-in caller. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isLocalMode()) {
    return NextResponse.json(
      {
        status: "error",
        error: "Local mode reads a seeded file, not Gmail. Configure Supabase to scan for real.",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    backfillDays?: number;
    force?: boolean;
  };

  try {
    const summary = await runScan({
      trigger: body.backfillDays ? "backfill" : "manual",
      force: body.force ?? false,
      sinceDays: body.backfillDays,
    });

    return NextResponse.json(summary, { status: summary.status === "error" ? 500 : 200 });
  } catch (error) {
    // Reaches the button in the header, so a broken scan says why rather than
    // failing silently behind a spinner.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
