import { describe, expect, it } from "vitest";

import {
  groupKeyFor,
  nameFromDomain,
  parseFormSubmission,
  rootDomain,
  screenThread,
  summaryFromForm,
  type ScreenContext,
} from "@/lib/classify";
import type { Direction, ScannedMessage, ScannedThread } from "@/lib/types";

const ctx: ScreenContext = {
  ownAddresses: new Set(["shane@zmmevents.com", "zach@zmmevents.com"]),
  ownDomains: new Set(["zmmevents.com"]),
  formSenders: new Set(["no-reply@zmmevents.com"]),
  formSubjectMatch: "brand inquiry",
  knownGroupKeys: new Set(["thesaltyapp.com", "itsfratflix.com"]),
  blocked: new Set(["cbrands.com"]),
};

let counter = 0;

function message(overrides: Partial<ScannedMessage> = {}): ScannedMessage {
  counter += 1;
  return {
    id: `m${counter}`,
    threadId: "t1",
    direction: "inbound" as Direction,
    internal: false,
    fromEmail: "maya@flybyjing.com",
    fromName: "Maya Chen",
    toEmails: ["shane@zmmevents.com"],
    ccEmails: [],
    subject: "Campus activation for the fall",
    snippet: "We'd love to sponsor a few dates on the tour.",
    sentAt: "2026-09-01T10:00:00Z",
    labelIds: ["INBOX"],
    headers: {},
    ...overrides,
  };
}

function thread(messages: ScannedMessage[]): ScannedThread {
  return { id: "t1", messages };
}

const formMail = (overrides: Partial<ScannedMessage> = {}) =>
  message({
    fromEmail: "no-reply@zmmevents.com",
    fromName: null,
    subject: "New brand inquiry - FlatFlow",
    body:
      "Collegiate Agency New brand inquiry Submission First Name Vraj Last Name Patel " +
      "Company FlatFlow Email vrajpatel@orbitstudio.us Phone 8479897408 " +
      "Interests Brand Ambassadors Budget Under 10k",
    ...overrides,
  });

// ---------------------------------------------------------------------------
// Intake: the website form is the only front door.
// ---------------------------------------------------------------------------

describe("website form submissions", () => {
  it("creates a brand from the form's contact, not the no-reply sender", () => {
    const result = screenThread(thread([formMail()]), ctx);

    expect(result.verdict).toBe("submission");
    if (result.verdict !== "submission") return;
    expect(result.candidate.contactEmail).toBe("vrajpatel@orbitstudio.us");
    expect(result.candidate.groupKey).toBe("orbitstudio.us");
  });

  it("takes the brand name from the subject", () => {
    const result = screenThread(thread([formMail()]), ctx);
    expect(result.verdict === "submission" && result.candidate.name).toBe("FlatFlow");
  });

  it("keeps what they asked for and what they will spend", () => {
    const result = screenThread(thread([formMail()]), ctx);
    if (result.verdict !== "submission") throw new Error("expected a submission");

    expect(result.candidate.interests).toBe("Brand Ambassadors");
    expect(result.candidate.budget).toBe("Under 10k");
    expect(summaryFromForm(result.candidate)).toBe("Brand Ambassadors · Budget: Under 10k");
  });

  it("falls back to the snippet when the body was not fetched", () => {
    const result = screenThread(
      thread([
        formMail({
          body: undefined,
          snippet: "Submission First Name Vraj Last Name Patel Company FlatFlow Email vrajpatel@orbitstudio.us",
        }),
      ]),
      ctx,
    );

    expect(result.verdict === "submission" && result.candidate.contactEmail).toBe(
      "vrajpatel@orbitstudio.us",
    );
  });

  it("ignores mail from the form address that is not a brand inquiry", () => {
    // Ambassador applications come from the same no-reply address. They are
    // people applying to work campus, not brands buying.
    const result = screenThread(
      thread([
        formMail({
          subject: "New ambassador application - Emillie Rosario, Kean University",
          body: "Full Name Emillie Rosario Email emillie@example.com City Bloomfield",
        }),
      ]),
      ctx,
    );

    expect(result.verdict).toBe("skip");
  });

  it("ignores a form submitted with one of our own addresses", () => {
    const result = screenThread(
      thread([
        formMail({
          subject: "New brand inquiry - SOS consultants",
          body: "Company SOS consultants Email shane@zmmevents.com Budget Under 10k",
        }),
      ]),
      ctx,
    );

    expect(result.verdict).toBe("skip");
    expect(result.reason).toMatch(/our own addresses/);
  });

  it("still honours do-not-contact rules", () => {
    const result = screenThread(
      thread([
        formMail({
          subject: "New brand inquiry - Constellation",
          body: "Company Constellation Email buyer@cbrands.com Budget Over 50k",
        }),
      ]),
      ctx,
    );

    expect(result.verdict).toBe("blocked");
  });

  it("skips a form notification with no usable address", () => {
    const result = screenThread(
      thread([formMail({ body: "Company Mystery Budget Not sure yet", snippet: null })]),
      ctx,
    );

    expect(result.verdict).toBe("skip");
  });
});

