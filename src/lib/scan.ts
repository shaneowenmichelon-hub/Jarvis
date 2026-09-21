/**
 * The scan.
 *
 * Runs hourly from cron, or on demand from the dashboard. One pass:
 *
 *   1. take the lock, so two runs never overlap
 *   2. work out how far back to look
 *   3. pull matching threads from Gmail
 *   4. screen out everything that is not a brand writing in
 *   5. group what is left into brands, threads, and messages
 *   6. recompute each affected brand's email facts from the full record
 *   7. move stages — but never one a human has pinned
 *
 * Every step writes to `scan_runs`, so when the board looks wrong there is a
 * log that says what the last run actually did.
 */

import {
  enrichWithClaude,
  screenThread,
  type BrandCandidate,
  type ScreenContext,
} from "./classify";
import { backfillDays, ownAddresses, ownDomains, scanThreadLimit } from "./env";
import {
  fetchThread,
  getAccessToken,
  GmailAuthError,
  listThreadIds,
  mapWithConcurrency,
} from "./gmail";
import { awaitingOurReply, deriveAutoStage, resolveStage } from "./stages";
import { supabaseAdmin } from "./supabase/admin";
import type { BrandRow, ScannedMessage, ScannedThread, Stage } from "./types";

export interface ScanOptions {
  trigger: "cron" | "manual" | "backfill";
  /** Ignore the overlap lock. Only used by an explicit manual re-run. */
  force?: boolean;
  /** Override the lookback, in days. Used by a full backfill. */
  sinceDays?: number;
}

export interface ScanSummary {
  runId: number | null;
  status: "ok" | "error" | "skipped";
  threadsSeen: number;
  messagesSeen: number;
  brandsCreated: number;
  brandsUpdated: number;
  stagesChanged: number;
  skipped: number;
  windowStart: string | null;
  error?: string;
}

/** A run still marked running after this long is assumed dead, not active. */
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

/** Gmail allows plenty of parallelism; this is polite and still fast. */
const THREAD_CONCURRENCY = 6;

/** Re-look at this much already-scanned time, so nothing slips through a gap. */
const OVERLAP_HOURS = 24;

