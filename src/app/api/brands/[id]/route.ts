import { NextResponse } from "next/server";

import { apiUser } from "@/lib/auth";
import {
  addIgnoredSender,
  addStageEvent,
  getBrand,
  removeIgnoredSender,
  updateBrand,
} from "@/lib/data";
import { isStage, type Stage } from "@/lib/types";

export const dynamic = "force-dynamic";

interface UpdateBody {
  /** Move the brand by hand. Pins the stage against the hourly scan. */
  stage?: Stage;
  /** Take the scan's suggestion and hand control back to it. */
  acceptSuggestion?: boolean;
  /** Hand the scan back control without changing the stage. */
  unpin?: boolean;
  owner_email?: string | null;
  notes?: string | null;
  deal_value?: number | null;
  event_tag?: string | null;
  /** Confirm an unverified card is a real brand. */
  confirm?: boolean;
  /** Not a brand: archive it and stop the scan resurfacing the sender. */
  dismiss?: boolean;
  /** Put an archived or dismissed brand back on the board. */
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

  const current = await getBrand(id);
  if (!current) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let stageMove: { from: Stage; to: Stage; source: "auto" | "manual"; note: string } | null = null;

  // --- stage ------------------------------------------------------------
  if (body.acceptSuggestion) {
    if (!current.auto_stage) {
      return NextResponse.json({ error: "There is no suggestion to accept" }, { status: 400 });
    }
    update.stage = current.auto_stage;
    // Accepting the suggestion also hands the reins back to the scan.
    update.stage_source = "auto";
    stageMove = {
      from: current.stage,
      to: current.auto_stage,
      source: "auto",
      note: "Suggestion accepted",
    };
  } else if (body.stage !== undefined) {
    if (!isStage(body.stage)) {
      return NextResponse.json({ error: `Unknown stage: ${body.stage}` }, { status: 400 });
    }
    update.stage = body.stage;
    // A hand-placed card stays where it was put. The scan will suggest, never
    // move, from here on.
    update.stage_source = "manual";
    if (body.stage !== current.stage) {
      stageMove = { from: current.stage, to: body.stage, source: "manual", note: "Moved by hand" };
    }
  } else if (body.unpin) {
    update.stage_source = "auto";
    if (current.auto_stage && current.auto_stage !== current.stage) {
      update.stage = current.auto_stage;
      stageMove = {
        from: current.stage,
        to: current.auto_stage,
        source: "auto",
        note: "Handed back to the inbox scan",
      };
    }
  }

  if (stageMove) {
    update.stage_changed_at = new Date().toISOString();
    update.stage_changed_by = user.email;
  }

  // --- everything else --------------------------------------------------
  if (body.owner_email !== undefined) update.owner_email = body.owner_email || null;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.deal_value !== undefined) update.deal_value = body.deal_value;
  if (body.event_tag !== undefined) update.event_tag = body.event_tag;

  if (body.confirm) {
    update.classification = "brand";
    update.archived = false;
  }

  if (body.restore) {
    update.classification = "brand";
    update.archived = false;

    // Undoing a dismissal has to lift the sender block too, or the brand comes
    // back to the board and then quietly stops updating.
    const pattern = current.domain ?? current.primary_contact_email;
    if (pattern) await removeIgnoredSender(pattern.toLowerCase());
  }

  if (body.dismiss) {
    if (current.blocked) {
      return NextResponse.json(
        { error: "This entity is under a do-not-contact rule and cannot be restored here." },
        { status: 400 },
      );
    }

    update.classification = "dismissed";
    update.archived = true;

    // Remember the sender so the next scan does not put it straight back.
    const pattern = current.domain ?? current.primary_contact_email;
    if (pattern) {
      await addIgnoredSender({
        pattern: pattern.toLowerCase(),
        reason: "Dismissed from the dashboard",
        added_by: user.email,
      });
    }
  }

  try {
    await updateBrand(id, update);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (stageMove) {
    await addStageEvent({
      brand_id: id,
      from_stage: stageMove.from,
      to_stage: stageMove.to,
      source: stageMove.source,
      actor: user.email,
      note: stageMove.note,
    });
  }

  return NextResponse.json({ ok: true });
}
