/* Gmail send. Enforces ZMM hard rules in code (not just in the prompt):
   - Always CCs CC_ALWAYS (defaults to zach@zmmevents.com)
   - Blocks any recipient matching BLOCKED_DOMAINS (Constellation Brands)
   - Logs every send to data/store.json for audit

   JARVIS drafts the email via the draft_email tool; the user reviews
   in the dashboard; this module is what actually puts it on the wire. */

import { google } from 'googleapis';
import { getAuthorizedClientFor, getPrimaryClient } from './auth.js';
import { loadStore, updateStore, upsertDiscovered } from './store.js';
import { SPONSORS } from './sponsors.js';
import { deriveCompanyName, parseAddresses, isNoise } from './discovery.js';

const CC_ALWAYS = process.env.CC_ALWAYS || 'zach@zmmevents.com';

const BLOCKED_DOMAINS = (process.env.BLOCKED_DOMAINS || 'cbrands.com,constellationbrands.com,constellation.com')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const BLOCKED_KEYWORDS = ['constellation brands'];

function emailDomain(addr) {
  const m = String(addr || '').match(/@([^>\s,]+)/);
  return m ? m[1].toLowerCase() : '';
}

export function checkBlocked({ to, cc, subject, body }) {
  const addrs = [to, cc].filter(Boolean).join(',');
  for (const a of addrs.split(',').map((s) => s.trim()).filter(Boolean)) {
    const dom = emailDomain(a);
    if (BLOCKED_DOMAINS.includes(dom)) {
      return `Hard block: ${dom} (Constellation Brands).`;
    }
  }
  const hay = `${subject || ''} ${body || ''}`.toLowerCase();
  for (const kw of BLOCKED_KEYWORDS) {
    if (hay.includes(kw)) return `Hard block: subject/body mentions "${kw}".`;
  }
  return null;
}

function buildMime({ to, cc, from, subject, body }) {
  const lines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].filter(Boolean);
  const raw = lines.join('\r\n');
  return Buffer.from(raw, 'utf8').toString('base64url');
}

/* Internal: build the Gmail-ready MIME + resolve from / hard-rule check.
   Shared by sendEmail and saveDraft so behavior is identical. */
/* Resolve which Gmail account to send from. Accepts an explicit
   accountEmail (when the user picks one from the draft card) or
   falls back to the primary account. */
async function resolveAccount(accountEmail) {
  if (accountEmail) {
    const client = await getAuthorizedClientFor(accountEmail);
    if (!client) throw new Error(`Account ${accountEmail} not connected.`);
    const store = await loadStore();
    const acct = store.accounts?.[accountEmail];
    return { email: accountEmail, name: acct?.name || accountEmail, client };
  }
  const primary = await getPrimaryClient();
  if (!primary) throw new Error('Gmail not connected. Click Connect Gmail to authorize.');
  const store = await loadStore();
  const acct = store.accounts?.[primary.email];
  return { email: primary.email, name: acct?.name || primary.email, client: primary.client };
}

async function buildGmailMessage({ to, subject, body, accountEmail }) {
  if (!to || !subject || !body) throw new Error('to, subject, and body are required');

  const blocked = checkBlocked({ to, cc: CC_ALWAYS, subject, body });
  if (blocked) {
    const err = new Error(blocked);
    err.code = 'BLOCKED';
    throw err;
  }

  const { email, name, client } = await resolveAccount(accountEmail);
  const from = `${name} <${email}>`;
  const gmail = google.gmail({ version: 'v1', auth: client });
  const raw = buildMime({ to, cc: CC_ALWAYS, from, subject, body });
  return { gmail, raw, account: { email, name } };
}

async function appendLog(entry) {
  const store = await loadStore();
  const log = [entry, ...(store.sentLog || [])].slice(0, 200);
  await updateStore({ sentLog: log });
}

/* Auto-register the recipient when we send/draft. Skips curated
   sponsors (they're already tracked) and noise addresses. Means new
   contacts appear in the pipeline within seconds of the send, instead
   of waiting for the next 5-min discovery scan. */
