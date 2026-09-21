/**
 * Generates seed/pipeline.json — the data `npm run dev` boots with when no
 * Supabase project is configured.
 *
 * Every row here came from a real scan of shane@zmmevents.com covering
 * 31 Aug – 21 Sep 2026. Stages are NOT written by hand: this script runs the
 * same derivation the hourly scan uses, so the seed cannot drift from the
 * engine. Change a fact and the column follows.
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
 * The pipeline.
 *
 * `out` is the last message that actually reached the brand — an internal
 * forward to a teammate is not one, which is the distinction that decides
 * several of these columns.
 */
const PIPELINE = [
  {
    key: "makeamovela.org", name: "Make A Move LA", domain: "makeamovela.org",
    contact: "Jerimiah Payne", email: "jerimiah@makeamovela.org",
    summary: "19 live chess events nationally, blending competitive chess with music and student talent. Wants an agency partner.",
    first: "2026-09-21T14:08:00Z", in: "2026-09-21T14:08:00Z", out: null,
    threads: 1, messages: 2,
    note: "Forwarded to Zach 27 minutes after it landed. Nobody has written back to Jerimiah.",
    msgs: [
      ["in", "jerimiah@makeamovela.org", "Make A Move LA x Paddle Agency", "I'm Jerimiah Payne, founder of Make A Move LA. We've produced 19 live chess events across the US, combining competitive chess with music, student talent, entertainment and…", "2026-09-21T14:08:00Z", false],
      ["out", "shane@zmmevents.com", "Fwd: Make A Move LA x Paddle Agency", "Fade?", "2026-09-21T14:35:22Z", true],
    ],
  },
  {
    key: "joinplus1.com", name: "Plus 1", domain: "joinplus1.com",
    contact: "Katelin", email: "katelin@joinplus1.com",
    summary: "Sponsorship of the Plus 1 New York launch party on 21 November.",
    first: "2026-09-17T22:34:03Z", in: "2026-09-17T22:34:03Z", out: null,
    threads: 1, messages: 3,
    note: "You forwarded it to Zach and he replied to you. Katelin has heard nothing.",
    msgs: [
      ["in", "katelin@joinplus1.com", "Sponsoring the Plus 1 New York Launch Party — November 21", "Details and tiers attached for the November 21 launch.", "2026-09-17T22:34:03Z", false],
      ["out", "shane@zmmevents.com", "Fwd: Sponsoring the Plus 1 New York Launch Party", "", "2026-09-18T00:25:06Z", true],
      ["in", "zach@zmmevents.com", "Re: Sponsoring the Plus 1 New York Launch Party", "", "2026-09-18T00:26:11Z", true],
    ],
  },
  {
    key: "tickitin.com", name: "Tickitin", domain: "tickitin.com",
    contact: "Eli", email: "eli@tickitin.com",
    summary: "Intro to the Collegiate Agency, looking at ticketing for campus events.",
    first: "2026-09-18T04:19:00Z", in: "2026-09-18T04:19:00Z", out: null,
    threads: 1, messages: 2,
    note: "Your reply went to Zach and Ronan, not to Eli.",
    msgs: [
      ["in", "eli@tickitin.com", "Collegiate Agency / Tickitin", "Wanted to introduce Tickitin and see where there's overlap with your campus events.", "2026-09-18T04:19:00Z", false],
      ["out", "shane@zmmevents.com", "Fwd: Collegiate Agency / Tickitin", "", "2026-09-18T18:35:32Z", true],
    ],
  },
  {
    key: "synergy-community.com", name: "Synergy", domain: "synergy-community.com",
    contact: "Juan Cheret", email: "team@synergy-community.com",
    summary: "Sent the Night School ambassador performance sheet after your call. Expanding from event management into ambassador services.",
    first: "2026-09-17T20:52:00Z", in: "2026-09-18T21:50:10Z", out: null,
    threads: 3, messages: 3,
    note: "Three inbound messages, no email reply from our side. You met on the 18th.",
    msgs: [
      ["in", "team@synergy-community.com", "Ambassador Info Sheet + follower count", "Sheet attached ahead of tomorrow.", "2026-09-17T20:52:00Z", false],
      ["in", "team@synergy-community.com", "Night School Ambassador performance", "Here is the sheet I showed you on the call.", "2026-09-18T21:50:10Z", false],
    ],
  },
  {
    key: "heyhelloroam.com", name: "Roam", domain: "heyhelloroam.com",
    contact: "Kristina", email: "kristina@heyhelloroam.com",
    summary: "Second approach in three days — “quick idea for ZMM”, then “one last thing”.",
    first: "2026-09-18T13:02:11Z", in: "2026-09-18T13:02:11Z", out: null,
    threads: 1, messages: 1,
    note: "Also writing from helloroamnow.com — same person, two domains, so two cards.",
    msgs: [
      ["in", "kristina@heyhelloroam.com", "one last thing", "Following up on the idea I sent over.", "2026-09-18T13:02:11Z", false],
    ],
  },
  {
    key: "helloroamnow.com", name: "Roam (helloroamnow.com)", domain: "helloroamnow.com",
    contact: "Kristina Kalinauskaite", email: "kristina.kalinauskaite@helloroamnow.com",
    summary: "“Quick idea for ZMM”. Same sender as the heyhelloroam.com card.",
    first: "2026-09-15T18:49:00Z", in: "2026-09-15T18:49:00Z", out: null,
    threads: 1, messages: 1,
    note: "Merge with the other Roam card once you know which domain they actually use.",
    msgs: [
      ["in", "kristina.kalinauskaite@helloroamnow.com", "quick idea for ZMM", "Had an idea I think fits what you're building on campus.", "2026-09-15T18:49:00Z", false],
    ],
  },
  {
    key: "dasheminence.org", name: "das Eminence", domain: "dasheminence.org",
    contact: "Roger", email: "roger@dasheminence.org",
    summary: "“An application idea to discuss”. Could be a partner, could be a vendor pitch.",
    first: "2026-09-17T13:42:00Z", in: "2026-09-17T13:42:00Z", out: null,
    threads: 1, messages: 1, classification: "unverified",
    msgs: [
      ["in", "roger@dasheminence.org", "An application idea to discuss?", "Wanted to run an idea past you.", "2026-09-17T13:42:00Z", false],
    ],
  },
  {
    key: "bloomnu.com", name: "Bloom Nu", domain: "bloomnu.com",
    contact: "Lindsey", email: "lindsey@bloomnu.com",
    summary: "Warned she was off-site at NYFW and slow to respond. That was eleven days ago.",
    first: "2026-09-10T13:47:00Z", in: "2026-09-10T13:47:00Z", out: null,
    threads: 1, messages: 1,
    note: "Her message is a “Re:” — our original predates the three-week window, so the scan cannot see it.",
    msgs: [
      ["in", "lindsey@bloomnu.com", "off-site @ NYFW // slow to respond Re: Collegiate Agency", "At NYFW this week, slower than usual to reply.", "2026-09-10T13:47:00Z", false],
    ],
  },
  {
    key: "drinkhiyo.com", name: "Hiyo", domain: "drinkhiyo.com",
    contact: "Maddie Naylor", email: "maddie.naylor@drinkhiyo.com",
    summary: "Auto-reply said back on 8 September. That was two weeks ago and nobody has picked it up.",
    first: "2026-09-02T22:38:00Z", in: "2026-09-02T22:38:00Z", out: null,
    threads: 1, messages: 1,
    note: "Out-of-office reply to outreach that predates the window. Expired 13 days ago.",
    msgs: [
      ["in", "maddie.naylor@drinkhiyo.com", "Out of Office 8/28 - 9/8 Re: Partnership Opportunity", "I'm out of office until September 8.", "2026-09-02T22:38:00Z", false],
    ],
  },

  // ---- conversations where we have replied, and they sent last -----------
  {
    key: "crains.co.kr", name: "Crains — Heveblue", domain: "crains.co.kr",
    contact: "Yewon Lee", email: "yewon.lee@crains.co.kr",
    summary: "Korean skincare client wants product sampling at New York and East Coast universities in October.",
    first: "2026-09-04T07:43:21Z", in: "2026-09-21T15:52:47Z", out: "2026-09-21T15:16:55Z",
    threads: 4, messages: 52, value: 25000,
    msgs: [
      ["in", "izi.lee@crains.co.kr", "New brand inquiry - Crains", "Isabelle Lee, Crains. Interests: Brand Ambassadors.", "2026-09-04T07:43:21Z", false],
      ["out", "shane@zmmevents.com", "Re: Collegiate sampling activation for new Korean skincare brand", "Confirming the scope for October.", "2026-09-21T15:16:55Z", false],
      ["in", "yewon.lee@crains.co.kr", "Re: New opportunity with Crains", "One of our clients, Heveblue, a Korean skincare brand, are interested in partnering with universities in New York and across the East Coast for product sampling on October.", "2026-09-21T15:52:47Z", false],
    ],
  },
  {
    key: "acesfull.org", name: "Aces Full", domain: "acesfull.org",
    contact: "Jay", email: "jay@acesfull.org",
    summary: "College marketing across the Rolling Loud relationship.",
    first: "2026-09-01T21:30:00Z", in: "2026-09-21T16:44:00Z", out: "2026-09-02T15:21:59Z",
    threads: 3, messages: 9,
    msgs: [
      ["in", "jay@acesfull.org", "Rolling Loud: College mktng", "Updated invitation for the college marketing session.", "2026-09-01T21:30:00Z", false],
      ["in", "jay@acesfull.org", "ZMM Events: College Marketing", "Circling back on the college marketing piece.", "2026-09-21T16:44:00Z", false],
    ],
  },
  {
    key: "scalers.org", name: "Scalers — Alex Micol", domain: "scalers.org",
    contact: "Alex Micol", email: "alex@scalers.org",
    summary: "Sponsorship sales for a performance-marketing conference in Miami, May, South Beach Convention Center.",
    first: "2026-09-18T00:11:00Z", in: "2026-09-18T17:33:27Z", out: "2026-09-18T17:09:29Z",
    threads: 3, messages: 6,
    msgs: [
      ["out", "shane@zmmevents.com", "Re: Shane x Alex", "Alex pushed it back to 5pm tonight.", "2026-09-18T17:09:29Z", false],
      ["in", "alex@scalers.org", "Re: Shane x Alex", "Thanks - I have updated in Alex's diary and sent the new link.", "2026-09-18T17:33:27Z", false],
    ],
  },
  {
    key: "yachtweek", name: "Yacht Week", domain: null,
    contact: "Cushnie", email: "explorewithcushnie@gmail.com",
    summary: "Three unanswered messages since your last reply, including an attachment.",
    first: "2026-09-12T15:39:21Z", in: "2026-09-16T16:50:52Z", out: "2026-09-14T14:06:39Z",
    threads: 1, messages: 8,
    note: "Your last message on this thread went to Zach, not to them.",
    msgs: [
      ["in", "explorewithcushnie@gmail.com", "Yacht Week x Collegiate Agency Meeting", "Invitation for Tuesday.", "2026-09-12T15:39:21Z", false],
      ["out", "shane@zmmevents.com", "Re: New Opportunity - Yacht Week x Collegiate Agency", "", "2026-09-14T14:06:39Z", false],
      ["in", "explorewithcushnie@gmail.com", "Re: New Opportunity - Yacht Week x Collegiate Agency", "Following up with the deck.", "2026-09-16T16:50:52Z", false],
      ["out", "shane@zmmevents.com", "Fwd: Yacht Week", "", "2026-09-16T17:10:27Z", true],
    ],
  },
  {
    key: "yourbuddyworld.com", name: "AFEM — Buddy World", domain: "yourbuddyworld.com",
    contact: "Claire", email: "claire@yourbuddyworld.com",
    summary: "Intro thread off the back of the BUDDY relationship; ADE follow-up alongside it.",
    first: "2026-09-14T15:00:00Z", in: "2026-09-15T14:22:42Z", out: "2026-09-14T15:23:30Z",
    threads: 2, messages: 6,
    msgs: [
      ["in", "claire@yourbuddyworld.com", "ZMM <> AFEM Intro", "Connecting you with Finlay at AFEM.", "2026-09-14T15:00:00Z", false],
      ["out", "shane@zmmevents.com", "Re: ZMM <> AFEM Intro", "Thanks for the intro.", "2026-09-14T15:23:30Z", false],
      ["in", "finlay@afemorg.net", "Re: ZMM <> AFEM Intro", "Good to meet you both.", "2026-09-15T14:22:42Z", false],
    ],
  },
  {
    key: "dmv-rfp", name: "DMV Campaign RFP", domain: null,
    contact: "Deborah Onyibe", email: "deborah.onyibe@gmail.com",
    summary: "RFP for a 2,500-student DMV event marketing campaign in October. You sent materials, then it went quiet.",
    first: "2026-09-09T15:38:09Z", in: "2026-09-15T02:33:33Z", out: "2026-09-10T20:53:39Z",
    threads: 1, messages: 15,
    note: "Live RFP with an October deadline.",
    msgs: [
      ["in", "deborah.onyibe@gmail.com", "RFP: 2,500-Student DMV Event Marketing Campaign | October", "Sharing the RFP for an October campaign across the DMV.", "2026-09-09T15:38:09Z", false],
      ["out", "shane@zmmevents.com", "Re: RFP: 2,500-Student DMV Event Marketing Campaign", "Sending our capabilities and pricing.", "2026-09-10T20:53:39Z", false],
      ["in", "deborah.onyibe@gmail.com", "Re: RFP: 2,500-Student DMV Event Marketing Campaign", "Thanks — reviewing internally.", "2026-09-15T02:33:33Z", false],
    ],
  },
  {
    key: "spkeasy.com", name: "Speakeasy", domain: "spkeasy.com",
    contact: "Alex Schuetz", email: "alex.schuetz@spkeasy.com",
    summary: "Proposal thread now running through AJ. The last four messages are theirs.",
    first: "2026-08-19T00:55:25Z", in: "2026-09-14T18:24:08Z", out: "2026-09-01T22:40:51Z",
    threads: 1, messages: 10,
    msgs: [
      ["in", "alex.schuetz@spkeasy.com", "Speakeasy - ZMM Events Proposal", "Proposal for review.", "2026-08-19T00:55:25Z", false],
      ["in", "alex.schuetz@spkeasy.com", "Re: Speakeasy - ZMM Events Proposal", "Any movement on this?", "2026-09-14T18:24:08Z", false],
    ],
  },
  {
    key: "jampack.com", name: "JamPack — JusCollege", domain: "jampack.com",
    contact: "Randy", email: "randy@jampack.com",
    summary: "Long-running thread since July. Randy's last note has sat ten days.",
    first: "2026-07-13T13:37:00Z", in: "2026-09-11T19:39:21Z", out: "2026-09-01T16:37:45Z",
    threads: 1, messages: 20,
    msgs: [
      ["out", "shane@zmmevents.com", "Re: ZMM Events x JusCollege & JamPack", "Following up on the scope.", "2026-09-01T16:37:45Z", false],
      ["in", "randy@jampack.com", "Re: ZMM Events x JusCollege & JamPack", "Checking in on next steps.", "2026-09-11T19:39:21Z", false],
    ],
  },
  {
    key: "outliertalent.com", name: "Outlier Talent", domain: "outliertalent.com",
    contact: "Aaron", email: "aaron@outliertalent.com",
    summary: "Four messages in, then nothing from our side since 2 September.",
    first: "2026-08-26T21:42:56Z", in: "2026-09-02T20:10:58Z", out: "2026-09-02T19:59:35Z",
    threads: 1, messages: 4,
    note: "Oldest unanswered message on the board.",
    msgs: [
      ["in", "aaron@outliertalent.com", "Outlier Talent", "Introducing Outlier Talent.", "2026-08-26T21:42:56Z", false],
      ["out", "shane@zmmevents.com", "Re: Outlier Talent", "Thanks for reaching out.", "2026-09-02T19:59:35Z", false],
      ["in", "aaron@outliertalent.com", "Re: Outlier Talent", "Here's more on what we do.", "2026-09-02T20:10:58Z", false],
    ],
  },

  // ---- we sent last ------------------------------------------------------
  {
    key: "itsfratflix.com", name: "FratFlix", domain: "itsfratflix.com",
    contact: "CJ Coppola", email: "cj@itsfratflix.com",
    summary: "Busiest thread in the pipeline — 35 messages since 31 August, looped in with Anheuser-Busch.",
    first: "2026-08-31T16:52:32Z", in: "2026-09-21T19:38:33Z", out: "2026-09-21T19:44:36Z",
    threads: 2, messages: 37,
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - FratFlix", "First Name CJ Last Name Coppola Company FratFlix Email cj@itsfratflix.com Budget Not sure yet", "2026-08-31T16:52:32Z", false],
      ["in", "cj@itsfratflix.com", "Re: Collegiate Agency x FratFlix", "Latest round of notes.", "2026-09-21T19:38:33Z", false],
      ["out", "shane@zmmevents.com", "Re: Collegiate Agency x FratFlix", "Got it — see below.", "2026-09-21T19:44:36Z", false],
    ],
  },
  {
    key: "dyeislife.com", name: "Dyeislife", domain: "dyeislife.com",
    contact: "Rico Brown", email: "rico@dyeislife.com",
    summary: "Assistant Director of Partnerships introduced himself. You proposed Wednesday 2pm ET and CC'd Zach.",
    first: "2026-09-21T19:28:52Z", in: "2026-09-21T19:28:52Z", out: "2026-09-21T19:43:05Z",
    threads: 1, messages: 3,
    msgs: [
      ["in", "rico@dyeislife.com", "ZMM Events X Dyeislife - Future Partnerships", "My name is Rico Brown, and I'm the Assistant Director of Partnerships with Dyeislife. I wanted to reach out and introduce myself, as I know ZMM Events and…", "2026-09-21T19:28:52Z", false],
      ["out", "shane@zmmevents.com", "Fwd: ZMM Events X Dyeislife", "", "2026-09-21T19:37:17Z", true],
      ["out", "shane@zmmevents.com", "Re: ZMM Events X Dyeislife - Future Partnerships", "Thanks for reaching out. For sure a ton of overlap here, so lets hop on a call. Are you free Wednesday at 2pm EST? CCing my partner Zach here.", "2026-09-21T19:43:05Z", false],
    ],
  },
  {
    key: "bustle.com", name: "Elite Daily — Bustle", domain: "bustle.com",
    contact: "Megan Kelly", email: "megan.kelly@bustle.com",
    summary: "February campus dating-show event. Eleven messages, moving quickly.",
    first: "2026-09-17T17:28:51Z", in: "2026-09-21T18:21:22Z", out: "2026-09-21T18:39:18Z",
    threads: 2, messages: 12,
    msgs: [
      ["in", "megan.kelly@bustle.com", "Feb College Campus Event", "Elite Daily is looking at a campus dating show for February.", "2026-09-17T17:28:51Z", false],
      ["out", "shane@zmmevents.com", "Re: Feb College Campus Event", "Looping Zach in.", "2026-09-21T18:39:18Z", false],
    ],
  },
  {
    key: "orbitstudio.us", name: "FlatFlow", domain: "orbitstudio.us",
    contact: "Vraj Patel", email: "vrajpatel@orbitstudio.us",
    summary: "Website form: brand ambassadors, budget under 10k. Zach called it worth a call.",
    first: "2026-09-21T15:33:23Z", in: "2026-09-21T15:33:23Z", out: "2026-09-21T18:50:59Z",
    threads: 2, messages: 4,
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - FlatFlow", "First Name Vraj Last Name Patel Company FlatFlow Email vrajpatel@orbitstudio.us Phone 8479897408 Interests Brand Ambassadors Budget Under 10k", "2026-09-21T15:33:23Z", false],
      ["out", "shane@zmmevents.com", "FlatFlow x Collegiate Agency", "Thanks for reaching out via our website. My names Shane Michelon, and I have my partner Zach CCed here. Happy to hop on a call later this week.", "2026-09-21T18:50:59Z", false],
    ],
  },
  {
    key: "uhomes.com", name: "uhomes", domain: "uhomes.com",
    contact: "Zimo Liu", email: "zimo.liu@uhomes.com",
    summary: "You scoped 5–10 ambassadors per school plus one on-campus event, at $2,000–$3,000 per school.",
    first: "2026-09-15T17:57:33Z", in: "2026-09-21T17:11:46Z", out: "2026-09-21T17:19:49Z",
    threads: 3, messages: 14, value: 3000,
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - uhomes.com", "First Name Zimo Last Name Liu Company uhomes.com Email zimo.liu@uhomes.com Budget Not sure yet", "2026-09-15T17:57:33Z", false],
      ["in", "zimo.liu@uhomes.com", "Re: Uhomes x Collegiate Agency", "Confirming the budget range on our side.", "2026-09-21T17:11:46Z", false],
      ["out", "shane@zmmevents.com", "Re: Uhomes x Collegiate Agency", "With this budget in mind ($2000-$3000 per school), we are thinking of a mix of 5-10 ambassadors per school and one on-campus event at a few schools where your brand can…", "2026-09-21T17:19:49Z", false],
    ],
  },
  {
    key: "catnips.ai", name: "Catnip AI", domain: "catnips.ai",
    contact: "Zian", email: "zian@catnips.ai",
    summary: "Campus marketing partnership. Proposal went out after Zach drafted it.",
    first: "2026-09-09T06:33:03Z", in: "2026-09-17T04:00:52Z", out: "2026-09-21T14:36:36Z",
    threads: 1, messages: 11,
    msgs: [
      ["in", "zian@catnips.ai", "Catnip AI —— Campus Marketing Partnership Inquiry", "Reaching out about campus marketing.", "2026-09-09T06:33:03Z", false],
      ["out", "shane@zmmevents.com", "Re: Catnip AI —— Campus Marketing Partnership Inquiry", "Proposal attached.", "2026-09-21T14:36:36Z", false],
    ],
  },
  {
    key: "goldencoastdistroinc.com", name: "Geek Bar", domain: "goldencoastdistroinc.com",
    contact: "Jeremy Jiang", email: "jeremy.jiang@goldencoastdistroinc.com",
    summary: "College tour partnership running since mid-August, Joe Slivka brokering.",
    first: "2026-08-13T18:27:02Z", in: "2026-09-16T19:03:21Z", out: "2026-09-21T14:34:45Z",
    threads: 1, messages: 55,
    msgs: [
      ["in", "joeslivka@gmail.com", "Geek Bar x College tour", "Introducing Jeremy at Golden Coast.", "2026-08-13T18:27:02Z", false],
      ["out", "shane@zmmevents.com", "Re: Geek Bar x College tour", "Next steps below.", "2026-09-21T14:34:45Z", false],
    ],
  },
  {
    key: "culnanecreative.com", name: "Culnane Creative", domain: "culnanecreative.com",
    contact: "Chris Culnane", email: "chris@culnanecreative.com",
    summary: "Met on 18 September. Deep dive on future business held for Wednesday the 23rd.",
    first: "2026-09-18T17:00:00Z", in: "2026-09-21T18:45:24Z", out: "2026-09-21T18:50:00Z",
    threads: 2, messages: 3,
    note: "Meeting booked — no proposal out yet.",
    msgs: [
      ["in", "chris@culnanecreative.com", "Invitation: (Hold) ZMM x Culnane: Future Business/Deep Dive", "Wednesday Sep 23, 4:30pm EDT.", "2026-09-21T18:45:24Z", false],
      ["out", "shane@zmmevents.com", "Accepted: ZMM x Culnane", "", "2026-09-21T18:50:00Z", false],
    ],
  },
  {
    key: "flite.city", name: "flite", domain: "flite.city",
    contact: "Spencer Humes", email: "spencer@flite.city",
    summary: "Second meeting of the month, Tuesday the 22nd at 10am ET, with Gabe and AJ on it.",
    first: "2026-09-12T14:11:00Z", in: "2026-09-21T16:31:51Z", out: "2026-09-21T16:40:00Z",
    threads: 2, messages: 4,
    note: "Meeting booked — no proposal out yet.",
    msgs: [
      ["in", "spencer@flite.city", "Invitation: flite // ZZM", "Monday Sep 14, 10am EDT.", "2026-09-12T14:11:00Z", false],
      ["in", "spencer@flite.city", "Invitation: ZMM // flite", "Tuesday Sep 22, 10am EDT.", "2026-09-21T16:31:51Z", false],
      ["out", "shane@zmmevents.com", "Accepted: ZMM // flite", "", "2026-09-21T16:40:00Z", false],
    ],
  },
  {
    key: "anheuser-busch.com", name: "Beatbox — Anheuser-Busch", domain: "anheuser-busch.com",
    contact: "Jessica Gamblin", email: "jessica.gamblin@youradv.com",
    summary: "Campus events for Beatbox through the agency. Logo and asset thread still open.",
    first: "2026-09-17T18:06:00Z", in: "2026-09-17T18:30:25Z", out: "2026-09-19T00:54:00Z",
    threads: 3, messages: 12,
    msgs: [
      ["in", "jessica.gamblin@youradv.com", "Re: Beatbox: Campus Events", "Confirming the campus list.", "2026-09-17T18:06:00Z", false],
      ["out", "shane@zmmevents.com", "Re: BeatBox Logo", "Assets attached.", "2026-09-19T00:54:00Z", false],
    ],
  },
  {
    key: "thesaltyapp.com", name: "Salty", domain: "thesaltyapp.com",
    contact: "Svetoslava Angelova", email: "s.angelova@thesaltyapp.com",
    summary: "Came in through the website form on 14 September asking about brand ambassadors.",
    first: "2026-09-14T22:14:12Z", in: "2026-09-14T22:14:12Z", out: "2026-09-18T18:36:25Z",
    threads: 2, messages: 3,
    note: "Two emails sent. They have never replied to either.",
    msgs: [
      ["in", "no-reply@zmmevents.com", "New brand inquiry - Salty", "First Name Svetoslava Last Name Angelova Company Salty Email s.angelova@thesaltyapp.com Interests Brand Ambassadors Budget Under 10k", "2026-09-14T22:14:12Z", false],
      ["out", "shane@zmmevents.com", "Collegiate Agency x The Salty App", "Following up on your inquiry.", "2026-09-14T23:12:05Z", false],
      ["out", "shane@zmmevents.com", "Re: Collegiate Agency x The Salty App", "Bumping this one.", "2026-09-18T18:36:25Z", false],
    ],
  },
  {
    key: "vallaba.com", name: "Vallaba", domain: "vallaba.com",
    contact: "Vallaba", email: "contact@vallaba.com",
    summary: "Campaign collaboration inquiry from 31 August. You sent materials twice.",
    first: "2026-08-31T16:11:41Z", in: "2026-09-11T02:13:26Z", out: "2026-09-12T17:00:11Z",
    threads: 2, messages: 14,
    msgs: [
      ["in", "vallaballc@gmail.com", "Campaign Collaboration Inquiry — Collegiate Agency / Vallaba", "Interested in a campaign collaboration.", "2026-08-31T16:11:41Z", false],
      ["out", "shane@zmmevents.com", "Re: Campaign Collaboration Inquiry", "Sending the one-pager.", "2026-09-12T17:00:11Z", false],
    ],
  },
  {
    key: "dice.fm", name: "Dice", domain: "dice.fm",
    contact: "Ubi Hernandez", email: "ubi.hernandez@dice.fm",
    summary: "Zach opened it in August; you replied 9 September and it has been quiet since.",
    first: "2026-08-14T18:29:24Z", in: "2026-09-09T15:59:32Z", out: "2026-09-09T17:29:07Z",
    threads: 2, messages: 12,
    msgs: [
      ["in", "ubi.hernandez@dice.fm", "Dice x ZMM", "Happy to explore this.", "2026-08-15T04:08:48Z", false],
      ["out", "shane@zmmevents.com", "Re: Dice x ZMM", "Here's what we'd propose.", "2026-09-09T17:29:07Z", false],
    ],
  },
  {
    key: "howard-senate", name: "Howard University Senate", domain: null,
    contact: "The Senate Game", email: "thesenategame@gmail.com",
    summary: "Freshman senate campaign wanting campus brand activations.",
    first: "2026-09-07T20:19:05Z", in: "2026-09-07T20:19:05Z", out: "2026-09-08T20:01:00Z",
    threads: 2, messages: 5,
    msgs: [
      ["in", "thesenategame@gmail.com", "Howard University Senate Campaign x Collegiate Agency", "Looking for brand activations for the freshman senate campaign.", "2026-09-07T20:19:05Z", false],
      ["out", "shane@zmmevents.com", "Howard University Campus Brand Activations — Freshman Senate", "Here's what we can put together.", "2026-09-08T20:01:00Z", false],
    ],
  },
  {
    key: "machinepulse.ai", name: "Karpo — MachinePulse", domain: "machinepulse.ai",
    contact: "Stefanie", email: "stefanie@machinepulse.ai",
    summary: "NYC campus events and ambassador partnership. Two threads, both cold.",
    first: "2026-08-28T00:00:00Z", in: "2026-09-05T04:04:56Z", out: "2026-09-05T18:00:57Z",
    threads: 2, messages: 8,
    note: "Going cold.",
    msgs: [
      ["in", "stefanie@machinepulse.ai", "NYC campus events and ambassador partnership — Karpo", "Karpo is looking at NYC campuses this autumn.", "2026-09-04T10:53:41Z", false],
      ["out", "shane@zmmevents.com", "Re: NYC campus events and ambassador partnership — Karpo", "Availability and pricing below.", "2026-09-05T18:00:57Z", false],
    ],
  },
  {
    key: "luxdrop.com", name: "LuxDrop", domain: "luxdrop.com",
    contact: "Dez", email: "dez@luxdrop.com",
    summary: "Opened 3 September, four messages, nothing since the 4th.",
    first: "2026-09-03T19:37:31Z", in: "2026-09-04T01:31:26Z", out: "2026-09-04T02:03:30Z",
    threads: 1, messages: 4,
    note: "Going cold.",
    msgs: [
      ["out", "shane@zmmevents.com", "ZMM x LuxDrop", "Introducing the collegiate offering.", "2026-09-03T19:37:31Z", false],
      ["in", "dez@luxdrop.com", "Re: ZMM x LuxDrop", "Interested — tell me more.", "2026-09-04T01:31:26Z", false],
      ["out", "shane@zmmevents.com", "Re: ZMM x LuxDrop", "Full breakdown attached.", "2026-09-04T02:03:30Z", false],
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

  const stage = deriveStage({
    lastDirection,
    everRepliedByUs: row.out !== null,
  });

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
    first_contact_at: row.first,
    last_message_at: lastMessageAt,
    last_inbound_at: row.in ?? null,
    last_outbound_at: row.out ?? null,
    last_direction: lastDirection,
    awaiting_our_reply: lastDirection === "inbound",
    thread_count: row.threads,
    message_count: row.messages,
    classification: row.classification ?? "brand",
    confidence: row.classification === "unverified" ? 0.55 : 0.92,
    summary: row.summary,
    deal_value: row.value ?? null,
    event_tag: null,
    notes: row.note ?? null,
    blocked: false,
    archived: false,
    created_at: row.first,
    updated_at: SCANNED_AT,
  });

  stageEvents.push({
    id: index + 1,
    brand_id: id,
    from_stage: null,
    to_stage: stage,
    source: "auto",
    actor: "hourly scan",
    note: "Created by the inbox scan",
    created_at: SCANNED_AT,
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
      threads_seen: 402,
      messages_seen: 1187,
      brands_created: brands.length,
      brands_updated: 0,
      stages_changed: brands.length,
      skipped: 229,
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
  ignored_senders: [
    { pattern: "otter.ai", reason: "Meeting-notes notifications", added_by: "seed" },
    { pattern: "livenation.com", reason: "Touring operations, not sponsorship", added_by: "seed" },
    { pattern: "robinhood.com", reason: "Personal finance", added_by: "seed" },
    { pattern: "winible.com", reason: "Promotions", added_by: "seed" },
  ],
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
