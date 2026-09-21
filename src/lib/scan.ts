/**
 * The scan.
 *
 * Runs hourly from cron, or on demand from the dashboard. One pass:
 *
 *   1. take the lock, so two runs never overlap
 *   2. work out how far back to look
 *   3. pull the website form's notifications — this is the only intake
 *   4. pull the conversations of every brand already on the board
 *   5. save threads and messages, recompute each brand's email facts
 *   6. move stages — but never one a human has pinned
 *
 * Step 3 and step 4 are separate Gmail queries rather than one sweep of the
 * inbox. The agency gets a few hundred threads a week and a handful of them
 * matter; asking Gmail for exactly those two sets is both faster and, more
 * importantly, means nothing else can end up on the board by accident.
 */

import {
  enrichWithClaude,
  screenThread,
  summaryFromForm,
  type BrandCandidate,
  type ScreenContext,
} from "./classify";
import {
  backfillDays,
  formSenders,
  formSubjectMatch,
  ownAddresses,
  ownDomains,
  scanThreadLimit,
} from "./env";
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

/** Brands per conversation query. Keeps each query well inside Gmail's limit. */
const KEYS_PER_QUERY = 15;

export async function runScan(options: ScanOptions): Promise<ScanSummary> {
  const db = supabaseAdmin();

  if (await activeRun(options.force ?? false)) {
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
  const counters: Counters = {
    threadsSeen: 0,
    messagesSeen: 0,
    brandsCreated: 0,
    brandsUpdated: 0,
    stagesChanged: 0,
    skipped: 0,
  };
  let windowStart: string | null = null;

  try {
    windowStart = (await scanInbox(options, counters)).windowStart;

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

interface Counters {
  threadsSeen: number;
  messagesSeen: number;
  brandsCreated: number;
  brandsUpdated: number;
  stagesChanged: number;
  skipped: number;
}

function snakeCounters(c: Counters) {
  return {
    threads_seen: c.threadsSeen,
    messages_seen: c.messagesSeen,
    brands_created: c.brandsCreated,
    brands_updated: c.brandsUpdated,
    stages_changed: c.stagesChanged,
    skipped: c.skipped,
  };
}

async function activeRun(force: boolean): Promise<boolean> {
  if (force) return false;

  const cutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
  const { data } = await supabaseAdmin()
    .from("scan_runs")
    .select("id")
    .eq("status", "running")
    .gte("started_at", cutoff)
    .limit(1);

  return (data?.length ?? 0) > 0;
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

  // --- the window and what we already know ------------------------------
  const since = resolveWindow(account.last_window_at as string | null, options);
  const afterSeconds = Math.floor(since.getTime() / 1000);

  const [blockedPatterns, knownThreadIds, known] = await Promise.all([
    loadPatterns("blocked_entities"),
    loadKnownThreadIds(),
    loadKnownBrands(),
  ]);

  const ctx: ScreenContext = {
    ownAddresses: ownAddresses(account.email as string),
    ownDomains: ownDomains(),
    formSenders: formSenders(),
    formSubjectMatch: formSubjectMatch(),
    knownByEmail: known.byEmail,
    knownByDomain: known.byDomain,
    blocked: blockedPatterns,
  };

  // --- ask Gmail for exactly the two sets that matter -------------------
  const threadIds = new Set<string>();

  // Submissions.
  const senders = [...ctx.formSenders].join(" OR ");
  for (const id of await listThreadIds(
    accessToken,
    `in:anywhere after:${afterSeconds} from:(${senders})`,
    scanThreadLimit(),
  )) {
    threadIds.add(id);
  }

  // Conversations with brands already on the board. Both the exact addresses
  // and the company domains, so a colleague writing in is still found.
  const searchTerms = [...new Set([...known.byEmail.keys(), ...known.byDomain.keys()])];

  for (const batch of chunk(searchTerms, KEYS_PER_QUERY)) {
    const clause = batch.map((key) => `from:${key} to:${key} cc:${key}`).join(" ");
    for (const id of await listThreadIds(
      accessToken,
      `in:anywhere after:${afterSeconds} {${clause}}`,
      scanThreadLimit(),
    )) {
      threadIds.add(id);
    }
  }

  counters.threadsSeen = threadIds.size;

  const threads = await mapWithConcurrency([...threadIds], THREAD_CONCURRENCY, async (id) => {
    try {
      // Bodies are only needed to read a form's fields. Once a thread is known,
      // metadata is all the stage machine looks at.
      return await fetchThread(accessToken, id, {
        withBody: !knownThreadIds.has(id),
        ownAddresses: ctx.ownAddresses,
        ownDomains: ctx.ownDomains,
      });
    } catch {
      return null;
    }
  });

  // --- screen and group -------------------------------------------------
  const groups = new Map<
    string,
    { candidate: BrandCandidate | null; threads: ScannedThread[]; blocked: boolean }
  >();

  const add = (key: string, thread: ScannedThread, candidate: BrandCandidate | null, blocked = false) => {
    const existing = groups.get(key);
    if (existing) {
      existing.threads.push(thread);
      existing.candidate = existing.candidate ?? candidate;
      existing.blocked = existing.blocked || blocked;
    } else {
      groups.set(key, { candidate, threads: [thread], blocked });
    }
  };

  for (const thread of threads) {
    if (!thread) {
      counters.skipped += 1;
      continue;
    }

    const screened = screenThread(thread, ctx);

    switch (screened.verdict) {
      case "submission":
        add(screened.candidate.groupKey, thread, screened.candidate);
        break;
      case "blocked":
        add(screened.candidate.groupKey, thread, screened.candidate, true);
        break;
      case "attach":
        add(screened.groupKey, thread, null);
        break;
      default:
        counters.skipped += 1;
    }
  }

  if (groups.size === 0) {
    await db
      .from("gmail_accounts")
      .update({ last_scan_at: new Date().toISOString() })
      .eq("id", account.id);
    return { windowStart: since.toISOString() };
  }

  // --- brands, threads, messages ---------------------------------------
  const brandIdByKey = await upsertBrands(groups, counters);

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

      for (const message of sorted) messageRows.push(messageRow(message, brandId));
    }
  }

  counters.messagesSeen = messageRows.length;

  if (threadRows.length > 0) {
    await chunked(threadRows, 500, async (rows) => {
      const { error } = await db.from("threads").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Saving threads failed: ${error.message}`);
    });
  }

  if (messageRows.length > 0) {
    await chunked(messageRows, 500, async (rows) => {
      const { error } = await db.from("messages").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Saving messages failed: ${error.message}`);
    });
  }

  // --- recompute facts, then move stages -------------------------------
  const brandIds = [...brandIdByKey.values()];

  const { error: refreshError } = await db.rpc("refresh_brand_facts", { ids: brandIds });
  if (refreshError) throw new Error(`Refreshing brand facts failed: ${refreshError.message}`);

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
  if (options.sinceDays) return new Date(Date.now() - options.sinceDays * 86_400_000);
  if (!lastWindowAt) return new Date(Date.now() - backfillDays() * 86_400_000);

  // Re-read the last day every time. Gmail's `after:` has second granularity
  // and mail can land out of order; the overlap makes a missed thread
  // impossible rather than unlikely, and upserts make the repeat work free.
  return new Date(new Date(lastWindowAt).getTime() - OVERLAP_HOURS * 3_600_000);
}

