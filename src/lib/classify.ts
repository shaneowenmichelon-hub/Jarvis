/**
 * What gets on the board, and what attaches to something already there.
 *
 * Intake is the website form and nothing else. A brand exists because someone
 * filled in the form at collegiateagency.com, which arrives in the inbox as a
 * notification from the site's no-reply address. Nothing a stranger emails
 * directly can create a card.
 *
 * That makes the rule short enough to state in one line, which matters more
 * than it sounds: the previous version guessed at whether an arbitrary inbound
 * email was a brand, and guessing is what put newsletters on the board.
 *
 * So each thread gets one of three answers:
 *
 *   submission  a form notification — create or refresh the brand
 *   attach      a conversation with a brand already on the board
 *   skip        everything else
 *
 * Once a brand is on the board, every later thread involving that company's
 * address or domain attaches to it, in either direction. That is how the
 * hourly scan follows a deal from submission through to a live campaign.
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

export interface ScreenContext {
  /** Every address that counts as "us" — the connected inbox plus teammates. */
  ownAddresses: Set<string>;
  /** Domains we own, so internal mail is never mistaken for a brand. */
  ownDomains: Set<string>;
  /** Addresses the website form sends its notifications from. */
  formSenders: Set<string>;
  /** Lowercased phrase in the subject that marks a form notification. */
  formSubjectMatch: string;
  /** Group keys already on the board, so their conversations attach. */
  knownGroupKeys: Set<string>;
  /** Entities under a do-not-contact rule. */
  blocked: Set<string>;
}

export interface BrandCandidate {
  /** Stable identity: the domain, or the full address for free mail. */
  groupKey: string;
  name: string;
  domain: string | null;
  contactEmail: string;
  contactName: string | null;
  /** What they asked for, straight off the form. */
  interests: string | null;
  budget: string | null;
  /** The form notification itself, for the timeline. */
  firstInbound: ScannedMessage;
}

export type ScreenResult =
  | { verdict: "submission"; reason: string; candidate: BrandCandidate }
  | { verdict: "blocked"; reason: string; candidate: BrandCandidate }
  | { verdict: "attach"; reason: string; groupKey: string }
  | { verdict: "skip"; reason: string };

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export function emailDomain(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at === -1) return null;
  return address.slice(at + 1).toLowerCase().trim() || null;
}

