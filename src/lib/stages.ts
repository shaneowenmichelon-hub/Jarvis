/**
 * The stage machine.
 *
 * Every function here is pure — no database, no network, no clock except the
 * `now` you pass in. That is deliberate: this is the logic that decides where
 * a brand sits on the board, so it has to be testable without a Gmail account.
 */

import type { BrandEmailFacts, Direction, Stage, StageSource } from "./types";

/** The shape the fact-deriver needs. Both a scanned message and a stored row fit. */
export interface FactMessage {
  direction: Direction;
  internal: boolean;
  sentAt: string;
}

export interface BrandFacts {
  firstContactAt: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastDirection: Direction | null;
  everRepliedByUs: boolean;
  awaitingOurReply: boolean;
}

/**
 * Reduce a brand's whole message history to the handful of facts the stage
 * machine reads.
 *
 * Internal messages are excluded throughout: forwarding a lead to a teammate
 * is not answering the brand, and counting it is what files an unanswered
 * submission under "waiting on them".
 *
 * The production path computes this in SQL — `refresh_brand_facts` in
 * supabase/schema.sql — because the scan only ever holds a recent slice of the
 * inbox and the facts have to come from everything on record. The two must
 * agree; this is the version the tests pin down.
 */
export function deriveBrandFacts(messages: FactMessage[]): BrandFacts {
  const external = messages
    .filter((message) => !message.internal)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));

  if (external.length === 0) {
    return {
      firstContactAt: null,
      lastMessageAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      lastDirection: null,
      everRepliedByUs: false,
      awaitingOurReply: false,
    };
  }

  const last = external[external.length - 1];
  const lastOf = (direction: Direction) =>
    external.filter((message) => message.direction === direction).at(-1)?.sentAt ?? null;

  return {
    firstContactAt: external[0].sentAt,
    lastMessageAt: last.sentAt,
    lastInboundAt: lastOf("inbound"),
    lastOutboundAt: lastOf("outbound"),
    lastDirection: last.direction,
    everRepliedByUs: lastOf("outbound") !== null,
    awaitingOurReply: last.direction === "inbound",
  };
}

/**
 * Where the email state says a brand belongs.
 *
 * The whole derivation rests on one question: who sent the last message?
 *
 *   They did, and we have never replied  → New Submission
 *   They did, and we have replied before → Needs Reply
 *   We did                               → Awaiting Feedback
 *
 * `active_campaign` is deliberately absent. No arrangement of emails proves a
 * campaign is live, so a person moves a brand there and the scan leaves it
 * alone from then on.
 */
export function deriveAutoStage(facts: BrandEmailFacts): Stage {
  if (facts.lastDirection === "outbound") return "awaiting_feedback";
  return facts.everRepliedByUs ? "needs_reply" : "new_submission";
}

export interface StageResolution {
  /** The stage the board should show. */
  stage: Stage;
  /** Did it move? */
  changed: boolean;
  /**
   * Set when a human has pinned the stage but the inbox disagrees. The card
   * shows this as a one-click "accept" chip rather than moving on its own.
   */
  suggestion: Stage | null;
}

export interface ResolveInput {
  currentStage: Stage;
  stageSource: StageSource;
  autoStage: Stage;
}

/**
 * Reconcile what the inbox says with what a person said.
 *
 * A stage a human set by hand is never overwritten by the hourly scan — that
 * is the difference between a tool the team trusts and one that undoes their
 * work at :00 every hour. When the two disagree the scan raises a suggestion
 * instead, and someone accepts it with one click.
 */
export function resolveStage(input: ResolveInput): StageResolution {
  const { currentStage, stageSource, autoStage } = input;

  if (stageSource === "manual") {
    // An active campaign is never "wrong" because an email came in. That case
    // is covered by the awaiting-our-reply flag, which shows on the card
    // without dragging the brand backwards out of a running campaign.
    const suggestion =
      currentStage === "active_campaign" || autoStage === currentStage ? null : autoStage;
    return { stage: currentStage, changed: false, suggestion };
  }

  return {
    stage: autoStage,
    changed: autoStage !== currentStage,
    suggestion: null,
  };
}

/**
 * True whenever their message is the most recent one — at any stage.
 *
 * This is tracked separately from the stage so that a brand parked in Active
 * Campaign still flags an unanswered email instead of going quiet.
 */
export function awaitingOurReply(lastDirection: Direction | null): boolean {
  return lastDirection === "inbound";
}

export type UrgencyLevel = "ok" | "warning" | "critical";

export interface Urgency {
  level: UrgencyLevel;
  days: number;
}

/**
 * How long is too long, per stage.
 *
 * A lead that has sat unanswered for three days is a different kind of problem
 * from a proposal that has been out for three days, so the thresholds differ.
 */
const THRESHOLDS: Record<Stage, { warning: number; critical: number }> = {
  new_submission: { warning: 1, critical: 3 },
  needs_reply: { warning: 2, critical: 4 },
  awaiting_feedback: { warning: 7, critical: 14 },
  active_campaign: { warning: 14, critical: 30 },
};

export function daysBetween(from: string | Date | null, now: Date): number {
  if (!from) return 0;
  const start = typeof from === "string" ? new Date(from) : from;
  if (Number.isNaN(start.getTime())) return 0;
  const ms = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function urgency(stage: Stage, lastMessageAt: string | null, now: Date): Urgency {
  const days = daysBetween(lastMessageAt, now);
  const { warning, critical } = THRESHOLDS[stage];
  if (days >= critical) return { level: "critical", days };
  if (days >= warning) return { level: "warning", days };
  return { level: "ok", days };
}

/**
 * Board ordering inside a column: the thing that has been waiting longest sits
 * at the top, because that is the one about to be forgotten.
 */
export function compareByUrgency(
  a: { last_message_at: string | null },
  b: { last_message_at: string | null },
): number {
  const at = a.last_message_at ? new Date(a.last_message_at).getTime() : Infinity;
  const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : Infinity;
  return at - bt;
}
