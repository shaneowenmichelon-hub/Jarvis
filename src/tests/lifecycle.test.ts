/**
 * The whole point of the thing, tested end to end.
 *
 * A brand submits the form, gets a reply, replies back, gets forwarded
 * internally, and finally signs. At each step this runs the same functions the
 * hourly scan runs — screening, fact derivation, the stage machine — and
 * checks the card is where it should be.
 *
 * Every other test file covers one decision in isolation. This one covers the
 * sequence, which is where the bugs that actually reached the board came from.
 */

import { describe, expect, it } from "vitest";

import { screenThread, type ScreenContext } from "@/lib/classify";
import { deriveAutoStage, deriveBrandFacts, resolveStage, type FactMessage } from "@/lib/stages";
import type { ScannedMessage, ScannedThread, Stage, StageSource } from "@/lib/types";

const OWN = ["shane@zmmevents.com", "zach@zmmevents.com", "ronan@zmmevents.com"];

function context(known: string[] = []): ScreenContext {
  return {
    ownAddresses: new Set(OWN),
    ownDomains: new Set(["zmmevents.com"]),
    formSenders: new Set(["no-reply@zmmevents.com"]),
    formSubjectMatch: "brand inquiry",
    selfSubmitters: new Set(["shaneowenmichelon@yahoo.com"]),
    knownByEmail: new Map(known.filter((k) => k.includes("@")).map((k) => [k, k])),
    knownByDomain: new Map(known.filter((k) => !k.includes("@")).map((k) => [k, k])),
    blocked: new Set(["cbrands.com"]),
  };
}

let counter = 0;

/** Mirrors what `parseMessage` produces from Gmail, including the internal flag. */
function msg(input: {
  from: string;
  to?: string[];
  cc?: string[];
  subject: string;
  body?: string;
  at: string;
}): ScannedMessage {
  counter += 1;
  const to = input.to ?? ["shane@zmmevents.com"];
  const cc = input.cc ?? [];
  const outbound = OWN.includes(input.from);

  const reachesOutside = [...to, ...cc].some(
    (address) => !OWN.includes(address) && !address.endsWith("@zmmevents.com"),
  );

  return {
    id: `m${counter}`,
    threadId: "t",
    direction: outbound ? "outbound" : "inbound",
    internal: outbound && !reachesOutside,
    fromEmail: input.from,
    fromName: null,
    toEmails: to,
    ccEmails: cc,
    subject: input.subject,
    snippet: input.body ?? null,
    body: input.body,
    sentAt: input.at,
    labelIds: outbound ? ["SENT"] : ["INBOX"],
    headers: {},
  };
}

const thread = (id: string, messages: ScannedMessage[]): ScannedThread => ({ id, messages });

/** What the scan does after screening: facts from history, then the stage. */
function settle(
  history: FactMessage[],
  current: { stage: Stage; source: StageSource },
): { stage: Stage; suggestion: Stage | null; awaitingOurReply: boolean } {
  const facts = deriveBrandFacts(history);

  if (!facts.lastDirection) {
    return { stage: current.stage, suggestion: null, awaitingOurReply: false };
  }

  const auto = deriveAutoStage({
    lastDirection: facts.lastDirection,
    everRepliedByUs: facts.everRepliedByUs,
  });

  const resolved = resolveStage({
    currentStage: current.stage,
    stageSource: current.source,
    autoStage: auto,
  });

  return {
    stage: resolved.stage,
    suggestion: resolved.suggestion,
    awaitingOurReply: facts.awaitingOurReply,
  };
}

