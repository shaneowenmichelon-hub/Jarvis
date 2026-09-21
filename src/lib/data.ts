/**
 * Data access for the dashboard.
 *
 * Everything the UI reads or writes goes through here, and here decides
 * whether that lands in Supabase or in the local JSON file. Pages and routes
 * never see either, which is what lets the same app run on a laptop with no
 * accounts and in production against Postgres.
 */

import {
  mutate,
  readDatabase,
  type InboxRow,
  type PatternRow,
  type StageEventRow,
} from "./local-store";
import { groupKeyFor } from "./classify";
import { supabaseAdmin } from "./supabase/admin";
import type {
  AmbassadorRow,
  BrandDocument,
  BrandRow,
  MessageRow,
  ScanRunRow,
  Stage,
} from "./types";

export type { InboxRow, PatternRow, StageEventRow };

/**
 * Local mode: no Supabase configured, or explicitly forced.
 *
 * The check is on the server only. Anything in the browser that needs to know
 * is handed the answer as a prop.
 */
export function isLocalMode(): boolean {
  if (process.env.LOCAL_MODE === "1") return true;
  if (process.env.LOCAL_MODE === "0") return false;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export async function listBoardBrands(): Promise<BrandRow[]> {
  if (isLocalMode()) {
    const db = await readDatabase();
    return db.brands
      .filter((brand) => !brand.archived)
      .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
  }

  const { data } = await supabaseAdmin()
    .from("brands")
    .select("*")
    .eq("archived", false)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  return (data ?? []) as BrandRow[];
}

export async function listArchivedBrands(limit = 40): Promise<BrandRow[]> {
  if (isLocalMode()) {
    const db = await readDatabase();
    return db.brands.filter((brand) => brand.archived).slice(0, limit);
  }

  const { data } = await supabaseAdmin()
    .from("brands")
    .select("*")
    .eq("archived", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as BrandRow[];
}

export async function getBrand(id: string): Promise<BrandRow | null> {
  if (isLocalMode()) {
    const db = await readDatabase();
    return db.brands.find((brand) => brand.id === id) ?? null;
  }

  const { data } = await supabaseAdmin().from("brands").select("*").eq("id", id).maybeSingle();
  return (data as BrandRow | null) ?? null;
}

export interface NewBrandInput {
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  summary: string | null;
  stage: Stage;
  dealValue: number | null;
  eventTag: string | null;
  notes: string | null;
  documents: BrandDocument[];
  createdBy: string;
}

/**
 * Add a lead that did not come through the website form — a call, a DM, an
 * introduction at an event.
 *
 * The group key decides what the hourly scan will follow afterwards. With an
 * address we use the same key the form would have produced, so the
 * conversation attaches from the next scan onwards; without one there is
 * nothing to track by, so the card stands alone until someone adds an address.
 */
export async function createBrand(input: NewBrandInput): Promise<string> {
  const now = new Date().toISOString();
  const email = input.contactEmail?.toLowerCase().trim() || null;

  const groupKey = email ? (groupKeyFor(email) ?? email) : `manual:${slug(input.name)}`;
  // groupKeyFor hands back the domain for a company address and the full
  // address for free mail, where the domain says nothing about the brand.
  const domain = email && !groupKey.includes("@") ? groupKey : null;

  const row = {
    group_key: groupKey,
    source: "manual" as const,
    name: input.name.trim(),
    domain,
    website: domain ? `https://${domain}` : null,
    primary_contact_name: input.contactName,
    primary_contact_email: email,
    stage: input.stage,
    // Entered by hand means placed by hand: the scan will suggest, never move.
    stage_source: "manual" as const,
    auto_stage: null,
    stage_changed_at: now,
    stage_changed_by: input.createdBy,
    owner_email: null,
    first_contact_at: now,
    last_message_at: null,
    last_inbound_at: null,
    last_outbound_at: null,
    last_direction: null,
    awaiting_our_reply: false,
    thread_count: 0,
    message_count: 0,
    classification: "brand" as const,
    confidence: 1,
    summary: input.summary,
    deal_value: input.dealValue,
    event_tag: input.eventTag,
    notes: input.notes,
    documents: input.documents,
    blocked: false,
    archived: false,
    created_at: now,
    updated_at: now,
  };

  if (isLocalMode()) {
    return mutate((db) => {
      const existing = db.brands.find((brand) => brand.group_key === groupKey);
      if (existing) throw new Error(`${existing.name} is already on the board.`);

      const id = `manual-${Date.now().toString(36)}`;
      db.brands.push({ ...row, id } as BrandRow);
      db.stage_events.push({
        id: db.stage_events.reduce((max, event) => Math.max(max, event.id), 0) + 1,
        brand_id: id,
        from_stage: null,
        to_stage: input.stage,
        source: "manual",
        actor: input.createdBy,
        note: "Added by hand — arrived off-website",
        created_at: now,
      });
      return id;
    });
  }

  const { data, error } = await supabaseAdmin().from("brands").insert(row).select("id").single();

  if (error) {
    throw new Error(
      error.code === "23505" ? "That brand is already on the board." : error.message,
    );
  }

  const id = String(data.id);
  await addStageEvent({
    brand_id: id,
    from_stage: null,
    to_stage: input.stage,
    source: "manual",
    actor: input.createdBy,
    note: "Added by hand — arrived off-website",
  });

  return id;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "brand"
  );
}

export async function updateBrand(id: string, patch: Record<string, unknown>): Promise<void> {
  if (isLocalMode()) {
    await mutate((db) => {
      const brand = db.brands.find((row) => row.id === id);
      if (brand) Object.assign(brand, patch);
    });
    return;
  }

  const { error } = await supabaseAdmin().from("brands").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Messages and stage history
// ---------------------------------------------------------------------------

export async function listMessages(brandId: string, limit = 100): Promise<MessageRow[]> {
  if (isLocalMode()) {
    const db = await readDatabase();
    return db.messages
      .filter((message) => message.brand_id === brandId)
      .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
      .slice(0, limit);
  }

  const { data } = await supabaseAdmin()
    .from("messages")
    .select("*")
    .eq("brand_id", brandId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as MessageRow[];
}

export async function listStageEvents(brandId: string, limit = 30): Promise<StageEventRow[]> {
  if (isLocalMode()) {
    const db = await readDatabase();
    return db.stage_events
      .filter((event) => event.brand_id === brandId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  const { data } = await supabaseAdmin()
    .from("stage_events")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as StageEventRow[];
}

export async function addStageEvent(event: Omit<StageEventRow, "id" | "created_at">): Promise<void> {
  if (isLocalMode()) {
    await mutate((db) => {
      const id = db.stage_events.reduce((max, row) => Math.max(max, row.id), 0) + 1;
      db.stage_events.push({ ...event, id, created_at: new Date().toISOString() });
    });
    return;
  }

  await supabaseAdmin().from("stage_events").insert(event);
}

// ---------------------------------------------------------------------------
// Scan history and the connected inbox
// ---------------------------------------------------------------------------

export async function listScanRuns(limit = 12): Promise<ScanRunRow[]> {
  if (isLocalMode()) {
    const db = await readDatabase();
    return [...db.scan_runs]
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, limit);
  }

  const { data } = await supabaseAdmin()
    .from("scan_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as ScanRunRow[];
}

export async function latestScanRun(): Promise<ScanRunRow | null> {
  return (await listScanRuns(1))[0] ?? null;
}

export async function listInboxes(): Promise<InboxRow[]> {
  if (isLocalMode()) {
    return (await readDatabase()).gmail_accounts;
  }

  const { data } = await supabaseAdmin()
    .from("gmail_accounts")
    .select("id, email, connected_by, connected_at, last_scan_at, active")
    .order("connected_at", { ascending: false });

  return (data ?? []) as InboxRow[];
}

export async function activeInbox(): Promise<InboxRow | null> {
  return (await listInboxes()).find((inbox) => inbox.active) ?? null;
}

// ---------------------------------------------------------------------------
// Sender lists
// ---------------------------------------------------------------------------

export async function listIgnoredSenders(limit = 50): Promise<PatternRow[]> {
  if (isLocalMode()) {
    return (await readDatabase()).ignored_senders.slice(0, limit);
  }

  const { data } = await supabaseAdmin()
    .from("ignored_senders")
    .select("pattern, reason, added_by")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as PatternRow[];
}

export async function listBlockedEntities(): Promise<PatternRow[]> {
  if (isLocalMode()) {
    return (await readDatabase()).blocked_entities;
  }

  const { data } = await supabaseAdmin()
    .from("blocked_entities")
    .select("pattern, reason")
    .order("pattern");

  return (data ?? []) as PatternRow[];
}

export async function addIgnoredSender(row: PatternRow): Promise<void> {
  if (isLocalMode()) {
    await mutate((db) => {
      if (!db.ignored_senders.some((entry) => entry.pattern === row.pattern)) {
        db.ignored_senders.unshift(row);
      }
    });
    return;
  }

  await supabaseAdmin().from("ignored_senders").upsert(row, { onConflict: "pattern" });
}

export async function removeIgnoredSender(pattern: string): Promise<void> {
  if (isLocalMode()) {
    await mutate((db) => {
      db.ignored_senders = db.ignored_senders.filter((entry) => entry.pattern !== pattern);
    });
    return;
  }

  await supabaseAdmin().from("ignored_senders").delete().eq("pattern", pattern);
}

// ---------------------------------------------------------------------------
// Ambassadors
//
// Students applying to work campus. A separate list from the pipeline on
// purpose — an applicant is not a lead.
// ---------------------------------------------------------------------------

export async function listAmbassadors(): Promise<AmbassadorRow[]> {
  if (isLocalMode()) {
    const db = await readDatabase();
    return (db.ambassadors ?? [])
      .filter((ambassador) => !ambassador.archived)
      .sort((a, b) => b.applied_at.localeCompare(a.applied_at));
  }

  const { data } = await supabaseAdmin()
    .from("ambassadors")
    .select("*")
    .eq("archived", false)
    .order("applied_at", { ascending: false });

  return (data ?? []) as AmbassadorRow[];
}

export async function getAmbassador(id: string): Promise<AmbassadorRow | null> {
  if (isLocalMode()) {
    const db = await readDatabase();
    return (db.ambassadors ?? []).find((ambassador) => ambassador.id === id) ?? null;
  }

  const { data } = await supabaseAdmin().from("ambassadors").select("*").eq("id", id).maybeSingle();
  return (data as AmbassadorRow | null) ?? null;
}

export async function updateAmbassador(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  if (isLocalMode()) {
    await mutate((db) => {
      const ambassador = (db.ambassadors ?? []).find((row) => row.id === id);
      if (ambassador) Object.assign(ambassador, patch);
    });
    return;
  }

  const { error } = await supabaseAdmin().from("ambassadors").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
