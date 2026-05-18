/* Gmail send. Enforces ZMM hard rules in code (not just in the prompt):
   - Always CCs CC_ALWAYS (defaults to zach@zmmevents.com)
   - Blocks any recipient matching BLOCKED_DOMAINS (Constellation Brands)
   - Logs every send to data/store.json for audit

   JARVIS drafts the email via the draft_email tool; the user reviews
   in the dashboard; this module is what actually puts it on the wire. */

import { google } from 'googleapis';
import { getAuthorizedClientFor, getPrimaryClient } from './auth.js';
import { loadStore, updateStore } from './store.js';

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
  return entry;
}

export async function getSentLog() {
  const store = await loadStore();
  return store.sentLog || [];
}

export function ccAddress() {
  return CC_ALWAYS;
}
