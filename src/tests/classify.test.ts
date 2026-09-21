import { describe, expect, it } from "vitest";

import { nameFromDomain, rootDomain, screenThread, type ScreenContext } from "@/lib/classify";
import type { Direction, ScannedMessage, ScannedThread } from "@/lib/types";

const ctx: ScreenContext = {
  ownAddresses: new Set(["shane@zmmevents.com", "zach@zmmevents.com"]),
  ownDomains: new Set(["zmmevents.com"]),
  ignored: new Set(["substack.com", "noisy-vendor.com"]),
  blocked: new Set(["cbrands.com"]),
};

let counter = 0;

function message(overrides: Partial<ScannedMessage> = {}): ScannedMessage {
  counter += 1;
  return {
    id: `m${counter}`,
    threadId: "t1",
    direction: "inbound" as Direction,
    fromEmail: "maya@flybyjing.com",
    fromName: "Maya Chen",
    toEmails: ["shane@zmmevents.com"],
    subject: "Campus activation for the fall",
    snippet: "We'd love to sponsor a few dates on the tour.",
    sentAt: "2026-09-01T10:00:00Z",
    labelIds: ["INBOX"],
    headers: { from: "Maya Chen <maya@flybyjing.com>" },
    ...overrides,
  };
}

function thread(messages: ScannedMessage[]): ScannedThread {
  return { id: "t1", messages };
}

describe("screenThread", () => {
  it("accepts a real brand writing in, and groups it by domain", () => {
    const result = screenThread(thread([message()]), ctx);

    expect(result.verdict).toBe("candidate");
    expect(result.candidate?.groupKey).toBe("flybyjing.com");
    expect(result.candidate?.domain).toBe("flybyjing.com");
    expect(result.candidate?.contactEmail).toBe("maya@flybyjing.com");
  });

  it("groups a free-mail sender by address, since the domain says nothing", () => {
    const result = screenThread(
      thread([message({ fromEmail: "maya@gmail.com", headers: {} })]),
      ctx,
    );

    expect(result.verdict).toBe("candidate");
    expect(result.candidate?.groupKey).toBe("maya@gmail.com");
    expect(result.candidate?.domain).toBeNull();
  });

  it("groups subdomains with the parent company", () => {
    const result = screenThread(
      thread([message({ fromEmail: "team@mail.flybyjing.com", headers: {} })]),
      ctx,
    );

    expect(result.candidate?.groupKey).toBe("flybyjing.com");
  });

  it("skips a thread we started that nobody answered", () => {
    const result = screenThread(
      thread([message({ direction: "outbound", fromEmail: "shane@zmmevents.com" })]),
      ctx,
    );

    expect(result.verdict).toBe("skip");
    expect(result.reason).toMatch(/outbound-only/);
  });

  it("skips internal mail", () => {
    const result = screenThread(
      thread([message({ fromEmail: "zach@zmmevents.com", headers: {} })]),
      ctx,
    );

    expect(result.verdict).toBe("skip");
    expect(result.reason).toBe("Internal mail");
  });

  it("skips no-reply robots", () => {
    for (const address of [
      "no-reply@brand.com",
      "noreply@brand.com",
      "notifications@brand.com",
      "bounces@brand.com",
    ]) {
      const result = screenThread(thread([message({ fromEmail: address, headers: {} })]), ctx);
      expect(result.verdict, address).toBe("skip");
    }
  });

  it("skips newsletters by their List-Unsubscribe header", () => {
    const result = screenThread(
      thread([
        message({
          fromEmail: "hello@somebrand.com",
          headers: { "List-Unsubscribe": "<https://somebrand.com/unsub>" },
        }),
      ]),
      ctx,
    );

    expect(result.verdict).toBe("skip");
    expect(result.reason).toMatch(/List-Unsubscribe/);
  });

  it("skips anything Gmail filed as promotions or social", () => {
    for (const label of ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "SPAM"]) {
      const result = screenThread(
        thread([message({ fromEmail: "hi@somebrand.com", headers: {}, labelIds: [label] })]),
        ctx,
      );
      expect(result.verdict, label).toBe("skip");
    }
  });

  it("skips auto-generated mail", () => {
    const result = screenThread(
      thread([
        message({
          fromEmail: "hi@somebrand.com",
          headers: { "Auto-Submitted": "auto-generated" },
        }),
      ]),
      ctx,
    );

    expect(result.verdict).toBe("skip");
  });

  it("skips senders the team has already dismissed", () => {
    const result = screenThread(
      thread([message({ fromEmail: "person@noisy-vendor.com", headers: {} })]),
      ctx,
    );

    expect(result.verdict).toBe("skip");
    expect(result.reason).toMatch(/dismissed/);
  });

  it("flags a do-not-contact entity instead of quietly dropping it", () => {
    const result = screenThread(
      thread([message({ fromEmail: "buyer@cbrands.com", headers: {} })]),
      ctx,
    );

    expect(result.verdict).toBe("blocked");
    expect(result.candidate?.groupKey).toBe("cbrands.com");
  });

  it("judges the thread by its first inbound message, not its latest", () => {
    // A brand writes in, we reply, they reply again. Still one candidate.
    const result = screenThread(
      thread([
        message({ sentAt: "2026-09-01T10:00:00Z" }),
        message({
          direction: "outbound",
          fromEmail: "shane@zmmevents.com",
          sentAt: "2026-09-02T10:00:00Z",
          labelIds: ["SENT"],
        }),
        message({ sentAt: "2026-09-03T10:00:00Z", headers: {} }),
      ]),
      ctx,
    );

    expect(result.verdict).toBe("candidate");
    expect(result.candidate?.contactEmail).toBe("maya@flybyjing.com");
  });

  it("skips an empty thread rather than throwing", () => {
    expect(screenThread(thread([]), ctx).verdict).toBe("skip");
  });
});

describe("rootDomain", () => {
  it("keeps two-part domains", () => {
    expect(rootDomain("flybyjing.com")).toBe("flybyjing.com");
  });

  it("strips subdomains", () => {
    expect(rootDomain("mail.marketing.flybyjing.com")).toBe("flybyjing.com");
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
