/**
 * Gmail access.
 *
 * Deliberately built on plain `fetch` against the REST API rather than the
 * `googleapis` package: that package is tens of megabytes and would dominate
 * the serverless bundle for the four endpoints we actually call.
 *
 * The scope requested is `gmail.readonly`. This dashboard reads the inbox and
 * never sends, labels, or deletes anything.
 */

import type { Direction, ScannedMessage, ScannedThread } from "./types";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
];

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    // Both are required to be handed a refresh token: offline for the token at
    // all, consent to be handed a fresh one on re-authorisation.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

export interface TokenExchange {
  accessToken: string;
  refreshToken: string | null;
  email: string | null;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<TokenExchange> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    email: data.id_token ? emailFromIdToken(data.id_token) : null,
  };
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    // `invalid_grant` means the refresh token is dead — revoked, password
    // changed, or unused for six months. Say so plainly; it needs a reconnect.
    if (body.includes("invalid_grant")) {
      throw new GmailAuthError(
        "Gmail refresh token is no longer valid. Reconnect the inbox from Settings.",
      );
    }
    throw new Error(`Token refresh failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export class GmailAuthError extends Error {}

function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const claims = JSON.parse(json) as { email?: string };
    return claims.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function gmailFetch<T>(
  accessToken: string,
  path: string,
  params: Record<string, string | string[]> = {},
): Promise<T> {
  const url = new URL(`${GMAIL_API}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, value);
    }
  }

  // Gmail rate-limits per user; a short backoff is enough to ride it out.
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (response.ok) return (await response.json()) as T;

    lastError = `${response.status} ${await response.text()}`;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable) break;
    await sleep(2 ** attempt * 500);
  }

  throw new Error(`Gmail API ${path} failed: ${lastError}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * List thread ids matching a query, following pagination up to `limit`.
 *
 * `in:anywhere` is deliberate — it picks up threads that have been archived,
 * which is where a lot of answered mail ends up.
 */
export async function listThreadIds(
  accessToken: string,
  query: string,
  limit = 500,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const page: { threads?: { id: string }[]; nextPageToken?: string } = await gmailFetch(
      accessToken,
      "/threads",
      {
        q: query,
        maxResults: String(Math.min(100, limit - ids.length)),
        ...(pageToken ? { pageToken } : {}),
      },
    );

    for (const thread of page.threads ?? []) ids.push(thread.id);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < limit);

  return ids;
}

interface RawHeader {
  name: string;
  value: string;
}

interface RawPart {
  mimeType?: string;
  filename?: string;
  headers?: RawHeader[];
  body?: { data?: string; size?: number };
  parts?: RawPart[];
}

interface RawMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: RawPart;
}

interface RawThread {
  id: string;
  messages?: RawMessage[];
}

export interface FetchThreadOptions {
  /** Pull message bodies too. Only worth it for threads being classified. */
  withBody: boolean;
  /** Every address that counts as "us", lowercased. */
  ownAddresses: Set<string>;
  /** Domains we own, so a forward to a teammate is recognised as internal. */
  ownDomains: Set<string>;
}

export async function fetchThread(
  accessToken: string,
  threadId: string,
  options: FetchThreadOptions,
): Promise<ScannedThread> {
  const raw = await gmailFetch<RawThread>(accessToken, `/threads/${threadId}`, {
    format: options.withBody ? "full" : "metadata",
    ...(options.withBody
      ? {}
      : {
          metadataHeaders: [
            "From",
            "To",
            "Cc",
            "Subject",
            "Date",
            "List-Unsubscribe",
            "List-Id",
            "Precedence",
            "Auto-Submitted",
          ],
        }),
  });

  return {
    id: raw.id,
    messages: (raw.messages ?? []).map((message) =>
      parseMessage(message, options.ownAddresses, options.ownDomains, options.withBody),
    ),
  };
}

/** Run `worker` over `items` with a small concurrency cap. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseMessage(
  message: RawMessage,
  ownAddresses: Set<string>,
  ownDomains: Set<string>,
  withBody: boolean,
): ScannedMessage {
  const headers = headerMap(message.payload?.headers ?? []);
  const from = parseAddress(headers["from"] ?? "");
  const labelIds = message.labelIds ?? [];

  const direction = directionOf(labelIds, from.email, ownAddresses);
  const toEmails = parseAddressList(headers["to"] ?? "");
  const ccEmails = parseAddressList(headers["cc"] ?? "");

  return {
    id: message.id,
    threadId: message.threadId,
    direction,
    internal: direction === "outbound" && !reachesOutside([...toEmails, ...ccEmails], ownAddresses, ownDomains),
    fromEmail: from.email,
    fromName: from.name,
    toEmails,
    ccEmails,
    subject: headers["subject"] ?? null,
    snippet: decodeEntities(message.snippet ?? "") || null,
    sentAt: new Date(Number(message.internalDate ?? 0)).toISOString(),
    labelIds,
    headers,
    ...(withBody ? { body: extractPlainText(message.payload) } : {}),
  };
}

/**
 * Did this message actually leave the building?
 *
 * A message addressed only to teammates has not answered anyone outside, no
 * matter that Gmail stamped it SENT.
 */
export function reachesOutside(
  recipients: string[],
  ownAddresses: Set<string>,
  ownDomains: Set<string>,
): boolean {
  return recipients.some((address) => {
    const normalized = address.toLowerCase();
    if (ownAddresses.has(normalized)) return false;

    const at = normalized.lastIndexOf("@");
    if (at === -1) return true;

    const domain = normalized.slice(at + 1);
    if (ownDomains.has(domain)) return false;
    // A subdomain of one of ours is still ours.
    return ![...ownDomains].some((own) => domain.endsWith(`.${own}`));
  });
}

/**
 * Which way a message went.
 *
 * Gmail's own SENT label is the reliable signal — it survives aliases, send-as
 * addresses, and delegated accounts. The address check is the fallback for mail
 * sent by a teammate from another client and only received here.
 */
export function directionOf(
  labelIds: string[],
  fromEmail: string,
  ownAddresses: Set<string>,
): Direction {
  if (labelIds.includes("SENT")) return "outbound";
  if (fromEmail && ownAddresses.has(fromEmail.toLowerCase())) return "outbound";
  return "inbound";
}

function headerMap(headers: RawHeader[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers) map[header.name.toLowerCase()] = header.value;
  return map;
}

export function parseAddress(value: string): { name: string | null; email: string } {
  const angled = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (angled) {
    const name = angled[1].replace(/^["']|["']$/g, "").trim();
    return { name: name || null, email: angled[2].trim().toLowerCase() };
  }
  return { name: null, email: value.trim().toLowerCase() };
}

export function parseAddressList(value: string): string[] {
  if (!value) return [];
  return splitAddresses(value)
    .map((part) => parseAddress(part).email)
    .filter(Boolean);
}

/** Split on commas that are not inside a quoted display name. */
function splitAddresses(value: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of value) {
    if (char === '"') inQuotes = !inQuotes;
    if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) out.push(current);
  return out.map((part) => part.trim()).filter(Boolean);
}

/** Walk the MIME tree for the first text/plain part, falling back to HTML. */
export function extractPlainText(payload: RawPart | undefined): string {
  if (!payload) return "";

  const plain = findPart(payload, "text/plain");
  if (plain) return decodeBody(plain);

  const html = findPart(payload, "text/html");
  if (html) return stripHtml(decodeBody(html));

  return "";
}

function findPart(part: RawPart, mimeType: string): RawPart | null {
  if (part.mimeType === mimeType && part.body?.data && !part.filename) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function decodeBody(part: RawPart): string {
  const data = part.body?.data;
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