/** Strip subdomains down to the registrable-ish root for matching. */
export function rootDomain(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length <= 2) return domain;
  const twoPartSuffix = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/;
  const lastTwo = parts.slice(-2).join(".");
  if (twoPartSuffix.test(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

/**
 * One brand per company, so three people at the same firm land on one card —
 * unless they are on a free provider, where the domain proves nothing and the
 * address has to stand for the brand instead.
 */
export function groupKeyFor(address: string): string | null {
  const normalized = address.toLowerCase().trim();
  const domain = emailDomain(normalized);
  if (!domain) return null;
  return FREE_MAIL_DOMAINS.has(domain) ? normalized : rootDomain(domain);
}

/** "Fly By Jing" out of "flybyjing.com", when the form gave us no name. */
export function nameFromDomain(domain: string): string {
  const base = rootDomain(domain).split(".")[0] ?? domain;
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function matchesPattern(patterns: Set<string>, address: string, domain: string | null): boolean {
  if (patterns.has(address.toLowerCase())) return true;
  if (!domain) return false;
  return patterns.has(domain) || patterns.has(rootDomain(domain));
}

function isOurs(address: string, ctx: ScreenContext): boolean {
  const normalized = address.toLowerCase();
  if (ctx.ownAddresses.has(normalized)) return true;

  const domain = emailDomain(normalized);
  if (!domain) return false;
  return ctx.ownDomains.has(domain) || ctx.ownDomains.has(rootDomain(domain));
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function screenThread(thread: ScannedThread, ctx: ScreenContext): ScreenResult {
  const messages = [...thread.messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );

  if (messages.length === 0) return { verdict: "skip", reason: "Empty thread" };

  // 1. A website submission. The only thing that creates a brand.
  const formMessage = messages.find((message) => isFormNotification(message, ctx));
  if (formMessage) {
    const candidate = candidateFromForm(parseFormSubmission(formMessage), formMessage);
    if (!candidate) {
      return { verdict: "skip", reason: "Form notification with no usable contact address" };
    }
    if (isOurs(candidate.contactEmail, ctx)) {
      return { verdict: "skip", reason: "Form submitted with one of our own addresses" };
    }
    if (matchesPattern(ctx.blocked, candidate.contactEmail, candidate.domain)) {
      return {
        verdict: "blocked",
        reason: `Do-not-contact entity: ${candidate.domain ?? candidate.contactEmail}`,
        candidate,
      };
    }
    return { verdict: "submission", reason: "Website form submission", candidate };
  }

  // 2. A conversation with a brand already on the board. This is what lets the
  //    hourly scan follow the deal after the submission.
  const attached = matchKnownBrand(messages, ctx);
  if (attached) {
    return { verdict: "attach", reason: `Conversation with ${attached}`, groupKey: attached };
  }

  // Anything else is not a lead. A brand that emails in cold, a newsletter, a
  // vendor pitch — none of it reaches the board, by design.
  return { verdict: "skip", reason: "Not a website submission, and no brand on the board" };
}

/** Any participant whose company is already on the board. */
function matchKnownBrand(messages: ScannedMessage[], ctx: ScreenContext): string | null {
  for (const message of messages) {
    const participants = [message.fromEmail, ...message.toEmails, ...message.ccEmails];

    for (const address of participants) {
      if (!address || isOurs(address, ctx)) continue;

      const key = groupKeyFor(address);
      if (key && ctx.knownGroupKeys.has(key)) return key;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Website form notifications
// ---------------------------------------------------------------------------

/**
 * Is this the site telling us someone filled in the form?
 *
 * Sender and subject both have to match. The sender alone is not enough —
 * the same no-reply address carries ambassador applications, which are people
 * applying to work campus rather than brands buying.
 */
export function isFormNotification(message: ScannedMessage, ctx: ScreenContext): boolean {
  if (!ctx.formSenders.has(message.fromEmail.toLowerCase())) return false;
  return (message.subject ?? "").toLowerCase().includes(ctx.formSubjectMatch);
}

/**
 * Pull the brand out of a form notification.
 *
 * The subject carries the company ("New brand inquiry - FlatFlow") and the
 * body carries labelled fields. Both are best-effort: if the form is ever
 * redesigned this should degrade to a card someone confirms by hand, never to
 * a submission silently dropped.
 */
export function parseFormSubmission(message: ScannedMessage): FormSubmission {
  const body = (message.body ?? message.snippet ?? "").replace(/\s+/g, " ").trim();

  const LABELS = ["First Name", "Last Name", "Company", "Email", "Phone", "Interests", "Budget"];

  const field = (label: string): string | null => {
    const others = LABELS.filter((entry) => entry !== label)
      .map((entry) => entry.replace(/\s/g, "\\s+"))
      .join("|");
    const pattern = new RegExp(`${label.replace(/\s/g, "\\s+")}\\s+(.+?)\\s*(?:${others}|$)`, "i");
    const value = message.body || message.snippet ? body.match(pattern)?.[1]?.trim() : null;
    return value && value.length < 160 ? value : null;
  };

  // The subject is the most reliable source for the company name.
  const subjectCompany = (message.subject ?? "").match(/[-–—]\s*(.+?)\s*$/)?.[1]?.trim() ?? null;

  const contactName =
    [field("First Name"), field("Last Name")].filter(Boolean).join(" ") || null;

  const labelled = field("Email");
  const contactEmail =
    labelled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(labelled)
      ? labelled.toLowerCase()
      : (body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]?.toLowerCase() ?? null);

  return {
    company: subjectCompany || field("Company"),
    contactName,
    contactEmail,
    budget: field("Budget"),
    interests: field("Interests"),
  };
}

function candidateFromForm(
  submission: FormSubmission,
  message: ScannedMessage,
): BrandCandidate | null {
  const address = submission.contactEmail;
  if (!address) return null;

  const groupKey = groupKeyFor(address);
  const domain = emailDomain(address);
  if (!groupKey || !domain) return null;

  const isFreeMail = FREE_MAIL_DOMAINS.has(domain);

  return {
    groupKey,
    name: submission.company ?? (isFreeMail ? address : nameFromDomain(domain)),
    domain: isFreeMail ? null : rootDomain(domain),
    contactEmail: address,
    contactName: submission.contactName,
    interests: submission.interests,
    budget: submission.budget,
    firstInbound: message,
  };
}

/** A one-line summary from the form fields, before any model is involved. */
export function summaryFromForm(candidate: BrandCandidate): string | null {
  const parts = [candidate.interests, candidate.budget && `Budget: ${candidate.budget}`].filter(
    Boolean,
  );
  return parts.length ? parts.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Optional: a better one-liner
// ---------------------------------------------------------------------------

export interface Enrichment {
  summary: string | null;
}

const ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "One sentence, under 20 words, on what this brand is asking for. Written for a teammate scanning a pipeline board. Empty string if the form says nothing useful.",
    },
  },
  required: ["summary"],
  additionalProperties: false,
} as const;

/**
 * Turn the raw form fields into a readable line.
 *
 * Purely cosmetic now that intake is form-only — the form already tells us who
 * the brand is, so there is nothing to classify. Runs once per brand on
 * creation, and any failure just leaves the field-built summary in place.
 */
export async function enrichWithClaude(candidate: BrandCandidate): Promise<Enrichment | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const message = candidate.firstInbound;
  const body = (message.body ?? message.snippet ?? "").slice(0, 4000);

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: ENRICHMENT_SCHEMA },
      },
      system:
        "You summarise inbound sponsorship inquiries for ZMM Events, a collegiate marketing agency that runs campus tours and events. Summarise only what the submission actually says. Do not invent detail.",
      messages: [
        {
          role: "user",
          content: [
            `Company: ${candidate.name}`,
            `Contact: ${candidate.contactName ?? "unknown"} <${candidate.contactEmail}>`,
            "",
            body,
          ].join("\n"),
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;

    const text = response.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") return null;

    const parsed = JSON.parse(text.text) as { summary: string };
    return { summary: parsed.summary?.trim() || null };
  } catch {
    return null;
  }
}