describe("everything that is not a submission", () => {
  it("does not create a brand from a cold inbound email", () => {
    // The whole point of form-only intake: a stranger emailing in is not a lead.
    const result = screenThread(thread([message()]), ctx);

    expect(result.verdict).toBe("skip");
    expect(result.reason).toMatch(/Not a website submission/);
  });

  it("does not create a brand from a newsletter", () => {
    const result = screenThread(
      thread([
        message({
          fromEmail: "hello@substack.com",
          headers: { "List-Unsubscribe": "<https://substack.com/unsub>" },
        }),
      ]),
      ctx,
    );

    expect(result.verdict).toBe("skip");
  });

  it("does not create a brand from internal mail", () => {
    expect(screenThread(thread([message({ fromEmail: "zach@zmmevents.com" })]), ctx).verdict).toBe(
      "skip",
    );
  });
});

// ---------------------------------------------------------------------------
// Follow-on: once a brand is on the board, its conversation attaches.
// ---------------------------------------------------------------------------

describe("conversations with brands already on the board", () => {
  it("attaches an inbound reply from the submitted domain", () => {
    const result = screenThread(
      thread([message({ fromEmail: "cj@itsfratflix.com", subject: "Re: Collegiate Agency" })]),
      ctx,
    );

    expect(result.verdict).toBe("attach");
    expect(result.verdict === "attach" && result.groupKey).toBe("itsfratflix.com");
  });

  it("attaches our outbound message to them", () => {
    const result = screenThread(
      thread([
        message({
          direction: "outbound",
          fromEmail: "shane@zmmevents.com",
          toEmails: ["s.angelova@thesaltyapp.com", "zach@zmmevents.com"],
          labelIds: ["SENT"],
        }),
      ]),
      ctx,
    );

    expect(result.verdict).toBe("attach");
    expect(result.verdict === "attach" && result.groupKey).toBe("thesaltyapp.com");
  });

  it("attaches when the brand is only on CC", () => {
    const result = screenThread(
      thread([
        message({
          direction: "outbound",
          fromEmail: "shane@zmmevents.com",
          toEmails: ["zach@zmmevents.com"],
          ccEmails: ["cj@itsfratflix.com"],
          labelIds: ["SENT"],
        }),
      ]),
      ctx,
    );

    expect(result.verdict).toBe("attach");
  });

  it("attaches a colleague writing from the same company", () => {
    const result = screenThread(
      thread([message({ fromEmail: "someone.else@itsfratflix.com" })]),
      ctx,
    );

    expect(result.verdict === "attach" && result.groupKey).toBe("itsfratflix.com");
  });

  it("does not attach a thread that only involves our own people", () => {
    const result = screenThread(
      thread([
        message({
          direction: "outbound",
          fromEmail: "shane@zmmevents.com",
          toEmails: ["zach@zmmevents.com"],
          labelIds: ["SENT"],
        }),
      ]),
      ctx,
    );

    expect(result.verdict).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// Address handling
// ---------------------------------------------------------------------------

describe("parseFormSubmission", () => {
  it("reads every labelled field", () => {
    const parsed = parseFormSubmission(formMail());

    expect(parsed).toEqual({
      company: "FlatFlow",
      contactName: "Vraj Patel",
      contactEmail: "vrajpatel@orbitstudio.us",
      budget: "Under 10k",
      interests: "Brand Ambassadors",
    });
  });

  it("finds an address even when the Email label is missing", () => {
    const parsed = parseFormSubmission(
      formMail({ body: "Company Mystery Contact reach me at hello@mystery.com thanks" }),
    );

    expect(parsed.contactEmail).toBe("hello@mystery.com");
  });
});

describe("groupKeyFor", () => {
  it("groups a company by its domain", () => {
    expect(groupKeyFor("maya@flybyjing.com")).toBe("flybyjing.com");
  });

  it("groups subdomains with the parent company", () => {
    expect(groupKeyFor("team@mail.marketing.flybyjing.com")).toBe("flybyjing.com");
  });

  it("falls back to the address for free mail, where a domain proves nothing", () => {
    expect(groupKeyFor("maya@gmail.com")).toBe("maya@gmail.com");
  });

  it("is case-insensitive", () => {
    expect(groupKeyFor("Maya@FlyByJing.com")).toBe("flybyjing.com");
  });
});

describe("rootDomain", () => {
  it("keeps two-part domains", () => {
    expect(rootDomain("flybyjing.com")).toBe("flybyjing.com");
  });

  it("handles two-part public suffixes", () => {
    expect(rootDomain("news.brand.co.uk")).toBe("brand.co.uk");
  });
});

describe("nameFromDomain", () => {
  it("makes a passable starting name", () => {
    expect(nameFromDomain("prizepicks.com")).toBe("Prizepicks");
    expect(nameFromDomain("fly-by-jing.com")).toBe("Fly By Jing");
  });
});
