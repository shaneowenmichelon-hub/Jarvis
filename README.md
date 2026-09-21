# Sponsor Command

Inbound sponsorship pipeline for ZMM Events. Reads the agency inbox once an
hour and keeps a shared board of every brand that has written in, so nobody has
to remember who is owed a reply.

Two tabs, one inbox behind both:

- **Pipeline** — brands that submitted the form at collegiateagency.com
- **Ambassadors** — students who applied to work campus

Both arrive from the same address, `no-reply@zmmevents.com`, and are told apart
by subject. They stay apart on purpose: a student applying to work is not a
company buying, and mixing them is what makes a sponsorship board useless.

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

## Ambassadors

The second tab is a list, not a board — recruiting is read top to bottom, not
dragged left to right. Each row carries school, grad year, major, both handles
with their follower counts, niche, and the applicant's own answer to why they
want in.

Four stages, and unlike the pipeline **none of them are automatic**:

| Stage | What it means |
|---|---|
| **Applied** | Came through the form. Nobody has looked yet. |
| **Reviewing** | Being assessed, or in conversation. |
| **Onboarded** | Accepted and set up, not yet on a campaign. |
| **Active** | Working a campaign right now. |

Nothing in an email proves a student was onboarded, so the scan never guesses:
it creates the row at **Applied** and a person moves it from there. The scan's
only job here is making sure every application shows up exactly once — rows are
keyed on the Gmail message id, so a rescan cannot duplicate anybody.

Filters across the top: stage (with live counts), school, and sort by newest or
by biggest reach. **Archive** on a row keeps the record but takes them off the
list — for a duplicate, a test submission, or someone who is not a fit.

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
it reads [`seed/pipeline.json`](seed/pipeline.json) instead of a database —
every submission that came through the collegiateagency.com form between
31 August and 21 September 2026, six of them, plus the conversation that
followed each, plus two leads that arrived off-website and were added by
hand. The board, the brand pages with their email timelines, moving
cards, assigning owners, deal values, notes and dismissals all work, and your
edits persist to `.local-data/db.json`.

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

**Where leads come from.** One front door: the form at collegiateagency.com.

A submission arrives in the inbox as a notification from
`no-reply@zmmevents.com` (`FORM_SENDER`) with "brand inquiry" in the subject
(`FORM_SUBJECT_MATCH`). The sender tells you nothing — the company, contact,
interests and budget are in the body, and the scan reads them from there.

**Nothing else creates a card.** A brand that emails you directly, a
newsletter, a vendor pitch — none of it reaches the board. That is the point:
the previous version guessed at whether an arbitrary inbound email was a lead,
and guessing is what put newsletters on a sponsorship pipeline.

Both halves of the subject check matter. Ambassador applications come from the
same no-reply address, and those are students applying to work campus, not
brands buying.

**After the submission, the scan follows the conversation.** Once a brand is on
the board, every later thread involving that company's address or domain
attaches to it — inbound or outbound, on To or Cc, from any colleague at the
same company. That is what moves a card from New Submission through to a live
campaign without anyone touching it.

**Leads that arrive off-website.** Not everything comes through the form — a
call, a DM, an introduction at an event. **Add a brand** in the header puts one
on the board by hand, and from that point the hourly scan tracks its email
exactly like any other card. Give it a contact address and it starts following
the conversation on the next run; without one the card stands alone until
someone adds an address.

Manual cards are marked on the board, and you can pin a proposal or deck to any
brand as a document.

**One company can be two deals.** An agency running campaigns for two different
clients gets a card each. Matching checks the exact contact address before the
company domain, so Isabelle's activation and Yewon's Heveblue campaign stay
separate even though both write from `crains.co.kr`. Where two brands share a
domain, an address the board does not recognise attaches to neither and the
scan log says so — filing a message on the wrong deal is worse than leaving it
unfiled.

**Forwarding a lead to your partner is not a reply.** A message only counts as
answering a brand when someone from that brand is actually on it. Forwarding an
inquiry to Zach for a second opinion leaves the card where it was, and shows on
the timeline as an internal note.

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
│   ├── page.tsx              # the pipeline board
│   ├── ambassadors/          # the ambassador list
│   ├── brands/[id]/          # brand detail and email timeline
│   ├── settings/             # Gmail connection, scan log, skip lists
│   └── api/
│       ├── cron/scan/        # the hourly endpoint (bearer token)
│       ├── scan/             # "Scan now" (signed-in)
│       ├── gmail/            # one-time OAuth connect
│       ├── brands/[id]/      # stage moves, owner, notes, dismiss
│       └── ambassadors/[id]/ # stage moves, owner, archive
├── components/
├── lib/
│   ├── stages.ts             # the four areas — pure, tested
│   ├── classify.ts           # what counts as a brand — pure, tested
│   ├── ambassadors.ts        # application parsing and stages — pure, tested
│   ├── gmail.ts              # Gmail REST, no googleapis dependency
│   └── scan.ts               # the hourly pass, start to finish
└── tests/
```

---

## Troubleshooting

**localhost refused to connect / `ERR_CONNECTION_REFUSED`.** Run this first —
it checks every common cause and tells you which one you have:

```bash
npm run doctor
```

It reports your Node version, which folder and branch you are on, whether the
dependencies and seed are there, and whether something else already owns port
3000. Paste its output to whoever is helping you.

The underlying rule: nothing is listening on that port unless `npm run dev` is
running in a terminal on your machine, and that terminal stays open. Ctrl+C or
closing the window stops the server and the page stops loading. There is no
hosted URL for local mode — it runs on your laptop or not at all.

The four things `doctor` is looking for:

1. **Wrong folder.** `ls` should show `package.json`. If not, `cd` into the
   Jarvis directory.
2. **Wrong branch.** The dashboard only exists on
   `claude/nifty-ride-et5emr`. On `main` there is no app to run.
3. **Different port.** If something else already has 3000, Next picks the next
   free one and prints it — `- Local: http://localhost:3001`. Use the port it
   prints, not the one in this README.
4. **`https://` instead of `http://`.** There is no certificate on a dev
   server, and some browsers silently upgrade the URL.

**`npm run dev` exits immediately.** `npm run dev` runs a preflight first; if
your Node is older than 18.18 it says so and stops, because Next.js 15 will not
run on it. `node --version` to check; Node 20 LTS is a safe choice.

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
