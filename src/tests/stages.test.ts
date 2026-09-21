import { describe, expect, it } from "vitest";

import { compareByUrgency, deriveAutoStage, resolveStage, urgency } from "@/lib/stages";

describe("deriveAutoStage", () => {
  it("puts a first-time inbound with no reply from us in New Submission", () => {
    expect(deriveAutoStage({ lastDirection: "inbound", everRepliedByUs: false })).toBe(
      "new_submission",
    );
  });

  it("puts an inbound on a conversation we have joined in Needs Reply", () => {
    expect(deriveAutoStage({ lastDirection: "inbound", everRepliedByUs: true })).toBe(
      "needs_reply",
    );
  });

  it("puts anything where we sent last in Awaiting Feedback", () => {
    expect(deriveAutoStage({ lastDirection: "outbound", everRepliedByUs: true })).toBe(
      "awaiting_feedback",
    );
  });

  it("never derives Active Campaign — no email pattern proves a campaign is live", () => {
    const combinations = [
      { lastDirection: "inbound", everRepliedByUs: true },
      { lastDirection: "inbound", everRepliedByUs: false },
      { lastDirection: "outbound", everRepliedByUs: true },
      { lastDirection: "outbound", everRepliedByUs: false },
    ] as const;

    for (const facts of combinations) {
      expect(deriveAutoStage(facts)).not.toBe("active_campaign");
    }
  });
});

describe("resolveStage", () => {
  it("moves a brand the scan owns", () => {
    const result = resolveStage({
      currentStage: "awaiting_feedback",
      stageSource: "auto",
      autoStage: "needs_reply",
    });

    expect(result).toEqual({ stage: "needs_reply", changed: true, suggestion: null });
  });

  it("reports no change when the scan already agrees", () => {
    const result = resolveStage({
      currentStage: "needs_reply",
      stageSource: "auto",
      autoStage: "needs_reply",
    });

    expect(result.changed).toBe(false);
  });

  it("never overwrites a stage a person pinned", () => {
    const result = resolveStage({
      currentStage: "awaiting_feedback",
      stageSource: "manual",
      autoStage: "needs_reply",
    });

    expect(result.stage).toBe("awaiting_feedback");
    expect(result.changed).toBe(false);
    expect(result.suggestion).toBe("needs_reply");
  });

  it("raises no suggestion when a pinned stage already matches the inbox", () => {
    const result = resolveStage({
      currentStage: "needs_reply",
      stageSource: "manual",
      autoStage: "needs_reply",
    });

    expect(result.suggestion).toBeNull();
  });

  it("never suggests dragging a running campaign backwards", () => {
    const result = resolveStage({
      currentStage: "active_campaign",
      stageSource: "manual",
      autoStage: "needs_reply",
    });

    expect(result.stage).toBe("active_campaign");
    expect(result.suggestion).toBeNull();
  });
});

describe("urgency", () => {
  const now = new Date("2026-09-21T12:00:00Z");
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString();

  it("escalates a new submission faster than a sent proposal", () => {
    expect(urgency("new_submission", daysAgo(3), now).level).toBe("critical");
    expect(urgency("awaiting_feedback", daysAgo(3), now).level).toBe("ok");
  });

  it("warns before it escalates", () => {
    expect(urgency("needs_reply", daysAgo(1), now).level).toBe("ok");
    expect(urgency("needs_reply", daysAgo(2), now).level).toBe("warning");
    expect(urgency("needs_reply", daysAgo(4), now).level).toBe("critical");
  });

  it("counts whole days waited", () => {
    expect(urgency("needs_reply", daysAgo(5), now).days).toBe(5);
  });

  it("treats a brand with no messages as brand new rather than ancient", () => {
    expect(urgency("new_submission", null, now)).toEqual({ level: "ok", days: 0 });
  });
});

describe("compareByUrgency", () => {
  it("sorts the longest-waiting to the top", () => {
    const rows = [
      { last_message_at: "2026-09-20T00:00:00Z" },
      { last_message_at: "2026-09-01T00:00:00Z" },
      { last_message_at: "2026-09-10T00:00:00Z" },
    ];

    expect([...rows].sort(compareByUrgency).map((row) => row.last_message_at)).toEqual([
      "2026-09-01T00:00:00Z",
      "2026-09-10T00:00:00Z",
      "2026-09-20T00:00:00Z",
    ]);
  });
});