describe("a brand's life on the board", () => {
  // The submission that starts everything.
  const submission = msg({
    from: "no-reply@zmmevents.com",
    subject: "New brand inquiry - FlatFlow",
    body:
      "Submission First Name Vraj Last Name Patel Company FlatFlow " +
      "Email vrajpatel@orbitstudio.us Interests Brand Ambassadors Budget Under 10k",
    at: "2026-09-21T15:33:00Z",
  });

  it("hour 1 — the form creates the brand, and it lands in New Submission", () => {
    const screened = screenThread(thread("t1", [submission]), context());

    expect(screened.verdict).toBe("submission");
    if (screened.verdict !== "submission") return;

    expect(screened.candidate.groupKey).toBe("orbitstudio.us");
    expect(screened.candidate.name).toBe("FlatFlow");

    const settled = settle([submission], { stage: "new_submission", source: "auto" });
    expect(settled.stage).toBe("new_submission");
    expect(settled.awaitingOurReply).toBe(true);
  });

  it("hour 2 — Shane replies, and it moves itself to Awaiting Feedback", () => {
    const reply = msg({
      from: "shane@zmmevents.com",
      to: ["vrajpatel@orbitstudio.us", "zach@zmmevents.com"],
      subject: "FlatFlow x Collegiate Agency",
      at: "2026-09-21T18:50:00Z",
    });

    // The reply is its own thread; it attaches because the brand is on the board.
    const screened = screenThread(thread("t2", [reply]), context(["orbitstudio.us"]));
    expect(screened.verdict).toBe("attach");
    expect(screened.verdict === "attach" && screened.groupKey).toBe("orbitstudio.us");

    const settled = settle([submission, reply], { stage: "new_submission", source: "auto" });
    expect(settled.stage).toBe("awaiting_feedback");
    expect(settled.awaitingOurReply).toBe(false);
  });

  it("hour 3 — they answer, and it moves itself to Needs Reply", () => {
    const reply = msg({
      from: "shane@zmmevents.com",
      to: ["vrajpatel@orbitstudio.us"],
      subject: "FlatFlow x Collegiate Agency",
      at: "2026-09-21T18:50:00Z",
    });
    const theirs = msg({
      from: "vrajpatel@orbitstudio.us",
      subject: "Re: FlatFlow x Collegiate Agency",
      at: "2026-09-22T09:12:00Z",
    });

    expect(screenThread(thread("t2", [reply, theirs]), context(["orbitstudio.us"])).verdict).toBe(
      "attach",
    );

    const settled = settle([submission, reply, theirs], {
      stage: "awaiting_feedback",
      source: "auto",
    });
    expect(settled.stage).toBe("needs_reply");
    expect(settled.awaitingOurReply).toBe(true);
  });

  it("hour 4 — forwarding it to Zach does NOT count as answering them", () => {
    const reply = msg({
      from: "shane@zmmevents.com",
      to: ["vrajpatel@orbitstudio.us"],
      subject: "FlatFlow x Collegiate Agency",
      at: "2026-09-21T18:50:00Z",
    });
    const theirs = msg({
      from: "vrajpatel@orbitstudio.us",
      subject: "Re: FlatFlow x Collegiate Agency",
      at: "2026-09-22T09:12:00Z",
    });
    const forward = msg({
      from: "shane@zmmevents.com",
      to: ["zach@zmmevents.com", "ronan@zmmevents.com"],
      subject: "Fwd: FlatFlow",
      at: "2026-09-22T10:00:00Z",
    });

    expect(forward.internal).toBe(true);

    const settled = settle([submission, reply, theirs, forward], {
      stage: "needs_reply",
      source: "auto",
    });

    // Still theirs-to-ours, because the forward never left the building.
    expect(settled.stage).toBe("needs_reply");
    expect(settled.awaitingOurReply).toBe(true);
  });

  it("hour 5 — a CC to the brand DOES count, even addressed to Zach", () => {
    const reply = msg({
      from: "shane@zmmevents.com",
      to: ["vrajpatel@orbitstudio.us"],
      subject: "FlatFlow",
      at: "2026-09-21T18:50:00Z",
    });
    const theirs = msg({
      from: "vrajpatel@orbitstudio.us",
      subject: "Re: FlatFlow",
      at: "2026-09-22T09:12:00Z",
    });
    const cced = msg({
      from: "shane@zmmevents.com",
      to: ["zach@zmmevents.com"],
      cc: ["vrajpatel@orbitstudio.us"],
      subject: "Re: FlatFlow",
      at: "2026-09-22T11:00:00Z",
    });

    expect(cced.internal).toBe(false);

    const settled = settle([submission, reply, theirs, cced], {
      stage: "needs_reply",
      source: "auto",
    });
    expect(settled.stage).toBe("awaiting_feedback");
  });

  it("hour 6 — Shane marks it Active, and the scan stops moving it", () => {
    const reply = msg({
      from: "shane@zmmevents.com",
      to: ["vrajpatel@orbitstudio.us"],
      subject: "FlatFlow",
      at: "2026-09-21T18:50:00Z",
    });
    const theirs = msg({
      from: "vrajpatel@orbitstudio.us",
      subject: "Re: FlatFlow",
      at: "2026-09-25T09:00:00Z",
    });

    // A person moved the card. Everything after this is the scan's behaviour
    // when it disagrees with a human.
    const settled = settle([submission, reply, theirs], {
      stage: "active_campaign",
      source: "manual",
    });

    expect(settled.stage).toBe("active_campaign");
    // A running campaign is never dragged backwards by an unanswered email...
    expect(settled.suggestion).toBeNull();
    // ...but the card still shouts that they are waiting.
    expect(settled.awaitingOurReply).toBe(true);
  });

  it("hour 7 — a pinned card that is not Active gets a suggestion, not a move", () => {
    const reply = msg({
      from: "shane@zmmevents.com",
      to: ["vrajpatel@orbitstudio.us"],
      subject: "FlatFlow",
      at: "2026-09-21T18:50:00Z",
    });
    const theirs = msg({
      from: "vrajpatel@orbitstudio.us",
      subject: "Re: FlatFlow",
      at: "2026-09-25T09:00:00Z",
    });

    const settled = settle([submission, reply, theirs], {
      stage: "awaiting_feedback",
      source: "manual",
    });

    expect(settled.stage).toBe("awaiting_feedback");
    expect(settled.suggestion).toBe("needs_reply");
  });
});