function messageRow(message: ScannedMessage, brandId: string) {
  return {
    id: message.id,
    thread_id: message.threadId,
    brand_id: brandId,
    direction: message.direction,
    internal: message.internal,
    from_email: message.fromEmail,
    from_name: message.fromName,
    to_emails: message.toEmails,
    cc_emails: message.ccEmails,
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
 * Brands on the board, indexed for matching.
 *
 * Archived brands are excluded, so dismissing one genuinely stops the scan
 * following it rather than quietly carrying on in the background.
 *
 * A domain is only indexed when exactly one brand sits on it. Two brands
 * sharing a domain — an agency running campaigns for two different clients —
 * are reachable only by their own contact addresses, because filing a message
 * on the wrong deal is worse than leaving it unfiled.
 */
async function loadKnownBrands(): Promise<{
  byEmail: Map<string, string>;
  byDomain: Map<string, string>;
}> {
  const { data } = await supabaseAdmin()
    .from("brands")
    .select("group_key, domain, primary_contact_email")
    .eq("blocked", false)
    .eq("archived", false);

  const byEmail = new Map<string, string>();
  const domainCounts = new Map<string, Set<string>>();

  for (const row of data ?? []) {
    const groupKey = String(row.group_key);
    const email = row.primary_contact_email ? String(row.primary_contact_email).toLowerCase() : null;

    if (email) byEmail.set(email, groupKey);
    // The group key is itself an address when the contact is on free mail.
    if (groupKey.includes("@")) byEmail.set(groupKey.toLowerCase(), groupKey);

    const domain = row.domain ? String(row.domain).toLowerCase() : null;
    if (domain) {
      const brands = domainCounts.get(domain) ?? new Set<string>();
      brands.add(groupKey);
      domainCounts.set(domain, brands);
    }
  }

  const byDomain = new Map<string, string>();
  for (const [domain, brands] of domainCounts) {
    if (brands.size === 1) byDomain.set(domain, [...brands][0]);
  }

  return { byEmail, byDomain };
}

/**
 * Create the brands this scan found, and leave the existing ones alone.
 *
 * A form submission tells us the company, the contact and what they want, so
 * there is nothing to guess at — every submission lands as a confirmed brand.
 * Claude is asked for a tidier one-line summary when a key is configured, and
 * only ever on creation.
 */
async function upsertBrands(
  groups: Map<string, { candidate: BrandCandidate | null; threads: ScannedThread[]; blocked: boolean }>,
  counters: Counters,
): Promise<Map<string, string>> {
  const db = supabaseAdmin();
  const keys = [...groups.keys()];

  const { data: existing } = await db.from("brands").select("id, group_key").in("group_key", keys);

  const idByKey = new Map<string, string>(
    (existing ?? []).map((row) => [String(row.group_key), String(row.id)]),
  );

  // A thread can only create a brand if it carried a submission. An "attach"
  // for a brand that has since been deleted simply has nowhere to go.
  const toCreate = keys.filter((key) => !idByKey.has(key) && groups.get(key)?.candidate);
  if (toCreate.length === 0) return idByKey;

  const rows = await mapWithConcurrency(toCreate, 4, async (key) => {
    const group = groups.get(key)!;
    const candidate = group.candidate!;

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

    const fromFields = summaryFromForm(candidate);
    const enrichment = await enrichWithClaude(candidate);

    return {
      group_key: key,
      name: candidate.name,
      domain: candidate.domain,
      website: candidate.domain ? `https://${candidate.domain}` : null,
      primary_contact_email: candidate.contactEmail,
      primary_contact_name: candidate.contactName,
      // The form is the agency's own front door, so a submission is a brand by
      // definition — nothing here needs a human to confirm it is real.
      classification: "brand" as const,
      confidence: 1,
      summary: enrichment?.summary ?? fromFields,
      archived: false,
    };
  });

  const { data: created, error } = await db
    .from("brands")
    .upsert(rows, { onConflict: "group_key" })
    .select("id, group_key");

  if (error) throw new Error(`Creating brands failed: ${error.message}`);

  for (const row of created ?? []) idByKey.set(String(row.group_key), String(row.id));

  counters.brandsCreated += toCreate.length;
  return idByKey;
}

/**
 * Run the stage machine over every brand this scan touched.
 *
 * A stage a person set by hand is left exactly where they put it; when the
 * inbox disagrees, `auto_stage` records the disagreement and the card offers
 * it as a suggestion to accept.
 */
async function applyStages(brandIds: string[]): Promise<number> {
  const db = supabaseAdmin();

  const { data: brands } = await db
    .from("brands")
    .select("id, stage, stage_source, last_direction, last_outbound_at, archived, auto_stage")
    .in("id", brandIds);

  let changed = 0;
  const now = new Date().toISOString();

  for (const row of (brands ?? []) as Pick<
    BrandRow,
    "id" | "stage" | "stage_source" | "last_direction" | "last_outbound_at" | "archived" | "auto_stage"
  >[]) {
    if (row.archived || !row.last_direction) continue;

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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

async function chunked<T>(
  items: T[],
  size: number,
  handler: (rows: T[]) => Promise<void>,
): Promise<void> {
  for (const rows of chunk(items, size)) await handler(rows);
}
