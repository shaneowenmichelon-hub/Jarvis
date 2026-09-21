/**
 * Generates seed/pipeline.json — the data `npm run dev` boots with when no
 * Supabase project is configured.
 *
 * Every row came from a real scan of shane@zmmevents.com covering
 * 31 Aug – 21 Sep 2026, under the agency's intake rule: a brand exists because
 * it came through the form at collegiateagency.com, which arrives as a
 * notification from no-reply@zmmevents.com. Everything after the submission is
 * the conversation that followed.
 *
 * One card here did not come through the form: Triumph arrived off-website and
 * is entered by hand, which is the other half of the intake rule.
 *
 * Three form submissions are deliberately absent, because the team filled them
 * in themselves: "SOS consultants" (Shane, from his Yahoo address) and two QA
 * tests on the agency domain. The scan skips all three at source now, so this
 * file and an hourly run agree.
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
const SCANNED_AT = "2026-09-21T21:00:00.000Z";

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
    key: "crains.co.kr", name: "Crains — Korean skincare activation", domain: "crains.co.kr",
    contact: "Isabelle Lee", email: "izi.lee@crains.co.kr",
    submitted: "2026-09-04T07:44:38Z",
    interests: "Brand Ambassadors", budget: null,
    summary: "Scope agreed after the client meeting: one campus activation plus 10 UGC videos. Revised terms sent.",
    in: "2026-09-21T07:09:13Z", out: "2026-09-21T15:16:55Z",
    threads: 3, messages: 47, value: 30000,
    note: "One of two separate deals at Crains. Yewon's Heveblue campaign is its own card.",
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - Crains", "First Name Isabelle Last Name Lee Company Crains Email izi.lee@crains.co.kr Phone 82-10-62613142 Interests Brand Ambassadors", "2026-09-04T07:44:38Z", false],
      ["in", "izi.lee@crains.co.kr", "Re: Collegiate sampling activation for new Korean skincare brand", "Thanks to your support, the client meeting went very well. Below is the scope of work we are planning to move forward with.", "2026-09-18T02:40:41Z", false],
      ["in", "izi.lee@crains.co.kr", "Re: Collegiate sampling activation for new Korean skincare brand", "We are excited to move forward with the campaign! Since we updated the scope from two activations to one, we are expecting a reduced budget of $30000 total.", "2026-09-21T07:09:13Z", false],
      ["out", "shane@zmmevents.com", "Re: Collegiate sampling activation for new Korean skincare brand", "Here is the revised campaign: 1 activation at one selected campus, reduced from 2. UGC production: 10 videos.", "2026-09-21T15:16:55Z", false],
    ],
  },
  {
    key: "yewon.lee@crains.co.kr", name: "Crains — Heveblue", domain: "crains.co.kr",
    contact: "Yewon Lee", email: "yewon.lee@crains.co.kr",
    // Introduced by Isabelle rather than submitted through the form, so under
    // the intake rule this card only exists because someone added it by hand.
    source: "manual",
    submitted: "2026-09-21T07:14:16Z",
    interests: "Product sampling", budget: null,
    summary: "Heveblue, a Korean skincare brand, wants product sampling at New York and East Coast universities in October.",
    in: "2026-09-21T15:52:47Z", out: "2026-09-21T20:32:12Z",
    threads: 1, messages: 4, value: 2500,
    note: "Introduced by Isabelle on 21 Sep. A different client brand from her own campaign, so it gets its own card.",
    msgs: [
      ["in", "izi.lee@crains.co.kr", "New opportunity with Crains", "I'd like to introduce you to my colleague, Yewon cc'd here, who will be supporting one of the other Korean beauty brands at Crains.", "2026-09-21T07:14:16Z", false],
      ["in", "yewon.lee@crains.co.kr", "Re: New opportunity with Crains", "One of our clients, Heveblue, a Korean skincare brand, are interested in partnering with universities in New York and across the East Coast for product sampling on October.", "2026-09-21T15:52:47Z", false],
      ["out", "shane@zmmevents.com", "Re: New opportunity with Crains", "This is definitely within our wheelhouse. We could get you onto almost any major campus in the east coast, and we charge $2500 per organization on campus to facilitate product drops.", "2026-09-21T20:32:12Z", false],
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
  {
    key: "manual:triumph", name: "Triumph", domain: null,
    contact: null, email: null,
    source: "manual",
    submitted: "2026-09-18T20:00:00Z",
    interests: "Campus signup challenge", budget: "$20,000 package",
    summary: "Campus signup challenge — 100 ambassadors, 200 posts over 2 weeks, 5 Greek organisations, leaderboard.",
    in: null, out: null, manualStage: "awaiting_feedback",
    threads: 0, messages: 0, value: 20000,
    note: "Came in off-website. Proposal sent 18 Sep; prizes funded by Triumph on top of the package.",
    documents: [
      { name: "Campus Signup Challenge proposal", url: "/documents/triumph-campus-signup-challenge.pdf" },
    ],
    msgs: [],
  },
];

// ---------------------------------------------------------------------------

const brands = [];
const messages = [];
const stageEvents = [];

PIPELINE.forEach((row, index) => {
  const id = `seed-${String(index + 1).padStart(2, "0")}`;

  // A card entered by hand may have no email at all yet — Triumph came in
  // through a call — so its stage is stated rather than derived.
  const manual = row.source === "manual";
  const lastMessageAt = [row.in, row.out].filter(Boolean).sort().at(-1) ?? null;
  const lastDirection = lastMessageAt ? (lastMessageAt === row.out ? "outbound" : "inbound") : null;

  const stage = row.manualStage ?? deriveStage({ lastDirection, everRepliedByUs: row.out !== null });

  // What the board shows when no model has rewritten it.
  const fromFields = [row.interests, row.budget && `Budget: ${row.budget}`]
    .filter(Boolean)
    .join(" · ");

  brands.push({
    id,
    group_key: row.key,
    source: manual ? "manual" : "form",
    documents: (row.documents ?? []).map((document) => ({
      ...document,
      addedAt: row.submitted,
      addedBy: "shane@zmmevents.com",
    })),
    name: row.name,
    domain: row.domain ?? null,
    website: row.domain ? `https://${row.domain}` : null,
    primary_contact_name: row.contact,
    primary_contact_email: row.email,
    stage,
    stage_source: manual ? "manual" : "auto",
    auto_stage: manual ? null : stage,
    stage_changed_at: manual ? row.submitted : SCANNED_AT,
    stage_changed_by: manual ? "shane@zmmevents.com" : "hourly scan",
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
    source: manual ? "manual" : "auto",
    actor: manual ? "shane@zmmevents.com" : "hourly scan",
    note: manual ? "Added by hand — arrived off-website" : "Created from a website submission",
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


/**
 * Ambassador applications — the other half of the same form.
 *
 * Every row is a real notification from no-reply@zmmevents.com with the
 * subject "New ambassador application", pulled from the inbox and transcribed
 * field for field. `msg` is the Gmail message id, which is what stops a rescan
 * from creating the same student twice.
 *
 * Stages are not decorated. Everyone sits at "applied" — the stage the scan
 * actually assigns — except two, where Shane's own sent mail on the thread
 * says otherwise and a person therefore pinned it:
 *
 *   Briceida  — forwarded to the team as "new ambassador from organic to onboard"
 *   Rayahna   — forwarded as "please note down we will plan out onboarding soon"
 *
 * Zach's own launch-day submission is not here. He applied to his own
 * ambassador programme from his old Tulane address while testing the form; the
 * scan skips it at source, so this file and an hourly run agree.
 */
