/* Gmail sync — for each configured sponsor, search Gmail for threads
   involving that sponsor's contact email, then derive:
     - lastOutbound: most recent message from the user
     - lastInbound:  most recent message from anyone else
     - threadCount:  number of distinct threads
     - threadIds:    list of Gmail thread IDs (so the UI can deep-link)

   Calls are metadata-only and capped to MAX_THREADS_PER_SPONSOR to
   stay well inside Gmail API quota (1B units/day, 250 units/user/s).
   Each thread metadata fetch costs 10 quota units. */

import { google } from 'googleapis';
import { getAuthorizedClient } from './auth.js';
import { loadStore, setThreadState } from './store.js';
import { SPONSORS, computeFollowUp } from './sponsors.js';

const MAX_THREADS_PER_SPONSOR = 5;
const MIN_INTERVAL_MS = (Number(process.env.SYNC_MIN_INTERVAL) || 30) * 1000;

let lastSyncAt = 0;
let inFlight = null;

export async function getStatus() {
  const store = await loadStore();
  return {
    connected: Boolean(store.tokens),
    user: store.user,
    lastSync: store.lastSync,
    sponsorsSynced: Object.keys(store.threadState || {}).length,
  };
}

/* Sync all sponsors. Returns the new threadState map.
   Rate-limited — multiple callers within MIN_INTERVAL share one fetch. */
export async function syncAllSponsors({ force = false } = {}) {
  if (inFlight) return inFlight;
  const now = Date.now();
  if (!force && now - lastSyncAt < MIN_INTERVAL_MS) {
    const store = await loadStore();
    return { threadState: store.threadState, lastSync: store.lastSync, cached: true };
  }

  inFlight = (async () => {
    try {
      const client = await getAuthorizedClient();
      if (!client) return { threadState: {}, lastSync: null, connected: false };

      const gmail = google.gmail({ version: 'v1', auth: client });
      const store = await loadStore();
      const userEmail = (store.user?.email || '').toLowerCase();

      const threadState = { ...store.threadState };

      for (const sponsor of SPONSORS) {
        if (!sponsor.contact) continue; // BLOCKED entries skipped
        try {
          threadState[sponsor.id] = await syncSponsor(gmail, sponsor, userEmail);
        } catch (err) {
          console.error(`[sync] ${sponsor.name} failed:`, err.message);
        }
      }

      const lastSync = new Date().toISOString();
      await setThreadState(threadState, lastSync);
      lastSyncAt = Date.now();
      return { threadState, lastSync, connected: true };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

async function syncSponsor(gmail, sponsor, userEmail) {
  const q = `from:${sponsor.contact} OR to:${sponsor.contact}`;
  const list = await gmail.users.threads.list({
    userId: 'me',
    q,
    maxResults: MAX_THREADS_PER_SPONSOR,
  });

  const threads = list.data.threads || [];
  if (threads.length === 0) {
    return { lastOutbound: null, lastInbound: null, threadCount: 0, threadIds: [] };
  }

  let lastOutboundTs = 0;
  let lastInboundTs = 0;
  const threadIds = [];

  for (const t of threads) {
    threadIds.push(t.id);
    const det = await gmail.users.threads.get({
      userId: 'me',
      id: t.id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Date'],
    });
    const messages = det.data.messages || [];
    for (const m of messages) {
      const ts = Number(m.internalDate);
      if (!ts) continue;
      const headers = m.payload?.headers || [];
      const from = headers.find((h) => h.name === 'From')?.value || '';
      const isFromUser = userEmail && from.toLowerCase().includes(userEmail);
      if (isFromUser && ts > lastOutboundTs) lastOutboundTs = ts;
      if (!isFromUser && ts > lastInboundTs) lastInboundTs = ts;
    }
  }

  return {
    lastOutbound: lastOutboundTs ? new Date(lastOutboundTs).toISOString() : null,
    lastInbound: lastInboundTs ? new Date(lastInboundTs).toISOString() : null,
    threadCount: threads.length,
    threadIds,
  };
}

/* Combine the static sponsor config + manual overrides + live thread state
   into the shape the frontend renders. */
export async function getEnrichedSponsors() {
  const store = await loadStore();
  return SPONSORS.map((sponsor) => {
    const override = store.overrides[sponsor.id] || {};
    const merged = { ...sponsor, ...override };
    const thread = store.threadState[sponsor.id];
    const lastOutbound = thread?.lastOutbound ?? null;
    const lastInbound = thread?.lastInbound ?? null;
    const threadCount = thread?.threadCount ?? 0;
    const threadIds = thread?.threadIds ?? [];
    const followUpDue = computeFollowUp(merged, thread);
    return {
      ...merged,
      lastOutbound,
      lastInbound,
      threadCount,
      threadIds,
      followUpDue,
    };
  });
}
