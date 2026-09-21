/**
 * Deciding what counts as a brand submission.
 *
 * Two layers, in this order:
 *
 *  1. `screenThread` — cheap, deterministic, and the only layer that can reject
 *     a thread outright. Newsletters, platform notifications, no-reply robots,
 *     senders the team has dismissed. This runs on every thread, every scan.
 *
 *  2. `enrichWithClaude` — optional. Runs once per brand, the first time we see
 *     it, to pull out a real company name and a one-line summary. If no API key
 *     is configured the brand still lands on the board, just marked unverified
 *     for someone to confirm.
 *
 * Layer 1 is pure so it can be tested against fixtures; layer 2 is the only
 * part that touches the network.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { FormSubmission, ScannedMessage, ScannedThread } from "./types";

/** Providers where the domain says nothing about which company someone is. */
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "zoho.com",
  "fastmail.com",
  "hey.com",
]);

/** Local-parts that are machines, not people. */
const ROBOT_LOCAL_PARTS =
  /^(no-?reply|do-?not-?reply|donotreply|notifications?|alerts?|mailer-daemon|postmaster|bounces?|bounce-|auto(reply|responder)|system|noc|newsletter|news|updates?|digest|team\+|via|support\+)/i;

/** Gmail's own buckets for mail that is not a person writing to you. */
const EXCLUDED_LABELS = new Set([
  "SPAM",
  "TRASH",
  "DRAFT",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_FORUMS",
]);

export type ScreenVerdict = "candidate" | "blocked" | "skip";

export interface ScreenResult {
  verdict: ScreenVerdict;
  /** Human-readable, and written to the scan log so skips are auditable. */
  reason: string;
  /** Present when the verdict is candidate or blocked. */
  candidate?: BrandCandidate;
}

export interface BrandCandidate {
  /** Stable identity for this brand: the domain, or the address for free mail. */
  groupKey: string;
  /** Best-effort company name before Claude gets a look at it. */
  name: string;
  domain: string | null;
  contactEmail: string;
  contactName: string | null;
  /** The message that started the conversation, for the enrichment prompt. */
  firstInbound: ScannedMessage;
}

export interface ScreenContext {
  /** Every address that counts as "us" — the connected inbox plus teammates. */
  ownAddresses: Set<string>;
  /** Domains we own, so internal mail never becomes a submission. */
  ownDomains: Set<string>;
  /** Domains and addresses the team has dismissed as not-a-brand. */
  ignored: Set<string>;
  /** Entities under a do-not-contact rule. */
  blocked: Set<string>;
  /**
   * Group keys already on the board. Lets an outbound-only thread attach to a
   * brand we already know, instead of being dropped as cold outreach.
   */
  knownGroupKeys: Set<string>;
  /**
   * Lowercased phrase that marks a website-form notification, matched against
   * the subject. The form mails arrive from our own no-reply address, so
   * without this they are rejected twice over — as a robot and as internal.
   */
  formSubjectMatch: string;
}

export function emailDomain(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at === -1) return null;
  const domain = address.slice(at + 1).toLowerCase().trim();
  return domain || null;
}

