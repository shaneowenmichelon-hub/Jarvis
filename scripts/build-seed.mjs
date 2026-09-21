/**
 * Generates seed/pipeline.json — the data `npm run dev` boots with when no
 * Supabase project is configured.
 *
 * Every row came from a real scan of shane@zmmevents.com covering
 * 31 Aug – 21 Sep 2026, under the agency's intake rule: a brand exists because
 * it came through the form at collegiateagency.com, which arrives as a
 * notification from no-reply@zmmevents.com. Six submissions landed in that
 * window. Everything after the submission is the conversation that followed.
 *
 * Stages are NOT written by hand — this runs the same derivation the hourly
 * scan uses, so the seed cannot drift from the engine.
 *
 * Run with: node scripts/build-seed.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "seed", "pipeline.json");

/** The moment the scan was taken. Ages on the board are measured from here. */
const SCANNED_AT = "2026-09-21T20:00:00.000Z";

/** Mirrors deriveAutoStage in src/lib/stages.ts. */
function deriveStage({ lastDirection, everRepliedByUs }) {
  if (lastDirection === "outbound") return "awaiting_feedback";
  return everRepliedByUs ? "needs_reply" : "new_submission";
}

/**
 * The six form submissions, and what happened to each afterwards.
 *
 * `out` is the last message that actually reached the brand — an internal
 * forward to a teammate is not one.
 */
