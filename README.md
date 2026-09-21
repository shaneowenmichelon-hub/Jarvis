# Sponsor Command

Inbound sponsorship pipeline for ZMM Events. Reads the agency inbox once an
hour and keeps a shared board of every brand that has written in, so nobody has
to remember who is owed a reply.

Built for Shane Michelon and the ZMM team.

---

## The four areas

A brand sits in exactly one of these. Three of them are worked out from the
email itself — the scan asks one question: **who sent the last message?**

| Area | What it means | How it gets there |
|---|---|---|
| **New Submission** | They reached out. Nobody here has replied yet, ever. | Automatic — inbound mail, no reply from us in the whole history |
| **Needs Reply** | Live conversation, they sent last. You owe them one. | Automatic — inbound mail on a thread we have already joined |
| **Awaiting Feedback** | Proposal is out. Waiting on their call. | Automatic — we sent the last message |
| **Active Campaign** | Signed and running. | **By hand.** No email pattern proves a campaign is live, so a person moves it here |

### Moving a card by hand pins it

The moment someone changes a card's stage, the hourly scan stops moving that
card. It keeps reading the mail, and when the inbox disagrees it shows a
suggestion chip on the card — *"Inbox says: Needs Reply"* — with one button to
accept. It never quietly undoes a teammate's decision at the top of the hour.

One exception worth knowing: a brand in **Active Campaign** that has an
unanswered email gets a red *"They are waiting on your reply"* badge rather
than being dragged backwards out of the campaign. It is still a running
campaign; you just owe them a message.

---

## Run it locally right now

No accounts, no keys, nothing to sign up for:

```bash
git clone https://github.com/shaneowenmichelon-hub/Jarvis.git
cd Jarvis
git checkout claude/nifty-ride-et5emr
npm install
npm run dev
```

Open **http://localhost:3000**.

With no Supabase configured the app boots in **local mode**: sign-in is off and
it reads [`seed/pipeline.json`](seed/pipeline.json) instead of a database — 34
brands from a real scan of the ZMM inbox covering 31 August to 21 September
2026. The board, the brand pages with their email timelines, moving cards,
assigning owners, deal values, notes and dismissals all work, and your edits
persist to `.local-data/db.json`.

What local mode cannot do is read live mail — there is no inbox connected, so
there is no "Scan now". For that you need the setup below.

```bash
rm -rf .local-data     # throw away your edits, back to the seeded pipeline
node scripts/build-seed.mjs   # rebuild the seed itself
```

The seed's stages are not typed in by hand: `build-seed.mjs` runs the same
derivation the hourly scan uses, so the seeded board cannot drift from the
engine.

---

## Setup

About 30 minutes, once. You need a Google account with admin rights on the
inbox, a Supabase account, and a Vercel account.

### 1. Supabase — the shared database