export async function runScan(options: ScanOptions): Promise<ScanSummary> {
  const db = supabaseAdmin();

  const blocked = await activeRun(options.force ?? false);
  if (blocked) {
    return {
      runId: null,
      status: "skipped",
      threadsSeen: 0,
      messagesSeen: 0,
      brandsCreated: 0,
      brandsUpdated: 0,
      stagesChanged: 0,
      skipped: 0,
      windowStart: null,
      error: "A scan is already running",
    };
  }

  const { data: run, error: runError } = await db
    .from("scan_runs")
    .insert({ trigger: options.trigger })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Could not start scan run: ${runError?.message ?? "unknown error"}`);
  }

  const runId = run.id as number;
  const counters = {
    threadsSeen: 0,
    messagesSeen: 0,
    brandsCreated: 0,
    brandsUpdated: 0,
    stagesChanged: 0,
    skipped: 0,
  };
  let windowStart: string | null = null;

  try {
    const result = await scanInbox(options, counters);
    windowStart = result.windowStart;

    await db
      .from("scan_runs")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        window_start: windowStart,
        ...snakeCounters(counters),
      })
      .eq("id", runId);

    return { runId, status: "ok", windowStart, ...counters };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db
      .from("scan_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        window_start: windowStart,
        error: message,
        ...snakeCounters(counters),
      })
      .eq("id", runId);

    return { runId, status: "error", windowStart, error: message, ...counters };
  }
}

function snakeCounters(c: {
  threadsSeen: number;
  messagesSeen: number;
  brandsCreated: number;
  brandsUpdated: number;
  stagesChanged: number;
  skipped: number;
}) {
  return {
    threads_seen: c.threadsSeen,
    messages_seen: c.messagesSeen,
    brands_created: c.brandsCreated,
    brands_updated: c.brandsUpdated,
    stages_changed: c.stagesChanged,
    skipped: c.skipped,
  };
}

/** True when another run holds the lock. */
async function activeRun(force: boolean): Promise<boolean> {
  if (force) return false;

  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();

  const { data } = await db
    .from("scan_runs")
    .select("id, started_at")
    .eq("status", "running")
    .gte("started_at", cutoff)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

interface Counters {
  threadsSeen: number;
  messagesSeen: number;
  brandsCreated: number;
  brandsUpdated: number;
  stagesChanged: number;
  skipped: number;
}

async function scanInbox(
  options: ScanOptions,
  counters: Counters,
): Promise<{ windowStart: string }> {
  const db = supabaseAdmin();

  // --- the inbox --------------------------------------------------------
  const { data: account } = await db
    .from("gmail_accounts")
    .select("id, email, refresh_token, last_window_at")
    .eq("active", true)
    .order("connected_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!account) {
    throw new Error("No Gmail inbox is connected. Connect one from Settings.");
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(account.refresh_token as string);
  } catch (error) {
    if (error instanceof GmailAuthError) {
      await db.from("gmail_accounts").update({ active: false }).eq("id", account.id);
    }
    throw error;
  }

  // --- the window -------------------------------------------------------
  const since = resolveWindow(account.last_window_at as string | null, options);
  const query = [
    "in:anywhere",
    "-in:chats",
    `after:${Math.floor(since.getTime() / 1000)}`,
  ].join(" ");

  // --- what we already know --------------------------------------------
  const [ignored, blockedPatterns, knownThreadIds] = await Promise.all([
    loadPatterns("ignored_senders"),
    loadPatterns("blocked_entities"),
    loadKnownThreadIds(),
  ]);

  const ctx: ScreenContext = {
    ownAddresses: ownAddresses(account.email as string),
    ownDomains: ownDomains(),
    ignored,
    blocked: blockedPatterns,
  };

  // --- pull threads -----------------------------------------------------
  const threadIds = await listThreadIds(accessToken, query, scanThreadLimit());
  counters.threadsSeen = threadIds.length;

  const threads = await mapWithConcurrency(threadIds, THREAD_CONCURRENCY, async (id) => {
    try {
      // Bodies are only needed to classify a thread we have never seen. For
      // threads already on the board, metadata is all the stage machine reads.
      return await fetchThread(accessToken, id, {
        withBody: !knownThreadIds.has(id),
        ownAddresses: ctx.ownAddresses,
      });
    } catch {
      return null;
    }
  });

  // --- screen and group -------------------------------------------------
  const groups = new Map<
    string,
    { candidate: BrandCandidate; threads: ScannedThread[]; blocked: boolean }
  >();

  for (const thread of threads) {
    if (!thread) {
      counters.skipped += 1;
      continue;
    }

    const screened = screenThread(thread, ctx);
    if (screened.verdict === "skip" || !screened.candidate) {
      counters.skipped += 1;
      continue;
    }

    const key = screened.candidate.groupKey;
    const existing = groups.get(key);
    if (existing) {
      existing.threads.push(thread);
      existing.blocked = existing.blocked || screened.verdict === "blocked";
    } else {
      groups.set(key, {
        candidate: screened.candidate,
        threads: [thread],
        blocked: screened.verdict === "blocked",
      });
    }
  }

  if (groups.size === 0) {
    await db
      .from("gmail_accounts")
      .update({ last_scan_at: new Date().toISOString() })
      .eq("id", account.id);
    return { windowStart: since.toISOString() };
  }

  // --- brands -----------------------------------------------------------
  const brandIdByKey = await upsertBrands(groups, counters);

  // --- threads and messages --------------------------------------------
  let newestSeen = since;
  const threadRows: Record<string, unknown>[] = [];
  const messageRows: Record<string, unknown>[] = [];

  for (const [key, group] of groups) {
    const brandId = brandIdByKey.get(key);
    if (!brandId) continue;

    for (const thread of group.threads) {
      const sorted = [...thread.messages].sort(
        (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
      );
      if (sorted.length === 0) continue;

      const last = sorted[sorted.length - 1];
      const lastSent = new Date(last.sentAt);
      if (lastSent > newestSeen) newestSeen = lastSent;

      threadRows.push({
        id: thread.id,
        brand_id: brandId,
        subject: sorted[0].subject,
        snippet: last.snippet,
        message_count: sorted.length,
        first_message_at: sorted[0].sentAt,
        last_message_at: last.sentAt,
        last_direction: last.direction,
        updated_at: new Date().toISOString(),
      });

      for (const message of sorted) {
        messageRows.push(messageRow(message, brandId));
      }
    }
  }

  counters.messagesSeen = messageRows.length;

  if (threadRows.length > 0) {
    await chunked(threadRows, 500, async (chunk) => {
      const { error } = await db.from("threads").upsert(chunk, { onConflict: "id" });
      if (error) throw new Error(`Saving threads failed: ${error.message}`);
    });
  }

  if (messageRows.length > 0) {
    await chunked(messageRows, 500, async (chunk) => {
      const { error } = await db.from("messages").upsert(chunk, { onConflict: "id" });
      if (error) throw new Error(`Saving messages failed: ${error.message}`);
    });
  }

  // --- recompute facts, then move stages -------------------------------
  const brandIds = [...brandIdByKey.values()];

  const { error: refreshError } = await db.rpc("refresh_brand_facts", { ids: brandIds });
  if (refreshError) {
    throw new Error(`Refreshing brand facts failed: ${refreshError.message}`);
  }

  counters.stagesChanged = await applyStages(brandIds);
  counters.brandsUpdated = brandIds.length - counters.brandsCreated;

  await db
    .from("gmail_accounts")
    .update({
      last_scan_at: new Date().toISOString(),
      last_window_at: newestSeen.toISOString(),
    })
    .eq("id", account.id);

  return { windowStart: since.toISOString() };
}

function resolveWindow(lastWindowAt: string | null, options: ScanOptions): Date {
  if (options.sinceDays) {
    return new Date(Date.now() - options.sinceDays * 86_400_000);
  }

  if (!lastWindowAt) {
    return new Date(Date.now() - backfillDays() * 86_400_000);
  }

  // Re-read the last day every time. Gmail's `after:` has second granularity
  // and messages can land out of order; the overlap makes a missed thread
  // impossible rather than unlikely. Upserts make the repeat work free.
  return new Date(new Date(lastWindowAt).getTime() - OVERLAP_HOURS * 3_600_000);
}

function messageRow(message: ScannedMessage, brandId: string) {
  return {
    id: message.id,
    thread_id: message.threadId,
    brand_id: brandId,
    direction: message.direction,
    from_email: message.fromEmail,
    from_name: message.fromName,
    to_emails: message.toEmails,
    subject: message.subject,
    snippet: message.snippet,
    sent_at: message.sentAt,
  };
}

async function loadPatterns(table: "ignored_senders" | "blocked_entities"): Promise<Set<string>> {
  const { data } = await supabaseAdmin().from(table).select("pattern");
  return new Set((data ?? []).map((row) => String(row.pattern).toLowerCase()));
}

async function loadKnownThreadIds(): Promise<Set<string>> {
  const { data } = await supabaseAdmin().from("threads").select("id");
  return new Set((data ?? []).map((row) => String(row.id)));
}

/**
 * Find or create a brand per group.
 *
 * Claude enrichment runs only for brands being created — the name and summary
 * do not change once set, so re-running it every hour would spend money to
 * learn nothing.
 */
async function upsertBrands(
  groups: Map<string, { candidate: BrandCandidate; threads: ScannedThread[]; blocked: boolean }>,
  counters: Counters,
): Promise<Map<string, string>> {
  const db = supabaseAdmin();
  const keys = [...groups.keys()];

  const { data: existing } = await db
    .from("brands")
    .select("id, group_key")
    .in("group_key", keys);

  const idByKey = new Map<string, string>(
    (existing ?? []).map((row) => [String(row.group_key), String(row.id)]),
  );

  const toCreate = keys.filter((key) => !idByKey.has(key));
  if (toCreate.length === 0) return idByKey;

  const rows = await mapWithConcurrency(toCreate, 4, async (key) => {
    const group = groups.get(key)!;
    const { candidate } = group;

    // A do-not-contact entity is recorded but kept off the board entirely.
    if (group.blocked) {
      return {
        group_key: key,
        name: candidate.name,
        domain: candidate.domain,
        primary_contact_email: candidate.contactEmail,
        primary_contact_name: candidate.contactName,
        classification: "dismissed" as const,
        summary: "Do-not-contact entity — flagged by the standing agency rule.",
        blocked: true,
        archived: true,
      };
    }

    const enrichment = await enrichWithClaude(candidate);

    return {
      group_key: key,
      name: enrichment?.brandName ?? candidate.name,
      domain: candidate.domain,
      website: candidate.domain ? `https://${candidate.domain}` : null,
      primary_contact_email: candidate.contactEmail,
      primary_contact_name: enrichment?.contactName ?? candidate.contactName,
      // Claude saying "not a brand inquiry" archives it rather than deleting
      // it, so a wrong call is one click to undo instead of lost.
      classification: enrichment
        ? enrichment.isBrandInquiry
          ? ("brand" as const)
          : ("dismissed" as const)
        : ("unverified" as const),
      confidence: enrichment?.confidence ?? null,
      summary: enrichment?.summary ?? null,
      archived: enrichment ? !enrichment.isBrandInquiry : false,
    };
  });

  const { data: created, error } = await db
    .from("brands")
    .upsert(rows, { onConflict: "group_key" })
    .select("id, group_key");

  if (error) throw new Error(`Creating brands failed: ${error.message}`);

  for (const row of created ?? []) {
    idByKey.set(String(row.group_key), String(row.id));
  }

  counters.brandsCreated += toCreate.length;
  return idByKey;
}