describe("a brand that submits and is never answered", () => {
  it("stays in New Submission no matter how many times we forward it", () => {
    const submission = msg({
      from: "no-reply@zmmevents.com",
      subject: "New brand inquiry - Make A Move LA",
      body: "Company Make A Move LA Email jerimiah@makeamovela.org Budget Not sure yet",
      at: "2026-09-21T14:08:00Z",
    });
    const forwardOne = msg({
      from: "shane@zmmevents.com",
      to: ["zach@zmmevents.com"],
      subject: "Fwd: Make A Move LA",
      at: "2026-09-21T14:35:00Z",
    });
    const forwardTwo = msg({
      from: "shane@zmmevents.com",
      to: ["ronan@zmmevents.com"],
      subject: "Fwd: Make A Move LA",
      at: "2026-09-22T09:00:00Z",
    });

    const settled = settle([submission, forwardOne, forwardTwo], {
      stage: "new_submission",
      source: "auto",
    });

    expect(settled.stage).toBe("new_submission");
    expect(settled.awaitingOurReply).toBe(true);
  });
});

describe("deriveBrandFacts", () => {
  it("reports nothing for a brand with only internal chatter", () => {
    const facts = deriveBrandFacts([
      { direction: "outbound", internal: true, sentAt: "2026-09-21T10:00:00Z" },
    ]);

    expect(facts.lastDirection).toBeNull();
    expect(facts.everRepliedByUs).toBe(false);
  });

  it("takes first contact from the oldest external message", () => {
    const facts = deriveBrandFacts([
      { direction: "outbound", internal: true, sentAt: "2026-09-01T10:00:00Z" },
      { direction: "inbound", internal: false, sentAt: "2026-09-02T10:00:00Z" },
      { direction: "outbound", internal: false, sentAt: "2026-09-03T10:00:00Z" },
    ]);

    expect(facts.firstContactAt).toBe("2026-09-02T10:00:00Z");
    expect(facts.lastMessageAt).toBe("2026-09-03T10:00:00Z");
    expect(facts.lastInboundAt).toBe("2026-09-02T10:00:00Z");
    expect(facts.lastOutboundAt).toBe("2026-09-03T10:00:00Z");
  });

  it("does not care what order the messages arrive in", () => {
    const shuffled = deriveBrandFacts([
      { direction: "outbound", internal: false, sentAt: "2026-09-03T10:00:00Z" },
      { direction: "inbound", internal: false, sentAt: "2026-09-02T10:00:00Z" },
    ]);

    expect(shuffled.lastDirection).toBe("outbound");
  });
});
