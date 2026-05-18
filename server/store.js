/* JSON-file persistence. Single-user app, small data — file is fine.
   Stores: OAuth tokens, user profile, last sync state, per-sponsor overrides. */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(__dirname, '..', 'data', 'store.json');

const DEFAULT = {
  tokens: null,        // { access_token, refresh_token, expiry_date, scope, token_type }
  user: null,          // { email, name }
  lastSync: null,      // ISO timestamp
  threadState: {},     // { [sponsorId]: { lastOutbound, lastInbound, threadCount, threadIds } }
  overrides: {},       // { [sponsorId]: { stage?, value?, notes?, status? } } — manual edits
  hardBounces: null,   // number — manual override of bounce count
};

let cache = null;

async function ensureDir() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

export async function loadStore() {
  if (cache) return cache;
  await ensureDir();
  if (!existsSync(STORE_PATH)) {
    cache = structuredClone(DEFAULT);
    await persist();
    return cache;
  }
  try {
    const raw = await readFile(STORE_PATH, 'utf8');
    cache = { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    cache = structuredClone(DEFAULT);
  }
  return cache;
}

async function persist() {
  await ensureDir();
  await writeFile(STORE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

export async function updateStore(patch) {
  await loadStore();
  cache = { ...cache, ...patch };
  await persist();
  return cache;
}

export async function setTokens(tokens) {
  return updateStore({ tokens });
}

export async function clearTokens() {
  return updateStore({ tokens: null, user: null, threadState: {}, lastSync: null });
}

export async function setUser(user) {
  return updateStore({ user });
}

export async function setThreadState(threadState, lastSync) {
  return updateStore({ threadState, lastSync });
}

export async function setOverride(sponsorId, patch) {
  await loadStore();
  const overrides = { ...cache.overrides, [sponsorId]: { ...(cache.overrides[sponsorId] || {}), ...patch } };
  return updateStore({ overrides });
}

export async function setHardBounces(n) {
  return updateStore({ hardBounces: n });
}
