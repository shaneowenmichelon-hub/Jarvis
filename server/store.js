/* Persistence — Postgres if DATABASE_URL is set, otherwise local JSON file.
   Postgres path is what makes the app survive Render free-tier redeploys.
   Schema is a single row holding the whole store as JSONB — keeps the
   migration cost near zero and the data is tiny anyway. */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(__dirname, '..', 'data', 'store.json');

const DEFAULT = {
  /* Multi-account map: { [email]: { name, tokens, addedAt } }.
     Each account has its own OAuth tokens (with refresh_token + scope).
     primaryAccount is which one is used as the default sender. */
  accounts: {},
  primaryAccount: null,
  lastSync: null,
  threadState: {},     // { [sponsorId]: { lastOutbound, lastInbound, threadCount, threads: [{ account, threadId }] } }
  overrides: {},
  hardBounces: null,
  sentLog: [],
  /* Auto-discovered contacts (keyed by lowercase email). Each entry:
     { email, name, displayName, addedAt, lastSeen, firstSeenVia, dismissed } */
  discovered: {},
  lastDiscoveryAt: null,
};

const USE_PG = Boolean(process.env.DATABASE_URL);
let pgPool = null;
let pgReady = null;
let cache = null;

if (USE_PG) {
  pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Hosted providers (Neon, Supabase, Render PG) all require SSL but their
    // certs aren't in Node's trust store; this skips verification but still
    // encrypts. Fine for a single-user app talking to a managed service.
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
}

async function ensureFileDir() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function ensurePgSchema() {
  if (pgReady) return pgReady;
  pgReady = (async () => {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS jarvis_store (
        id INTEGER PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pgPool.query(`
      INSERT INTO jarvis_store (id, data)
      VALUES (1, $1::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, [JSON.stringify(DEFAULT)]);
  })();
  return pgReady;
}

async function pgLoad() {
  await ensurePgSchema();
  const res = await pgPool.query('SELECT data FROM jarvis_store WHERE id = 1');
  return res.rows[0]?.data || structuredClone(DEFAULT);
}

async function pgSave(data) {
  await ensurePgSchema();
  await pgPool.query(
    `UPDATE jarvis_store SET data = $1::jsonb, updated_at = NOW() WHERE id = 1`,
    [JSON.stringify(data)],
  );
}

async function fileLoad() {
  await ensureFileDir();
  if (!existsSync(STORE_PATH)) return structuredClone(DEFAULT);
  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8'));
  } catch {
    return structuredClone(DEFAULT);
  }
}

async function fileSave(data) {
  await ensureFileDir();
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/* Migrates the old single-account shape ({ tokens, user }) into the
   new multi-account shape ({ accounts, primaryAccount }) on first load.
   Idempotent — running on already-new data is a no-op. */
function migrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.tokens && raw.user?.email && (!raw.accounts || !Object.keys(raw.accounts).length)) {
    raw.accounts = {
      [raw.user.email]: {
        name: raw.user.name || raw.user.email,
        tokens: raw.tokens,
        addedAt: new Date().toISOString(),
      },
    };
    raw.primaryAccount = raw.user.email;
  }
  delete raw.tokens;
  delete raw.user;
  return raw;
}

export async function loadStore() {
  if (cache) return cache;
  const raw = USE_PG ? await pgLoad() : await fileLoad();
  const migrated = migrate(raw);
  cache = { ...DEFAULT, ...migrated };
  // If we migrated, persist the new shape so subsequent reads are clean.
  if (raw !== migrated || (raw.tokens === undefined && !cache.accounts)) {
    // no-op safeguard; the actual persist happens on first updateStore.
  }
  return cache;
}

async function persist() {
  if (USE_PG) await pgSave(cache);
  else await fileSave(cache);
}

export async function updateStore(patch) {
  await loadStore();
  cache = { ...cache, ...patch };
  await persist();
  return cache;
}

/* ---- multi-account helpers ---- */

export async function addAccount({ email, name, tokens }) {
  if (!email) throw new Error('email required');
  await loadStore();
  const accounts = { ...cache.accounts, [email]: { name: name || email, tokens, addedAt: cache.accounts[email]?.addedAt || new Date().toISOString() } };
  const primaryAccount = cache.primaryAccount || email;
  return updateStore({ accounts, primaryAccount });
}

export async function updateAccountTokens(email, tokens) {
  await loadStore();
  const existing = cache.accounts[email];
  if (!existing) return;
  const accounts = { ...cache.accounts, [email]: { ...existing, tokens: { ...existing.tokens, ...tokens } } };
  return updateStore({ accounts });
}

export async function removeAccount(email) {
  await loadStore();
  const accounts = { ...cache.accounts };
  delete accounts[email];
  const remainingEmails = Object.keys(accounts);
  const primaryAccount = cache.primaryAccount === email
    ? (remainingEmails[0] || null)
    : cache.primaryAccount;
  return updateStore({ accounts, primaryAccount });
}

export async function setPrimaryAccount(email) {
  await loadStore();
  if (!cache.accounts[email]) throw new Error(`unknown account: ${email}`);
  return updateStore({ primaryAccount: email });
}

export async function clearAllAccounts() {
  return updateStore({ accounts: {}, primaryAccount: null, threadState: {}, lastSync: null });
}

export async function setThreadState(s, t) { return updateStore({ threadState: s, lastSync: t }); }
export async function setHardBounces(n)    { return updateStore({ hardBounces: n }); }

export async function setOverride(sponsorId, patch) {
  await loadStore();
  const overrides = {
    ...cache.overrides,
    [sponsorId]: { ...(cache.overrides[sponsorId] || {}), ...patch },
  };
  return updateStore({ overrides });
}

export function storageBackend() {
  return USE_PG ? 'postgres' : 'file';
}

/* ---- discovered contacts ---- */

export async function upsertDiscovered(contact) {
  if (!contact?.email) return cache;
  await loadStore();
  const email = contact.email.toLowerCase();
  const existing = cache.discovered?.[email];
  const merged = {
    ...existing,
    ...contact,
    email,
    addedAt: existing?.addedAt || contact.addedAt || new Date().toISOString(),
    lastSeen: contact.lastSeen || new Date().toISOString(),
  };
  const discovered = { ...cache.discovered, [email]: merged };
  return updateStore({ discovered });
}

export async function bulkUpsertDiscovered(contactsMap) {
  await loadStore();
  const discovered = { ...cache.discovered };
  for (const [email, c] of contactsMap.entries()) {
    const lo = email.toLowerCase();
    const existing = discovered[lo];
    discovered[lo] = {
      ...existing,
      ...c,
      email: lo,
      addedAt: existing?.addedAt || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
  }
  return updateStore({ discovered, lastDiscoveryAt: new Date().toISOString() });
}

export async function dismissDiscovered(email) {
  await loadStore();
  const lo = email.toLowerCase();
  if (!cache.discovered?.[lo]) return cache;
  const discovered = { ...cache.discovered, [lo]: { ...cache.discovered[lo], dismissed: true } };
  return updateStore({ discovered });
}

export async function removeDiscovered(email) {
  await loadStore();
  const lo = email.toLowerCase();
  const discovered = { ...cache.discovered };
  delete discovered[lo];
  return updateStore({ discovered });
}