async function registerRecipient(toHeader, firstSeenVia) {
  const recipients = parseAddresses(toHeader);
  for (const r of recipients) {
    if (!r.email || isNoise(r.email)) continue;
    const isCurated = SPONSORS.some((s) => s.contact?.toLowerCase() === r.email);
    if (isCurated) continue;
    await upsertDiscovered({
      email: r.email,
      name: deriveCompanyName(r.email),
      displayName: r.name || null,
      firstSeenVia,
    });
  }
}

export async function sendEmail({ to, subject, body, threadId, accountEmail }) {
  const { gmail, raw, account } = await buildGmailMessage({ to, subject, body, accountEmail });

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, ...(threadId ? { threadId } : {}) },
  });

  const entry = {
    id: result.data.id,
    threadId: result.data.threadId,
    type: 'sent',
    account: account.email,
    to,
    cc: CC_ALWAYS,
    subject,
    bodyPreview: body.slice(0, 200),
    sentAt: new Date().toISOString(),
  };
  await appendLog(entry);
  await registerRecipient(to, account.email);
  return entry;
}

export async function saveDraft({ to, subject, body, threadId, accountEmail }) {
  const { gmail, raw, account } = await buildGmailMessage({ to, subject, body, accountEmail });

  const result = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw, ...(threadId ? { threadId } : {}) } },
  });

  const entry = {
    id: result.data.id,
    messageId: result.data.message?.id,
    threadId: result.data.message?.threadId,
    type: 'draft',
    account: account.email,
    to,
    cc: CC_ALWAYS,
    subject,
    bodyPreview: body.slice(0, 200),
    savedAt: new Date().toISOString(),
  };
  await appendLog(entry);
  await registerRecipient(to, account.email);
  return entry;
}

export async function getSentLog() {
  const store = await loadStore();
  return store.sentLog || [];
}

export function ccAddress() {
  return CC_ALWAYS;
}

/* ============================================================
   QUICK FOLLOW-UP — used by the send icon in the follow-up queue.
   Builds a personalized "checking back" reply: pulls a first name
   from the contact's display name or email local part (with sensible
   fallbacks for generic addresses like partnerships@), inserts the
   company name, and uses Shane's signature.
   ============================================================ */

const HONORIFICS = new Set(['mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'dr', 'dr.', 'prof', 'prof.']);

const GENERIC_LOCAL_PARTS = new Set([
  'team', 'partnerships', 'partnership', 'sponsorships', 'sponsorship',
  'info', 'hello', 'hi', 'contact', 'support', 'sales', 'partner',
  'sponsor', 'business', 'biz', 'media', 'press', 'brand', 'collab',
  'campus', 'marketing', 'pr', 'help', 'admin', 'general',
]);

export function extractFirstName(sponsor) {
  // Prefer the parsed display name from the email's From header.
  if (sponsor.displayName) {
    for (const word of sponsor.displayName.trim().split(/\s+/)) {
      const clean = word.toLowerCase().replace(/[.,]/g, '');
      if (HONORIFICS.has(clean)) continue;
      if (/^[A-Za-z][A-Za-z'-]+$/.test(word) && word.length >= 2) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
    }
  }
  // Fall back to the email local part if it looks like a name.
  if (sponsor.contact) {
    const local = sponsor.contact.split('@')[0].toLowerCase();
    if (!GENERIC_LOCAL_PARTS.has(local)) {
      const first = local.split(/[._-]/)[0];
      if (first && /^[a-z]+$/.test(first) && first.length >= 2 && first.length <= 20 && !GENERIC_LOCAL_PARTS.has(first)) {
        return first.charAt(0).toUpperCase() + first.slice(1);
      }
    }
  }
  return null;
}

export function buildQuickFollowUpMessage(sponsor) {
  const firstName = extractFirstName(sponsor);
  const greeting = firstName ? `Hey ${firstName},` : `Hey ${sponsor.name} team,`;
  const company = sponsor.name;
  const body = `${greeting}

Just checking back here to see if you have any interest sponsoring live music events. Did you have a chance to look at the deck?

If sponsorships/partnerships fall to another person at ${company}, could you forward me their contact? Sorry to bother.

Best,
Shane Michelon
President, ZMM Events`;
  return {
    subject: `Quick check-in — ${company} × ZMM`,
    body,
  };
}