/**
 * Run the stage machine over every brand this scan touched.
 *
 * A stage a person set by hand is left exactly where they put it; when the
 * inbox disagrees, `auto_stage` records the disagreement and the card shows it
 * as a suggestion to accept.
 */
async function applyStages(brandIds: string[]): Promise<number> {
  const db = supabaseAdmin();

  const { data: brands } = await db
    .from("brands")
    .select(
      "id, stage, stage_source, last_direction, last_outbound_at, archived, auto_stage",
    )
    .in("id", brandIds);

  let changed = 0;
  const now = new Date().toISOString();

  for (const row of (brands ?? []) as Pick<
    BrandRow,
    "id" | "stage" | "stage_source" | "last_direction" | "last_outbound_at" | "archived" | "auto_stage"
  >[]) {
    if (row.archived) continue;
    if (!row.last_direction) continue;

    const autoStage: Stage = deriveAutoStage({
      lastDirection: row.last_direction,
      everRepliedByUs: row.last_outbound_at !== null,
    });

    const resolution = resolveStage({
      currentStage: row.stage,
      stageSource: row.stage_source,
      autoStage,
    });

    const update: Record<string, unknown> = {
      auto_stage: autoStage,
      awaiting_our_reply: awaitingOurReply(row.last_direction),
    };

    if (resolution.changed) {
      update.stage = resolution.stage;
      update.stage_changed_at = now;
      update.stage_changed_by = "hourly scan";
      changed += 1;

      await db.from("stage_events").insert({
        brand_id: row.id,
        from_stage: row.stage,
        to_stage: resolution.stage,
        source: "auto",
        actor: "hourly scan",
        note: "Moved by the inbox scan",
      });
    }

    await db.from("brands").update(update).eq("id", row.id);
  }

  return changed;
}

async function chunked<T>(
  items: T[],
  size: number,
  handler: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < items.length; index += size) {
    await handler(items.slice(index, index + size));
  }
}