const AMBASSADORS = [
  {
    msg: "1a0c157bc0748a58", at: "2026-09-21T00:22:26Z",
    name: "Emillie Rosario", dob: "2006-03-21", phone: "9734206151",
    city: "Bloomfield", state: "NJ",
    school: "Kean University", email: "rosaremi@kean.edu",
    grad: "2028", major: "Marketing",
    ig: "emillierosario", tt: "emillierosariooo", igf: 1305, ttf: 1423,
    niche: "Fashion",
    why: "There are many different brands. I love such as garage, coach Kate Spade, but I wanna be a brand ambassador because I think it would be really good for me to get my foot in the door with marketing",
  },
  {
    msg: "1a0bc28ab35c1e72", at: "2026-09-20T00:12:56Z",
    name: "Isabella Felix", dob: "2005-10-27", phone: "13214641693",
    city: "Miami", state: "FL",
    school: "Florida International University", email: "ifeli017@fiu.edu",
    grad: "2027", major: "Communications in media",
    ig: "isabellafelixt", tt: "majesticgirl444", igf: 2338, ttf: 740,
    niche: "Lifestyle",
    why: "The brands I LOVE are Sol de Janerio, Valentino, POPPI, Saie, La Roche Posay, Good Molescules, Rhode, Purely Elizabeth. I would love to join because I genuinely enjoy discovering new products and sharing my experiences and recommendations with others.",
  },
  {
    msg: "1a0b6b0c091b25f6", at: "2026-09-18T22:43:50Z",
    name: "Abby Walsh", dob: "0010-10-02", phone: "7034772303",
    city: "Lansdowne", state: "VA",
    school: "Univeristy of Kentucky", email: "amwa359@uky.edu",
    grad: "2028", major: "Marketing & Management",
    ig: "abbymaewalsh", tt: "abbymaewalsh", igf: 1373, ttf: 324,
    niche: "Sports", why: null,
  },
  {
    msg: "1a0b6226f679c69d", at: "2026-09-18T20:08:24Z",
    name: "Rayahna Pittman", dob: "2007-10-18", phone: "3363652717",
    city: "High Point", state: "NC",
    school: "Guilford technical community college", email: "rpittman1@gtcc.edu",
    grad: "2028", major: "Nursing",
    ig: "Rayray.Mari", tt: "lil_rayrayy", igf: 803, ttf: 3037,
    niche: "Beauty",
    why: "I an a girl who want to come up in this world and be a content creator",
    stage: "reviewing",
    note: "Forwarded to the team: \"please note down we will plan out onboarding soon\".",
  },
  {
    msg: "1a0b44ceba800e28", at: "2026-09-18T11:35:33Z",
    name: "Markhiel Edwards", dob: "2008-07-02", phone: "94278935",
    city: "Brooklyn", state: "NY",
    school: "SUNY Purchase", email: "markhiel.edwards@purchase.edu",
    grad: "2030", major: "Computer science",
    ig: "Plainseraph", tt: "guywho_neverasked", igf: 147, ttf: 23,
    niche: null, why: "Money",
  },
  {
    msg: "1a0b0f5f4fb503a6", at: "2026-09-17T20:01:43Z",
    name: "Ruhani Dashmesh", dob: "2008-01-05", phone: "5615633194",
    city: "Ithaca", state: "NY",
    school: "Cornell University", email: "rd676@cornell.edu",
    grad: "2029", major: "Human Biology, Health and Society",
    ig: "ruuuhanii", tt: ".ruhani", igf: 2319, ttf: 1471,
    niche: "Lifestyle", why: null,
  },
  {
    msg: "1a0b0b93ff8977c1", at: "2026-09-17T18:55:24Z",
    name: "Jordan Poncher", dob: "2007-11-27", phone: "13034726390",
    city: "Elon", state: "NC",
    school: "Elon University", email: "jponcher@elon.edu",
    grad: "2030", major: "Strategic Communications",
    ig: null, tt: "journeywithjor", igf: null, ttf: 101,
    niche: "Lifestyle", why: null,
  },
  {
    msg: "1a0ad9c028b92fea", at: "2026-09-17T04:24:37Z",
    name: "Cael Anderson", dob: "2005-08-04", phone: "8178811431",
    city: "Lookout Mountain", state: "GA",
    school: "Covenant College", email: "cael.anderson@covenant.edu",
    grad: "2028", major: "Community Development",
    ig: "cael.and", tt: null, igf: 618, ttf: null,
    niche: "Lifestyle",
    why: "I love clothing, apparel, and food brand especially because they are so easy to promote in every day life. Because Covenant is a small school I feel very connected to a lot of people and I think I have a unique opportunity to connect a brand to my campus.",
  },
  {
    msg: "1a0ad957b0c98742", at: "2026-09-17T04:17:28Z",
    name: "Anika Patel", dob: "2008-05-26", phone: "248-378-9300",
    city: "Novi", state: "MI",
    school: "Indiana University Bloomington", email: "pateanik@iu.edu",
    grad: "2030", major: "Business Management",
    ig: "anikapatel.7", tt: "anikapatel10487", igf: 3532, ttf: 1913,
    niche: "Fashion",
    why: "I love glossier, rhode, and merit beauty! I also love clothing brands like parke, edikted, subdued, and free people! I would be a great campus rep because I have tons of experience with marketing and advertising as I have run socials for accounts with over 8k followers.",
  },
  {
    msg: "1a09279a8ea0e1a8", at: "2026-09-11T21:57:21Z",
    name: "Cadence Kogel", dob: "2007-02-22", phone: "6053506107",
    city: "New Orleans", state: "LA",
    school: "Tulane University", email: "ckogel@tulane.edu",
    grad: "2029", major: "Neuroscience and Public Health",
    ig: "ck__2025", tt: "cades_spam.acct", igf: 848, ttf: 215,
    niche: "Fashion",
    why: "I want to join because as a college student I believe that I can be a good role model in being your most authentic self. I believe that someones sense of style reveals a lot about who they are, or where they have come from.",
  },
  {
    msg: "1a064c985ea86c01", at: "2026-09-03T01:02:02Z",
    name: "Chloe Carratala", dob: "2006-12-05", phone: "3463009979",
    city: "Houston", state: "TX",
    school: "Houston Christian University", email: "ccarratalac@hc.edu",
    grad: "2029", major: "Information systems/Business administration",
    ig: "Chloee_.Cheyenne", tt: "_.whoisschloeee", igf: 694, ttf: 523,
    niche: "Lifestyle",
    why: "To gain professional exposure, networking opportunities, and structured guidance for my future career.",
  },
  {
    msg: "1a058c55ed07bfa7", at: "2026-08-31T17:01:54Z",
    name: "Briceida Cardoso-Murillo", dob: "2005-12-20", phone: "12486570188",
    city: "Detroit", state: "MI",
    school: "wayne state university", email: "hs4396@wayne.edu",
    grad: "2028", major: "criminal justice",
    ig: "bri.ceidaa", tt: "bri.ceida", igf: 184, ttf: 7195,
    niche: "Lifestyle",
    why: "I want to join because I love connecting with people and discovering brands that fit into my everyday lifestyle. As a college student, I would enjoy representing a brand I genuinely like, creating fun content, and introducing other students to products they may enjoy.",
    stage: "reviewing",
    note: "No campaigns at Wayne State yet — asked whether she can connect us to students at larger campuses nearby.",
  },
];