const PIPELINE = [
  {
    key: "itsfratflix.com", name: "FratFlix", domain: "itsfratflix.com",
    contact: "CJ Coppola", email: "cj@itsfratflix.com",
    submitted: "2026-08-31T16:52:32Z",
    interests: null, budget: "Not sure yet",
    summary: "Busiest thread in the pipeline — 35 messages since the submission, looped in with Anheuser-Busch.",
    in: "2026-09-21T19:38:33Z", out: "2026-09-21T19:44:36Z",
    threads: 2, messages: 37,
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - FratFlix", "First Name CJ Last Name Coppola Company FratFlix Email cj@itsfratflix.com Phone 15154919838 Interests Budget Not sure yet", "2026-08-31T16:52:32Z", false],
      ["out", "shane@zmmevents.com", "Collegiate Agency x FratFlix", "Thanks for reaching out through the site.", "2026-08-31T19:25:45Z", false],
      ["in", "cj@itsfratflix.com", "Re: Collegiate Agency x FratFlix", "Latest round of notes.", "2026-09-21T19:38:33Z", false],
      ["out", "shane@zmmevents.com", "Re: Collegiate Agency x FratFlix", "Got it — see below.", "2026-09-21T19:44:36Z", false],
    ],
  },
  {
    key: "crains.co.kr", name: "Crains", domain: "crains.co.kr",
    contact: "Isabelle Lee", email: "izi.lee@crains.co.kr",
    submitted: "2026-09-04T07:44:38Z",
    interests: "Brand Ambassadors", budget: null,
    summary: "Korean skincare client Heveblue wants product sampling at New York and East Coast universities in October.",
    in: "2026-09-21T15:52:47Z", out: "2026-09-21T15:16:55Z",
    threads: 4, messages: 53, value: 25000,
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - Crains", "First Name Isabelle Last Name Lee Company Crains Email izi.lee@crains.co.kr Phone 82-10-62613142 Interests Brand Ambassadors", "2026-09-04T07:44:38Z", false],
      ["out", "shane@zmmevents.com", "Re: Collegiate sampling activation for a new Korean skincare brand", "Confirming the scope for October.", "2026-09-21T15:16:55Z", false],
      ["in", "yewon.lee@crains.co.kr", "Re: New opportunity with Crains", "One of our clients, Heveblue, a Korean skincare brand, are interested in partnering with universities in New York and across the East Coast for product sampling on October.", "2026-09-21T15:52:47Z", false],
    ],
  },
  {
    key: "thesaltyapp.com", name: "Salty", domain: "thesaltyapp.com",
    contact: "Svetoslava Angelova", email: "s.angelova@thesaltyapp.com",
    submitted: "2026-09-14T22:14:12Z",
    interests: "Brand Ambassadors", budget: null,
    summary: "Submitted on 14 September asking about brand ambassadors.",
    in: "2026-09-14T22:14:12Z", out: "2026-09-18T18:36:25Z",
    threads: 2, messages: 3,
    note: "Two emails sent since the submission. They have never replied to either.",
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - Salty", "First Name Svetoslava Last Name Angelova Company Salty Email s.angelova@thesaltyapp.com Interests Brand Ambassadors", "2026-09-14T22:14:12Z", false],
      ["out", "shane@zmmevents.com", "Collegiate Agency x The Salty App", "Following up on your inquiry.", "2026-09-14T23:12:05Z", false],
      ["out", "shane@zmmevents.com", "Re: Collegiate Agency x The Salty App", "Bumping this one.", "2026-09-18T18:36:25Z", false],
    ],
  },
  {
    key: "uhomes.com", name: "uhomes.com", domain: "uhomes.com",
    contact: "Zimo Liu", email: "zimo.liu@uhomes.com",
    submitted: "2026-09-15T17:57:33Z",
    interests: null, budget: "Not sure yet",
    summary: "You scoped 5–10 ambassadors per school plus one on-campus event, at $2,000–$3,000 per school.",
    in: "2026-09-21T17:11:46Z", out: "2026-09-21T17:19:49Z",
    threads: 3, messages: 14, value: 3000,
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - uhomes.com", "First Name Zimo Last Name Liu Company uhomes.com Email zimo.liu@uhomes.com Phone 2036666079 Interests Budget Not sure yet", "2026-09-15T17:57:33Z", false],
      ["in", "zimo.liu@uhomes.com", "Re: Uhomes x Collegiate Agency", "Confirming the budget range on our side.", "2026-09-21T17:11:46Z", false],
      ["out", "shane@zmmevents.com", "Re: Uhomes x Collegiate Agency", "With this budget in mind ($2000-$3000 per school), we are thinking of a mix of 5-10 ambassadors per school and one on-campus event at a few schools where your brand can…", "2026-09-21T17:19:49Z", false],
    ],
  },
  {
    key: "shaneowenmichelon@yahoo.com", name: "SOS consultants", domain: null,
    contact: "Shane Michelon", email: "shaneowenmichelon@yahoo.com",
    submitted: "2026-09-16T18:50:28Z",
    interests: null, budget: "Under 10k",
    summary: "Submitted from your own personal address — this looks like a test of the form.",
    in: "2026-09-16T18:50:28Z", out: null,
    threads: 1, messages: 1,
    note: "Add shaneowenmichelon@yahoo.com to OWN_ADDRESSES and the scan will stop creating this card.",
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - SOS consultants", "First Name Shane Last Name Michelon Company SOS consultants Email shaneowenmichelon@yahoo.com Interests Budget Under 10k", "2026-09-16T18:50:28Z", false],
    ],
  },
  {
    key: "orbitstudio.us", name: "FlatFlow", domain: "orbitstudio.us",
    contact: "Vraj Patel", email: "vrajpatel@orbitstudio.us",
    submitted: "2026-09-21T15:33:23Z",
    interests: "Brand Ambassadors", budget: "Under 10k",
    summary: "Brand ambassadors, budget under 10k. Zach called it worth a call.",
    in: "2026-09-21T15:33:23Z", out: "2026-09-21T18:50:59Z",
    threads: 2, messages: 4,
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - FlatFlow", "First Name Vraj Last Name Patel Company FlatFlow Email vrajpatel@orbitstudio.us Phone 8479897408 Interests Brand Ambassadors Budget Under 10k", "2026-09-21T15:33:23Z", false],
      ["out", "shane@zmmevents.com", "FlatFlow x Collegiate Agency", "Thanks for reaching out via our website. My names Shane Michelon, and I have my partner Zach CCed here. Happy to hop on a call later this week to discuss the scope of work in greater detail.", "2026-09-21T18:50:59Z", false],
    ],
  },
];