1. Create a project at [supabase.com](https://supabase.com). Any region; free
   tier is plenty.
2. Open **SQL Editor → New query**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. It creates the
   tables, the four-stage type, and the do-not-contact seed.
3. Go to **Project Settings → API** and copy three values for later:
   the **Project URL**, the **anon public** key, and the **service_role** key.

> The `service_role` key bypasses all database security. It belongs only in
> Vercel's environment variables — never in the browser, never in this repo.

### 2. Google Cloud — one OAuth client for both jobs

Sign-in and Gmail reading share a single OAuth client.

1. At [console.cloud.google.com](https://console.cloud.google.com), create a
   project (or reuse one).
2. **APIs & Services → Library**, search **Gmail API**, click **Enable**.
3. **APIs & Services → OAuth consent screen**. Choose **Internal** if
   zmmevents.com is a Google Workspace domain — this avoids Google's app
   verification review entirely. Otherwise choose **External** and add each
   teammate as a test user.
4. Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
5. **Credentials → Create credentials → OAuth client ID → Web application**.

   Authorised redirect URIs — add all of these:

   ```
   https://<your-project>.supabase.co/auth/v1/callback
   https://<your-app>.vercel.app/api/gmail/callback
   http://localhost:3000/api/gmail/callback
   ```

6. Copy the **Client ID** and **Client secret**.

### 3. Supabase — turn on Google sign-in

In Supabase, **Authentication → Providers → Google**: enable it and paste the
same Client ID and secret from step 2.

### 4. Vercel — deploy

1. Import this repository at [vercel.com/new](https://vercel.com/new). It is a
   standard Next.js app; the defaults are correct.
2. Add the environment variables from
   [`.env.example`](.env.example). The ones that must be set:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
   | `GOOGLE_CLIENT_ID` | from step 2 |
   | `GOOGLE_CLIENT_SECRET` | from step 2 |
   | `ALLOWED_EMAILS` | every teammate's address, comma-separated |
   | `CRON_SECRET` | `openssl rand -hex 32` |

3. Deploy, then open the URL and sign in with Google. Only addresses in
   `ALLOWED_EMAILS` (or on `ALLOWED_DOMAIN`) get past the door.

### 5. Connect the inbox and run the first scan

Open **Settings → Connect Gmail** and approve the consent screen. Google will
say the app wants to *read* your mail — that is the only scope requested; it
cannot send, label, or delete anything.

Then press **Scan now**. The first run reaches back six months, so give it a
few minutes. After that each hourly run only reads what is new.

### 6. Make it actually run hourly

**Vercel's Hobby plan only allows one cron run per day.** Two ways to get to
sixty minutes:

- **Vercel Pro** (~$20/month) — [`vercel.json`](vercel.json) already schedules
  `/api/cron/scan` hourly. Nothing else to do. Also add `CRON_SECRET` to the
  project; Vercel sends it automatically.
- **GitHub Actions, free** — [`.github/workflows/scan.yml`](.github/workflows/scan.yml)
  calls the same endpoint on the same schedule. Add two repository secrets:
  `DASHBOARD_URL` (your Vercel URL) and `CRON_SECRET` (the same value as in
  Vercel). If you go this route, delete `vercel.json`'s `crons` block so the
  work is not queued twice.

Either way, the dashboard header shows when the last scan ran and turns amber
if it has been more than three hours — a scheduler that silently stopped is the
failure mode worth catching.

---

## Using it day to day

**The board** shows the four columns, longest-waiting card at the top of each,
because that is the one about to be forgotten. Four tiles above it answer the
only question that matters on a busy day: how many brands are waiting on us.

**Card colours** say whose move it is — orange for ours, blue for theirs, green
for running — not which column you are looking at. The column headings carry
that. The day count beside each card is written out in words as well as
coloured, so nothing depends on telling two shades apart.

**Clicking a brand** opens its full email history, both directions, plus who
moved it between stages and when. Owner, deal value, event tag, and notes are
filled in there.

**Where leads come from.** Two routes, both automatic:

- **The website form.** Inquiries from zmm.events arrive from the site's own
  no-reply address, so the sender tells you nothing — the brand, contact, and
  budget are in the body, and the scan reads them from there. Any mail from a
  domain you own whose subject contains `FORM_SUBJECT_MATCH` (default
  "brand inquiry") is treated this way.
- **Brands emailing you directly.** Anything inbound that survives screening.

A brand that came in through the form and was then emailed — with no reply yet —
stays on the board rather than disappearing, because the outbound thread is
matched back to the brand the form created.

**Forwarding a lead to your partner is not a reply.** A message only counts as
answering a brand when someone from that brand is actually on it. Forwarding an
inquiry to Zach for a second opinion leaves the card exactly where it was, and
shows on the timeline as an internal note.

**Triaging noise.** The scan is deliberately cautious: it drops obvious
newsletters, no-reply robots, promotions, and anything Google filed as bulk,
then puts the rest on the board. A card that arrives unconfirmed shows
**It's a brand / Not a brand**. Pressing *Not a brand* archives it and adds the
sender to a skip list, so it never comes back. Those are reversible from
**Settings → Dismissed senders**.

**Do-not-contact.** Constellation Brands is seeded into `blocked_entities`.
Mail from a blocked entity is recorded for the record but kept off the board
entirely and cannot be restored from the card. Add more in Supabase.

---

## What it deliberately does not do

- **It does not send mail.** Read-only scope, on purpose. The agency rule about
  CC'ing zach@zmmevents.com on outbound lives in the team's own process, not
  here.
- **It does not store message bodies.** Only subjects and Gmail's own snippet
  are saved. Bodies are read in memory during classification and dropped.
- **It does not create brands from outbound-only threads.** Intake is inbound;
  a brand you cold-emailed that never replied is outreach, not a submission.
- **It does not guess Active Campaign.** That is a person's call.

---

## Development

```bash
npm install
cp .env.example .env.local   # fill it in
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build, including a full typecheck |
| `npm run typecheck` | Types only |
| `npm test` | Unit tests for the stage machine, the classifier, and email parsing |

The logic that decides where a card belongs lives in
[`src/lib/stages.ts`](src/lib/stages.ts) and is written as pure functions with
no database or network, so it is covered by tests rather than by hope. The
screening rules that decide what counts as a brand are in
[`src/lib/classify.ts`](src/lib/classify.ts), also pure and tested.

### Layout

```
src/
├── app/
│   ├── page.tsx              # the board
│   ├── brands/[id]/          # brand detail and email timeline
│   ├── settings/             # Gmail connection, scan log, skip lists
│   └── api/
│       ├── cron/scan/        # the hourly endpoint (bearer token)
│       ├── scan/             # "Scan now" (signed-in)
│       ├── gmail/            # one-time OAuth connect
│       └── brands/[id]/      # stage moves, owner, notes, dismiss
├── components/
├── lib/
│   ├── stages.ts             # the four areas — pure, tested
│   ├── classify.ts           # what counts as a brand — pure, tested
│   ├── gmail.ts              # Gmail REST, no googleapis dependency
│   └── scan.ts               # the hourly pass, start to finish
└── tests/
```

---

## Troubleshooting

**The board is empty after connecting Gmail.** Press *Scan now* — the first run
is not automatic. If it finishes with zero brands, check
**Settings → Recent scans**: a high *skipped* count means the screening rules
are rejecting everything, usually because the inbox mostly contains mail Google
filed as promotions.

**"Gmail refresh token is no longer valid."** Google revokes tokens on password
changes, and after six months of disuse. Reconnect from Settings.

**Google did not issue a refresh token on reconnect.** Google only issues one
on first consent. Remove the app at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions),
then connect again.

**A teammate gets "not on the team list."** Add their address to
`ALLOWED_EMAILS` in Vercel and redeploy — environment changes need a new
deployment to take effect.

**A brand's stage keeps snapping back.** It is not pinned. Move it by hand once
and it stays put; the pin icon on the card confirms it.

**The scan log shows a run stuck on "running".** Runs take a lock for 15
minutes to prevent overlap. After that the next run proceeds regardless.
