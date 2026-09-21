/** The four areas a brand can be in. Order matters — it is the board order. */
export const STAGES = [
  "new_submission",
  "needs_reply",
  "awaiting_feedback",
  "active_campaign",
] as const;

export type Stage = (typeof STAGES)[number];

export type Direction = "inbound" | "outbound";
export type StageSource = "auto" | "manual";
export type Classification = "brand" | "unverified" | "dismissed";

export interface StageMeta {
  key: Stage;
  label: string;
  /** What being in this column actually means, shown under the column header. */
  blurb: string;
  /** Whose move it is. Drives the "waiting on us" accent. */
  ball: "us" | "them" | "running";
}

export const STAGE_META: Record<Stage, StageMeta> = {
  new_submission: {
    key: "new_submission",
    label: "New Submission",
    blurb: "They reached out. Nobody here has replied yet.",
    ball: "us",
  },
  needs_reply: {
    key: "needs_reply",
    label: "Needs Reply",
    blurb: "They sent the last message. You owe them one.",
    ball: "us",
  },
  awaiting_feedback: {
    key: "awaiting_feedback",
    label: "Awaiting Feedback",
    blurb: "Proposal is out. Waiting on their call.",
    ball: "them",
  },
  active_campaign: {
    key: "active_campaign",
    label: "Active Campaign",
    blurb: "Signed and running.",
    ball: "running",
  },
};

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

/** A single Gmail message, reduced to what the dashboard needs. */
export interface ScannedMessage {
  id: string;
  threadId: string;
  direction: Direction;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  sentAt: string; // ISO
  labelIds: string[];
  /** Raw headers we need for the newsletter/automation checks. */
  headers: Record<string, string>;
  /** Only populated for threads being classified for the first time. */
  body?: string;
}

export interface ScannedThread {
  id: string;
  messages: ScannedMessage[];
}

/** Everything the stage machine is allowed to look at. */
export interface BrandEmailFacts {
  /** Have we ever sent a message to this brand, in any thread? */
  everRepliedByUs: boolean;
  /** Direction of the single most recent message across all their threads. */
  lastDirection: Direction;
}

export interface BrandRow {
  id: string;
  group_key: string;
  name: string;
  domain: string | null;
  website: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  stage: Stage;
  stage_source: StageSource;
  auto_stage: Stage | null;
  stage_changed_at: string;
  stage_changed_by: string | null;
  owner_email: string | null;
  first_contact_at: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_direction: Direction | null;
  awaiting_our_reply: boolean;
  thread_count: number;
  message_count: number;
  classification: Classification;
  confidence: number | null;
  summary: string | null;
  deal_value: number | null;
  event_tag: string | null;
  notes: string | null;
  blocked: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  brand_id: string;
  direction: Direction;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[] | null;
  subject: string | null;
  snippet: string | null;
  sent_at: string;
}

export interface ScanRunRow {
  id: number;
  trigger: "cron" | "manual" | "backfill";
  status: "running" | "ok" | "error";
  started_at: string;
  finished_at: string | null;
  window_start: string | null;
  threads_seen: number;
  messages_seen: number;
  brands_created: number;
  brands_updated: number;
  stages_changed: number;
  skipped: number;
  error: string | null;
}