const ambassadors = AMBASSADORS.map((row, index) => {
  const pinned = Boolean(row.stage);
  return {
    id: `amb-${String(index + 1).padStart(2, "0")}`,
    source_message_id: row.msg,
    stage: row.stage ?? "applied",
    stage_source: pinned ? "manual" : "auto",
    stage_changed_at: row.at,
    stage_changed_by: pinned ? "shane@zmmevents.com" : null,

    full_name: row.name,
    school: row.school,
    school_email: row.email,
    phone: row.phone ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    grad_year: row.grad ?? null,
    major: row.major ?? null,
    dob: row.dob ?? null,

    instagram: row.ig,
    tiktok: row.tt,
    ig_followers: row.igf,
    tt_followers: row.ttf,
    niche: row.niche ?? null,
    why: row.why ?? null,

    utm_source: row.utm === undefined ? "chatgpt.com" : row.utm,
    landing_page: row.landing ?? "/become-an-ambassador",

    owner_email: null,
    notes: row.note ?? null,
    applied_at: row.at,
    archived: false,
    created_at: row.at,
    updated_at: row.at,
  };
});

const db = {
  scanned_at: SCANNED_AT,
  brands,
  ambassadors,
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
      ambassadors_created: ambassadors.length,
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
console.log(`${brands.length} brands, ${messages.length} messages, ${ambassadors.length} ambassadors`);
console.log(counts);