/** Strip subdomains down to the registrable-ish root for matching. */
export function rootDomain(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length <= 2) return domain;
  // Handles the common two-part public suffixes we are likely to meet.
  const twoPartSuffix = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/;
  const lastTwo = parts.slice(-2).join(".");
  if (twoPartSuffix.test(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

/** Does `domain` or the full `address` appear in a pattern set? */
function matchesPattern(patterns: Set<string>, address: string, domain: string | null): boolean {
  if (patterns.has(address.toLowerCase())) return true;
  if (!domain) return false;
  if (patterns.has(domain)) return true;
  return patterns.has(rootDomain(domain));
}

/** "Fly By Jing" out of "flybyjing.com", as a starting guess. */
export function nameFromDomain(domain: string): string {
  const base = rootDomain(domain).split(".")[0] ?? domain;
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * The deterministic screen. Returns `skip` for anything that is plainly not a
 * brand writing in, `blocked` for do-not-contact entities, `candidate`
 * otherwise.
 */
export function screenThread(thread: ScannedThread, ctx: ScreenContext): ScreenResult {
  const messages = [...thread.messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );

  if (messages.length === 0) {
    return { verdict: "skip", reason: "Empty thread" };
  }

  const inbound = messages.filter((m) => m.direction === "inbound");

  // The agency's own website form notifies us from a no-reply address on our
  // own domain, so the sender tells us nothing — the brand is in the body.
  // This is the main intake channel, so it is checked before anything else.
  const formMessage = messages.find((message) => isFormNotification(message, ctx));
  if (formMessage) {
    const submission = parseFormSubmission(formMessage);
    const candidate = candidateFromForm(submission, formMessage);
    if (candidate) {
      return matchesPattern(ctx.blocked, candidate.contactEmail, candidate.domain)
        ? { verdict: "blocked", reason: `Do-not-contact entity: ${candidate.domain}`, candidate }
        : { verdict: "candidate", reason: "Website form submission", candidate };
    }
    return { verdict: "skip", reason: "Form notification with no usable contact" };
  }

  if (inbound.length === 0) {
    // Intake is inbound-only, with one exception: a thread we started with a
    // brand already on the board belongs to that brand. Without this, a lead
    // that came through the form and was then emailed — and never replied —
    // disappears, which is precisely the lead most worth chasing.
    const known = outboundRecipientOnBoard(messages, ctx);
    if (!known) {
      return { verdict: "skip", reason: "No inbound message — outbound-only thread" };
    }
    return {
      verdict: "candidate",
      reason: "Outbound thread with a brand already on the board",
      candidate: known,
    };
  }

  const first = inbound[0];
  const address = first.fromEmail.toLowerCase();
  const domain = emailDomain(address);

  if (!domain) {
    return { verdict: "skip", reason: `Unparseable sender: ${first.fromEmail}` };
  }

  if (ctx.ownDomains.has(domain) || ctx.ownDomains.has(rootDomain(domain))) {
    return { verdict: "skip", reason: "Internal mail" };
  }

  if (ctx.ownAddresses.has(address)) {
    return { verdict: "skip", reason: "Sender is one of our own addresses" };
  }

  if (matchesPattern(ctx.ignored, address, domain)) {
    return { verdict: "skip", reason: `Sender dismissed by the team: ${domain}` };
  }

  const localPart = address.slice(0, address.lastIndexOf("@"));
  if (ROBOT_LOCAL_PARTS.test(localPart)) {
    return { verdict: "skip", reason: `Automated sender: ${address}` };
  }

  for (const message of inbound) {
    if (message.labelIds.some((label) => EXCLUDED_LABELS.has(label))) {
      return { verdict: "skip", reason: "Gmail filed it as promotions, social, or spam" };
    }
  }

  const headers = lowercaseHeaders(first.headers);
  if (headers["list-unsubscribe"] || headers["list-id"]) {
    return { verdict: "skip", reason: "Bulk mail (carries List-Unsubscribe)" };
  }
  if ((headers["precedence"] ?? "").toLowerCase() === "bulk") {
    return { verdict: "skip", reason: "Bulk mail (Precedence: bulk)" };
  }
  const autoSubmitted = (headers["auto-submitted"] ?? "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") {
    return { verdict: "skip", reason: "Auto-generated mail" };
  }

  const isFreeMail = FREE_MAIL_DOMAINS.has(domain);
  const candidate: BrandCandidate = {
    groupKey: isFreeMail ? address : rootDomain(domain),
    name: isFreeMail ? (first.fromName ?? address) : nameFromDomain(domain),
    domain: isFreeMail ? null : rootDomain(domain),
    contactEmail: address,
    contactName: first.fromName,
    firstInbound: first,
  };

  if (matchesPattern(ctx.blocked, address, domain)) {
    return {
      verdict: "blocked",
      reason: `Do-not-contact entity: ${domain}`,
      candidate,
    };
  }

  return { verdict: "candidate", reason: "Inbound from a real sender", candidate };
}

// ---------------------------------------------------------------------------
// Website form submissions
// ---------------------------------------------------------------------------

/** Mail from our own site's no-reply address announcing a form submission. */
export function isFormNotification(message: ScannedMessage, ctx: ScreenContext): boolean {
  const address = message.fromEmail.toLowerCase();
  const domain = emailDomain(address);
  if (!domain) return false;

  const ours = ctx.ownDomains.has(domain) || ctx.ownDomains.has(rootDomain(domain));
  if (!ours) return false;

  const subject = (message.subject ?? "").toLowerCase();
  return subject.includes(ctx.formSubjectMatch);
}

/**
 * Pull the brand out of a form notification.
 *
 * The subject carries the company name ("New brand inquiry - FlatFlow") and
 * the body carries labelled fields. Both are best-effort: a form that gets
 * redesigned should degrade to a card someone confirms by hand, never to a
 * lead silently dropped.
 */
export function parseFormSubmission(message: ScannedMessage): FormSubmission {
  const body = (message.body ?? message.snippet ?? "").replace(/\s+/g, " ").trim();

  const field = (label: string, stopAt: string[]): string | null => {
    const stop = stopAt.map((word) => word.replace(/\s/g, "\\s+")).join("|");
    const pattern = new RegExp(`${label.replace(/\s/g, "\\s+")}\\s+(.+?)\\s*(?:${stop}|$)`, "i");
    const match = body.match(pattern);
    const value = match?.[1]?.trim();
    return value && value.length < 120 ? value : null;
  };

  const LABELS = ["First Name", "Last Name", "Company", "Email", "Phone", "Interests", "Budget"];
  const others = (self: string) => LABELS.filter((label) => label !== self);

  // The subject is the most reliable source for the company.
  const subjectCompany = (message.subject ?? "").match(/[-–—]\s*(.+?)\s*$/)?.[1]?.trim() ?? null;

  const firstName = field("First Name", others("First Name"));
  const lastName = field("Last Name", others("Last Name"));
  const contactName = [firstName, lastName].filter(Boolean).join(" ") || null;

  // Take the address from the labelled field, falling back to the first one in
  // the body that is not ours.
  const labelled = field("Email", others("Email"));
  const contactEmail =
    labelled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(labelled)
      ? labelled.toLowerCase()
      : (body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]?.toLowerCase() ?? null);

  return {
    company: subjectCompany || field("Company", others("Company")),
    contactName,
    contactEmail,
    budget: field("Budget", others("Budget")),
    interests: field("Interests", others("Interests")),
  };
}

function candidateFromForm(
  submission: FormSubmission,
  message: ScannedMessage,
): BrandCandidate | null {
  const address = submission.contactEmail;
  if (!address) return null;

  const domain = emailDomain(address);
  if (!domain) return null;

  const isFreeMail = FREE_MAIL_DOMAINS.has(domain);

  return {
    groupKey: isFreeMail ? address : rootDomain(domain),
    name: submission.company ?? (isFreeMail ? address : nameFromDomain(domain)),
    domain: isFreeMail ? null : rootDomain(domain),
    contactEmail: address,
    contactName: submission.contactName,
    firstInbound: message,
  };
}

/**
 * For a thread with no inbound message: is anyone we wrote to already a brand
 * on the board? If so the thread is theirs.
 */
function outboundRecipientOnBoard(
  messages: ScannedMessage[],
  ctx: ScreenContext,
): BrandCandidate | null {
  for (const message of messages) {
    for (const address of [...message.toEmails, ...message.ccEmails]) {
      const normalized = address.toLowerCase();
      if (ctx.ownAddresses.has(normalized)) continue;

      const domain = emailDomain(normalized);
      if (!domain) continue;
      if (ctx.ownDomains.has(domain) || ctx.ownDomains.has(rootDomain(domain))) continue;

      const isFreeMail = FREE_MAIL_DOMAINS.has(domain);
      const groupKey = isFreeMail ? normalized : rootDomain(domain);

      if (!ctx.knownGroupKeys.has(groupKey)) continue;

      return {
        groupKey,
        name: isFreeMail ? normalized : nameFromDomain(domain),
        domain: isFreeMail ? null : rootDomain(domain),
        contactEmail: normalized,
        contactName: null,
        firstInbound: message,
      };
    }
  }

  return null;
}

function lowercaseHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Layer 2 — Claude enrichment (optional)
// ---------------------------------------------------------------------------

export interface Enrichment {
  isBrandInquiry: boolean;
  brandName: string | null;
  contactName: string | null;
  summary: string | null;
  confidence: number;
}

const ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    is_brand_inquiry: {
      type: "boolean",
      description:
        "True if this is a company (or an agency acting for one) making contact about a sponsorship, partnership, activation, or marketing opportunity. False for newsletters, vendor pitches selling software or services to us, job applications, press requests, and personal mail.",
    },
    brand_name: {
      type: "string",
      description:
        "The brand or company reaching out, as it should appear on a pipeline card. Empty string if unclear.",
    },
    contact_name: {
      type: "string",
      description: "The person's full name, or empty string if not stated.",
    },
    summary: {
      type: "string",
      description:
        "One sentence, under 20 words, on what they want. Written for a teammate scanning a board.",
    },
    confidence: {
      type: "number",
      description: "Confidence that is_brand_inquiry is right, from 0 to 1.",
    },
  },
  required: ["is_brand_inquiry", "brand_name", "contact_name", "summary", "confidence"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You triage inbound email for ZMM Events, a collegiate marketing agency that runs campus tours and events and sells sponsorships to brands.

A "brand inquiry" is a company, or an agency working for one, making contact about sponsoring, partnering, or running an activation with us. Inbound interest in our inventory.

It is NOT a brand inquiry when the sender is:
- selling us software, ad tech, lead lists, staffing, or agency services
- a newsletter, digest, press release, or event announcement
- a student, job applicant, or intern asking about work
- a vendor invoice, a platform notification, or personal mail

Judge only from the message. Do not invent detail that is not there.`;

/**
 * Ask Claude to name the brand and summarize the ask.
 *
 * Called once per brand, on first sight — not on every scan — so the cost of
 * running this stays proportional to new leads rather than inbox volume.
 * Returns null on any failure: enrichment is a nicety, never a gate.
 */
export async function enrichWithClaude(candidate: BrandCandidate): Promise<Enrichment | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const message = candidate.firstInbound;
  const body = (message.body ?? message.snippet ?? "").slice(0, 6000);

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      // Triage is a shallow judgement — low effort keeps it fast and cheap.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: ENRICHMENT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `From: ${message.fromName ?? ""} <${message.fromEmail}>`,
            `Subject: ${message.subject ?? "(no subject)"}`,
            "",
            body,
          ].join("\n"),
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;

    const text = response.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") return null;

    const parsed = JSON.parse(text.text) as {
      is_brand_inquiry: boolean;
      brand_name: string;
      contact_name: string;
      summary: string;
      confidence: number;
    };

    return {
      isBrandInquiry: Boolean(parsed.is_brand_inquiry),
      brandName: parsed.brand_name?.trim() || null,
      contactName: parsed.contact_name?.trim() || null,
      summary: parsed.summary?.trim() || null,
      confidence: clamp01(Number(parsed.confidence)),
    };
  } catch {
    // A classifier outage must not stop the scan. The brand lands unverified.
    return null;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