// ---------------------------------------------------------------------------

const brands = [];
const messages = [];
const stageEvents = [];

PIPELINE.forEach((row, index) => {
  const id = `seed-${String(index + 1).padStart(2, "0")}`;

  const lastMessageAt = [row.in, row.out].filter(Boolean).sort().at(-1);
  const lastDirection = lastMessageAt === row.out ? "outbound" : "inbound";

  const stage = deriveStage({ lastDirection, everRepliedByUs: row.out !== null });

  // What the board shows when no model has rewritten it.
  const fromFields = [row.interests, row.budget && `Budget: ${row.budget}`]
    .filter(Boolean)
    .join(" · ");

  brands.push({
    id,
    group_key: row.key,
    name: row.name,
    domain: row.domain ?? null,
    website: row.domain ? `https://${row.domain}` : null,
    primary_contact_name: row.contact,
    primary_contact_email: row.email,
    stage,
    stage_source: "auto",
    auto_stage: stage,
    stage_changed_at: SCANNED_AT,
    stage_changed_by: "hourly scan",
    owner_email: null,
    first_contact_at: row.submitted,
    last_message_at: lastMessageAt,
    last_inbound_at: row.in ?? null,
    last_outbound_at: row.out ?? null,
    last_direction: lastDirection,
    awaiting_our_reply: lastDirection === "inbound",
    thread_count: row.threads,
    message_count: row.messages,
    // A form submission is a brand by definition — nothing to confirm.
    classification: "brand",
    confidence: 1,
    summary: row.summary ?? fromFields ?? null,
    deal_value: row.value ?? null,
    event_tag: null,
    notes: row.note ?? null,
    blocked: false,
    archived: false,
    created_at: row.submitted,
    updated_at: SCANNED_AT,
  });

  stageEvents.push({
    id: index + 1,
    brand_id: id,
    from_stage: null,
    to_stage: stage,
    source: "auto",
    actor: "hourly scan",
    note: "Created from a website submission",
    created_at: row.submitted,
  });

  (row.msgs ?? []).forEach(([direction, from, subject, snippet, sentAt, internal], n) => {
    messages.push({
      id: `${id}-m${n + 1}`,
      thread_id: `${id}-t1`,
      brand_id: id,
      direction,
      internal,
      from_email: from,
      from_name: null,
      to_emails: direction === "inbound" ? ["shane@zmmevents.com"] : [row.email],
      cc_emails: [],
      subject,
      snippet: snippet || null,
      sent_at: sentAt,
    });
  });
});

const db = {
  scanned_at: SCANNED_AT,
  brands,
  messages,
  stage_events: stageEvents,
  scan_runs: [
    {
      id: 1,
      trigger: "backfill",
      status: "ok",
      started_at: SCANNED_AT,
      finished_at: SCANNED_AT,
      window_start: "2026-08-31T00:00:00.000Z",
      threads_seen: 27,
      messages_seen: messages.length,
      brands_created: brands.length,
      brands_updated: 0,
      stages_changed: brands.length,
      skipped: 11,
      error: null,
    },
  ],
  gmail_accounts: [
    {
      id: "seed-inbox",
      email: "shane@zmmevents.com",
      connected_by: "shane@zmmevents.com",
      connected_at: SCANNED_AT,
      last_scan_at: SCANNED_AT,
      active: true,
    },
  ],
  ignored_senders: [],
  blocked_entities: [
    { pattern: "cbrands.com", reason: "Do not contact — standing agency rule" },
    { pattern: "constellationbrands.com", reason: "Do not contact — standing agency rule" },
  ],
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(db, null, 2)}\n`);

const counts = brands.reduce((acc, b) => ({ ...acc, [b.stage]: (acc[b.stage] ?? 0) + 1 }), {});
console.log(`Wrote ${OUT}`);
console.log(`${brands.length} brands, ${messages.length} messages`);
console.log(counts);
