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
  tokens: null,        // { access_token, refresh_token, expiry_date, scope, token_type }
  user: null,          // { email, name }
  lastSync: null,      // ISO timestamp
  threadState: {},     // { [sponsorId]: { lastOutbound, lastInbound, threadCount, threadIds } }
  overrides: {},       // { [sponsorId]: { stage?, value?, notes?, status? } } — manual edits
  hardBounces: null,   // number — manual override of bounce count
  sentLog: [],         // [{ type: 'sent'|'draft', to, cc, subject, ... }] — audit trail
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

export async function loadStore() {
  if (cache) return cache;
  const raw = USE_PG ? await pgLoad() : await fileLoad();
  cache = { ...DEFAULT, ...raw };
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

export async function setTokens(tokens)    { return updateStore({ tokens }); }
export async function clearTokens()        { return updateStore({ tokens: null, user: null, threadState: {}, lastSync: null }); }
export async function setUser(user)        { return updateStore({ user }); }
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
