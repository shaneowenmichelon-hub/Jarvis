/* ZMM // SPONSOR COMMAND — backend
   Express server: OAuth, Gmail sync, sponsor API, JARVIS chat.
   In production, also serves the Vite-built SPA. */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import {
  isConfigured as oauthConfigured,
  getAuthUrl,
  exchangeCode,
  grantedScopeKeys,
  REQUIRED_SCOPE_KEYS,
} from './auth.js';
import { getStatus, syncAllSponsors, getEnrichedSponsors } from './gmail.js';
import { loadStore, clearTokens, setOverride, setHardBounces, storageBackend } from './store.js';
import { HARD_RULES, EVENTS, HARD_BOUNCES_DEFAULT } from './sponsors.js';
import { chat as jarvisChat, isEnabled as jarvisEnabled } from './jarvis.js';
import { isEnabled as ttsEnabled, streamTTS } from './tts.js';
import { sendEmail, saveDraft, checkBlocked, getSentLog, ccAddress } from './email.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const PROD = process.env.NODE_ENV === 'production';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

/* ---------- health ---------- */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    oauth_configured: oauthConfigured(),
    jarvis_enabled: jarvisEnabled(),
    tts_premium: ttsEnabled(),
    storage: storageBackend(),
  });
});

/* ---------- meta ---------- */
app.get('/api/meta', async (_req, res) => {
  const store = await loadStore();
  res.json({
    hardRules: HARD_RULES,
    events: EVENTS,
    hardBounces: store.hardBounces ?? HARD_BOUNCES_DEFAULT,
  });
});

app.post('/api/meta/hard-bounces', async (req, res) => {
  const n = Number(req.body?.value);
  if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'invalid value' });
  await setHardBounces(n);
  res.json({ ok: true, value: n });
});

/* ---------- auth ---------- */
app.get('/api/auth/status', async (_req, res) => {
  if (!oauthConfigured()) {
    return res.json({ connected: false, configured: false, hint: 'Set GOOGLE_CLIENT_ID/SECRET in .env' });
  }
  const status = await getStatus();
  const store = await loadStore();
  const scopes = grantedScopeKeys(store.tokens);
  const canSend = scopes.includes('gmail.compose');
  const missingScopes = REQUIRED_SCOPE_KEYS.filter((s) => !scopes.includes(s));
  res.json({ ...status, configured: true, scopes, canSend, missingScopes, ccAddress: ccAddress() });
});

app.get('/auth/google', (_req, res) => {
  if (!oauthConfigured()) return res.status(500).send('Google OAuth not configured.');
  res.redirect(getAuthUrl());
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code.');
  try {
    await exchangeCode(String(code));
    // Kick off an immediate sync so the dashboard has live data on first load.
    syncAllSponsors({ force: true }).catch((e) => console.error('initial sync failed:', e.message));
    // Bounce the user back to the SPA.
    const target = PROD ? '/' : 'http://localhost:5173/';
    res.redirect(target + '?connected=1');
  } catch (err) {
    console.error('OAuth exchange failed:', err);
    res.status(500).send('OAuth exchange failed: ' + err.message);
  }
});

app.post('/api/auth/logout', async (_req, res) => {
  await clearTokens();
  res.json({ ok: true });
});

/* ---------- sponsors ---------- */
app.get('/api/sponsors', async (req, res) => {
  const force = req.query.sync === '1';
  try {
    if (force) await syncAllSponsors({ force: true });
    else syncAllSponsors().catch((e) => console.error('background sync failed:', e.message));
    const sponsors = await getEnrichedSponsors();
    const status = await getStatus();
    res.json({ sponsors, lastSync: status.lastSync, connected: status.connected });
  } catch (err) {
    console.error('GET /api/sponsors failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sponsors/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = ['stage', 'value', 'notes', 'status', 'tier', 'event'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  await setOverride(id, patch);
  const sponsors = await getEnrichedSponsors();
  res.json({ ok: true, sponsor: sponsors.find((s) => s.id === id) });
});

app.post('/api/sponsors/:id/followup', async (req, res) => {
  /* Mark a sponsor as just-followed-up. This sets a local override so
     the follow-up due date pushes forward immediately; the real outbound
     timestamp will be confirmed on the next Gmail sync. */
  const { id } = req.params;
  const now = new Date().toISOString();
  await setOverride(id, { _manualLastOutbound: now });
  res.json({ ok: true });
});

/* ---------- jarvis chat ---------- */
app.post('/api/jarvis/chat', async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  try {
    const { text, draft } = await jarvisChat(messages);
    res.json({ text, draft, model: jarvisEnabled() ? 'claude-sonnet-4-5' : 'simulated' });
  } catch (err) {
    console.error('JARVIS chat failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------- jarvis send (approved draft → out the door) ---------- */
app.post('/api/jarvis/send', async (req, res) => {
  try {
    const { to, subject, body, threadId } = req.body || {};
    const entry = await sendEmail({ to, subject, body, threadId });
    res.json({ ok: true, entry, cc: ccAddress() });
  } catch (err) {
    console.error('Send failed:', err);
    const status = err.code === 'BLOCKED' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

/* ---------- jarvis save-to-drafts (lands in your Gmail Drafts folder) ---------- */
app.post('/api/jarvis/draft', async (req, res) => {
  try {
    const { to, subject, body, threadId } = req.body || {};
    const entry = await saveDraft({ to, subject, body, threadId });
    res.json({ ok: true, entry, cc: ccAddress() });
  } catch (err) {
    console.error('Save draft failed:', err);
    const status = err.code === 'BLOCKED' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

/* Dry-run: lets the frontend show "would be blocked" before user clicks send. */
app.post('/api/jarvis/check', (req, res) => {
  const { to, subject, body } = req.body || {};
  const blocked = checkBlocked({ to, cc: ccAddress(), subject, body });
  res.json({ blocked: !!blocked, reason: blocked, cc: ccAddress() });
});

/* ---------- sent log ---------- */
app.get('/api/email/log', async (_req, res) => {
  res.json({ entries: await getSentLog() });
});

/* ---------- jarvis voice (ElevenLabs) ---------- */
app.post('/api/jarvis/speak', async (req, res) => {
  try {
    await streamTTS(req.body?.text, res);
  } catch (err) {
    console.error('TTS failed:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

/* ---------- production: serve built SPA ---------- */
const distPath = resolve(__dirname, '..', 'dist');
if (PROD && existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(resolve(distPath, 'index.html')));
}

app.listen(PORT, () => {
  const mode = PROD ? 'production' : 'development';
  console.log(`\n  ZMM // SPONSOR COMMAND backend [${mode}]`);
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`  OAuth configured: ${oauthConfigured() ? 'yes' : 'no — set GOOGLE_CLIENT_ID/SECRET in .env'}`);
  console.log(`  JARVIS live mode: ${jarvisEnabled() ? 'yes' : 'no — set ANTHROPIC_API_KEY in .env'}`);
  console.log(`  Storage backend:  ${storageBackend()}${storageBackend() === 'file' ? ' (EPHEMERAL on Render free tier — set DATABASE_URL for persistence)' : ''}\n`);
});
