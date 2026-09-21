import { NextResponse } from "next/server";

import { isAmbassadorStage } from "@/lib/ambassadors";
import { apiUser } from "@/lib/auth";
import { getAmbassador, updateAmbassador } from "@/lib/data";

export const dynamic = "force-dynamic";

interface UpdateBody {
  stage?: string;
  owner_email?: string | null;
  notes?: string | null;
  /** Not a fit. Keeps the record, takes them off the list. */
  archive?: boolean;
  restore?: boolean;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as UpdateBody;

  const current = await getAmbassador(id);
  if (!current) return NextResponse.json({ error: "Ambassador not found" }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.stage !== undefined) {
    if (!isAmbassadorStage(body.stage)) {
      return NextResponse.json({ error: `Unknown stage: ${body.stage}` }, { status: 400 });
    }
    if (body.stage !== current.stage) {
      update.stage = body.stage;
      // Recruiting is a judgement call from end to end, so every move here is
      // someone's decision rather than something derived from email.
      update.stage_source = "manual";
      update.stage_changed_at = new Date().toISOString();
      update.stage_changed_by = user.email;
    }
  }

  if (body.owner_email !== undefined) update.owner_email = body.owner_email || null;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.archive) update.archived = true;
  if (body.restore) update.archived = false;

  // A body of nothing we recognise — a misspelled field, say — would otherwise
  // write only `updated_at` and answer 200, which reads as a save that worked.
  // Say so instead.
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    await updateAmbassador(id, update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
