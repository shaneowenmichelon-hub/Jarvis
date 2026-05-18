/* Gmail send. Enforces ZMM hard rules in code (not just in the prompt):
   - Always CCs CC_ALWAYS (defaults to zach@zmmevents.com)
   - Blocks any recipient matching BLOCKED_DOMAINS (Constellation Brands)
   - Logs every send to data/store.json for audit

   JARVIS drafts the email via the draft_email tool; the user reviews
   in the dashboard; this module is what actually puts it on the wire. */

import { google } from 'googleapis';
import { getAuthorizedClient } from './auth.js';
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
async function buildGmailMessage({ to, subject, body }) {
  if (!to || !subject || !body) throw new Error('to, subject, and body are required');

  const blocked = checkBlocked({ to, cc: CC_ALWAYS, subject, body });
  if (blocked) {
    const err = new Error(blocked);
    err.code = 'BLOCKED';
    throw err;
  }

  const client = await getAuthorizedClient();
  if (!client) throw new Error('Gmail not connected.');

  const store = await loadStore();
  const fromEmail = store.user?.email;
  if (!fromEmail) throw new Error('User email unknown — reconnect Gmail.');
  const fromName = store.user?.name || 'Shane Michelon';
  const from = `${fromName} <${fromEmail}>`;

  const gmail = google.gmail({ version: 'v1', auth: client });
  const raw = buildMime({ to, cc: CC_ALWAYS, from, subject, body });
  return { gmail, raw, store };
}

async function appendLog(entry) {
  const store = await loadStore();
  const log = [entry, ...(store.sentLog || [])].slice(0, 200);
  await updateStore({ sentLog: log });
}

export async function sendEmail({ to, subject, body, threadId }) {
  const { gmail, raw } = await buildGmailMessage({ to, subject, body });

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, ...(threadId ? { threadId } : {}) },
  });

  const entry = {
    id: result.data.id,
    threadId: result.data.threadId,
    type: 'sent',
    to,
    cc: CC_ALWAYS,
    subject,
    bodyPreview: body.slice(0, 200),
    sentAt: new Date().toISOString(),
  };
  await appendLog(entry);
  return entry;
}

/* Save the email as a draft in the user's Gmail Drafts folder.
   They can review and send from any Gmail client. Hard rules still
   apply: CC is added, Constellation is blocked. */
export async function saveDraft({ to, subject, body, threadId }) {
  const { gmail, raw } = await buildGmailMessage({ to, subject, body });

  const result = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: { raw, ...(threadId ? { threadId } : {}) },
    },
  });

  const entry = {
    id: result.data.id,                          // draft ID
    messageId: result.data.message?.id,          // underlying message ID
    threadId: result.data.message?.threadId,
    type: 'draft',
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
