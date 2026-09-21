import { NextResponse } from "next/server";

import { apiUser } from "@/lib/auth";
import { createBrand } from "@/lib/data";
import { isStage, type BrandDocument, type Stage } from "@/lib/types";

export const dynamic = "force-dynamic";

interface CreateBody {
  name?: string;
  contact_name?: string | null;
  contact_email?: string | null;
  summary?: string | null;
  stage?: Stage;
  deal_value?: number | null;
  event_tag?: string | null;
  notes?: string | null;
  documents?: { name?: string; url?: string }[];
}

/**
 * Add a lead that did not come through the website form.
 *
 * The form is the only thing the *scan* creates from, deliberately. This is
 * the other half of that rule: a person can still put a lead on the board when
 * it arrived by call, DM or introduction, and from then on the hourly scan
 * tracks its email exactly like any other card.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as CreateBody;

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "A brand name is required." }, { status: 400 });
  }

  const email = body.contact_email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: `"${email}" is not a valid email.` }, { status: 400 });
  }

  const stage = body.stage && isStage(body.stage) ? body.stage : "new_submission";

  const documents: BrandDocument[] = (body.documents ?? [])
    .filter((doc) => doc.name?.trim() && doc.url?.trim())
    .map((doc) => ({
      name: doc.name!.trim(),
      url: doc.url!.trim(),
      addedAt: new Date().toISOString(),
      addedBy: user.email,
    }));

  try {
    const id = await createBrand({
      name,
      contactName: body.contact_name?.trim() || null,
      contactEmail: email,
      summary: body.summary?.trim() || null,
      stage,
      dealValue: typeof body.deal_value === "number" ? body.deal_value : null,
      eventTag: body.event_tag?.trim() || null,
      notes: body.notes?.trim() || null,
      documents,
      createdBy: user.email,
    });

    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add the brand.";
    // "already on the board" is the caller's mistake, not a server fault.
    const status = /already on the board/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
