/**
 * Ambassadors.
 *
 * The same website form that sends brand inquiries also sends ambassador
 * applications — students asking to work campus. They arrive from the same
 * no-reply address and are told apart by their subject.
 *
 * They are deliberately not brands and do not touch the pipeline board: a
 * student applying to work is not a company buying, and mixing the two is what
 * makes a sponsorship board useless. They get their own tab, their own four
 * stages, and their own table.
 */

import type { ScannedMessage } from "./types";

/** Where an applicant is in the recruiting process. */
export const AMBASSADOR_STAGES = ["applied", "reviewing", "onboarded", "active"] as const;

export type AmbassadorStage = (typeof AMBASSADOR_STAGES)[number];

export interface AmbassadorStageMeta {
  key: AmbassadorStage;
  label: string;
  blurb: string;
}

export const AMBASSADOR_STAGE_META: Record<AmbassadorStage, AmbassadorStageMeta> = {
  applied: {
    key: "applied",
    label: "Applied",
    blurb: "Came through the form. Nobody has looked yet.",
  },
  reviewing: {
    key: "reviewing",
    label: "Reviewing",
    blurb: "Being assessed, or in conversation.",
  },
  onboarded: {
    key: "onboarded",
    label: "Onboarded",
    blurb: "Accepted and set up, not yet on a campaign.",
  },
  active: {
    key: "active",
    label: "Active",
    blurb: "Working a campaign right now.",
  },
};

export function isAmbassadorStage(value: unknown): value is AmbassadorStage {
  return typeof value === "string" && (AMBASSADOR_STAGES as readonly string[]).includes(value);
}

export interface AmbassadorApplication {
  fullName: string | null;
  dob: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  school: string | null;
  schoolEmail: string | null;
  gradYear: string | null;
  major: string | null;
  instagram: string | null;
  tiktok: string | null;
  igFollowers: number | null;
  ttFollowers: number | null;
  niche: string | null;
  why: string | null;
  utmSource: string | null;
  landingPage: string | null;
}

/**
 * Every label the form emits, longest first.
 *
 * Order matters: "School Email" has to be tried before "School", or the
 * shorter label swallows the address.
 */
const LABELS = [
  "Full Name",
  "School Email",
  "Grad Year",
  "Ig Followers",
  "Tt Followers",
  "Landing page",
  "Utm source",
  "Instagram",
  "Tiktok",
  "School",
  "Phone",
  "State",
  "Major",
  "Niche",
  "City",
  "Dob",
  "Why",
] as const;

/**
 * Things that end a value without being a field we read.
 *
 * The form emits two blocks that sit in the middle of the message: a "Secure
 * files" block listing ID uploads, which lands directly after `Why`, and a
 * `Referrer` line inside the attribution block, which lands between `Utm
 * source` and `Landing page`. Neither is a label in LABELS, so without them
 * here the preceding value swallows the whole block.
 */
const TERMINATORS = ["Attribution", "Secure files", "Government ID", "Referrer"] as const;

/**
 * Pull an application out of a notification.
 *
 * Handles both shapes the same message can arrive in: the plain-text body,
 * where fields read "Label: value" on their own lines, and Gmail's snippet,
 * where the colons and newlines are gone and it reads "Label value Label
 * value". The snippet is the fallback for a thread already on record, whose
 * body the scan no longer fetches.
 */
export function parseAmbassadorApplication(message: ScannedMessage): AmbassadorApplication {
  const text = (message.body ?? message.snippet ?? "").replace(/\s+/g, " ").trim();

  const read = (label: string): string | null => {
    const stops = [...LABELS.filter((entry) => entry !== label), ...TERMINATORS]
      .map((entry) => entry.replace(/\s/g, "\\s+"))
      .join("|");

    const pattern = new RegExp(
      `${label.replace(/\s/g, "\\s+")}\\s*:?\\s+(.+?)\\s*(?:${stops}|$)`,
      "i",
    );

    const value = text.match(pattern)?.[1]?.trim();
    return value || null;
  };

  const digits = (label: string): number | null => {
    const raw = read(label)?.replace(/[^\d]/g, "");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  // The subject carries "Name, School", which is the most reliable source for
  // both when the body is malformed.
  const subject = (message.subject ?? "").match(/[-–—]\s*(.+?)\s*,\s*(.+?)\s*$/);

  return {
    fullName: read("Full Name") ?? subject?.[1] ?? null,
    dob: read("Dob"),
    phone: read("Phone"),
    city: read("City"),
    state: read("State"),
    school: read("School") ?? subject?.[2] ?? null,
    schoolEmail: read("School Email")?.toLowerCase() ?? null,
    gradYear: read("Grad Year"),
    major: read("Major"),
    instagram: read("Instagram")?.replace(/^@/, "") ?? null,
    tiktok: read("Tiktok")?.replace(/^@/, "") ?? null,
    igFollowers: digits("Ig Followers"),
    ttFollowers: digits("Tt Followers"),
    niche: read("Niche"),
    why: read("Why"),
    utmSource: read("Utm source"),
    landingPage: read("Landing page"),
  };
}

/**
 * Is this the site telling us a student applied?
 *
 * Same sender as a brand inquiry, so the subject is the only thing separating
 * the two. Getting this wrong in either direction puts students on the
 * sponsorship board or brands in the recruiting list.
 */
export function isAmbassadorApplication(
  message: ScannedMessage,
  formSenders: Set<string>,
  subjectMatch: string,
): boolean {
  if (!formSenders.has(message.fromEmail.toLowerCase())) return false;
  return (message.subject ?? "").toLowerCase().includes(subjectMatch);
}

/** Total reach across both platforms, for sorting and the header figure. */
export function totalFollowers(ambassador: {
  ig_followers: number | null;
  tt_followers: number | null;
}): number {
  return (ambassador.ig_followers ?? 0) + (ambassador.tt_followers ?? 0);
}
