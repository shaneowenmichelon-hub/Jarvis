/** Environment access, in one place, with the parsing done once. */

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/** Addresses allowed to sign in. */
export function allowedEmails(): Set<string> {
  return new Set(list(process.env.ALLOWED_EMAILS));
}

/** Optionally let anyone on the agency domain in, e.g. "zmmevents.com". */
export function allowedDomain(): string | null {
  const value = process.env.ALLOWED_DOMAIN?.trim().toLowerCase();
  return value || null;
}

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  if (allowedEmails().has(normalized)) return true;

  const domain = allowedDomain();
  if (domain && normalized.endsWith(`@${domain}`)) return true;

  return false;
}

/**
 * Domains we own. Mail from these is internal and never a submission.
 * Defaults to the sign-in domain so there is one fewer thing to configure.
 */
export function ownDomains(): Set<string> {
  const explicit = list(process.env.OWN_DOMAINS);
  if (explicit.length > 0) return new Set(explicit);

  const domain = allowedDomain();
  return new Set(domain ? [domain] : []);
}

/**
 * Every address that counts as "us" when deciding a message's direction:
 * the allowlist, plus any extra send-as aliases.
 */
export function ownAddresses(connectedInbox?: string | null): Set<string> {
  const addresses = new Set<string>([...allowedEmails(), ...list(process.env.OWN_ADDRESSES)]);
  if (connectedInbox) addresses.add(connectedInbox.toLowerCase());
  return addresses;
}

/**
 * Addresses the collegiateagency.com form sends its notifications from.
 *
 * This is the front door: intake is these messages and nothing else, so an
 * address that stops matching means the board silently stops filling. If the
 * site's sending address ever changes, change it here.
 */
export function formSenders(): Set<string> {
  const configured = list(process.env.FORM_SENDER);
  return new Set(configured.length > 0 ? configured : ["no-reply@zmmevents.com"]);
}

/**
 * Subject phrase that marks a brand submission.
 *
 * Sender alone is not enough — ambassador applications arrive from the same
 * address, and those are people applying to work campus, not brands buying.
 */
export function formSubjectMatch(): string {
  return (process.env.FORM_SUBJECT_MATCH ?? "brand inquiry").trim().toLowerCase();
}


/** How far back the very first scan reaches. */
export function backfillDays(): number {
  const parsed = Number(process.env.SCAN_BACKFILL_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 180;
}

/** Cap on threads fetched per run, so one scan cannot run away. */
export function scanThreadLimit(): number {
  const parsed = Number(process.env.SCAN_THREAD_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 400;
}

/** The app's own origin, for OAuth redirects. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
