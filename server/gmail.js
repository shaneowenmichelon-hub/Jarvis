/* Gmail sync — multi-account aware. For each connected Gmail account,
   for each sponsor with a contact email, fetch recent thread metadata
   and aggregate:
     - lastOutbound: most recent message FROM any of our accounts
     - lastInbound:  most recent message NOT from our accounts
     - threadCount:  total threads across all our accounts
     - threads:      [{ account, threadId, last }] for "open in Gmail" links
   Rate-limited so multiple callers within MIN_INTERVAL share one fetch. */

import { google } from 'googleapis';
import { getAllAuthorizedClients } from './auth.js';
import { loadStore, setThreadState } from './store.js';
import { SPONSORS, computeFollowUp } from './sponsors.js';

const MAX_THREADS_PER_SPONSOR = 5;
const MIN_INTERVAL_MS = (Number(process.env.SYNC_MIN_INTERVAL) || 30) * 1000;

let lastSyncAt = 0;
let inFlight = null;

export async function getStatus() {
  const store = await loadStore();
  const accounts = Object.entries(store.accounts || {}).map(([email, a]) => ({
    email,
    name: a.name,
    addedAt: a.addedAt,
    isPrimary: store.primaryAccount === email,
  }));
  return {
    connected: accounts.length > 0,
    accounts,
    primaryAccount: store.primaryAccount,
    lastSync: store.lastSync,
    sponsorsSynced: Object.keys(store.threadState || {}).length,
  };
}

export async function syncAllSponsors({ force = false } = {}) {
  if (inFlight) return inFlight;
  const now = Date.now();
  if (!force && now - lastSyncAt < MIN_INTERVAL_MS) {
    const store = await loadStore();
    return { threadState: store.threadState, lastSync: store.lastSync, cached: true };
  }

  inFlight = (async () => {
    try {
      const clients = await getAllAuthorizedClients();
      if (clients.length === 0) {
        return { threadState: {}, lastSync: null, connected: false };
      }

      const ourEmails = clients.map((c) => c.email.toLowerCase());
      const store = await loadStore();
      const threadState = { ...store.threadState };

      for (const sponsor of SPONSORS) {
        if (!sponsor.contact) continue;
        const merged = { lastOutbound: null, lastInbound: null, threads: [], threadCount: 0 };
        let lastOutTs = 0;
        let lastInTs = 0;

        for (const { email, client } of clients) {
          try {
            const partial = await syncSponsorForAccount(client, sponsor, ourEmails);
            if (partial.lastOutboundTs && partial.lastOutboundTs > lastOutTs) lastOutTs = partial.lastOutboundTs;
            if (partial.lastInboundTs && partial.lastInboundTs > lastInTs) lastInTs = partial.lastInboundTs;
            for (const t of partial.threads) merged.threads.push({ account: email, threadId: t });
          } catch (err) {
            console.error(`[sync] ${sponsor.name} via ${email} failed:`, err.message);
          }
        }

        merged.lastOutbound = lastOutTs ? new Date(lastOutTs).toISOString() : null;
        merged.lastInbound = lastInTs ? new Date(lastInTs).toISOString() : null;
        merged.threadCount = merged.threads.length;
        threadState[sponsor.id] = merged;
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

async function syncSponsorForAccount(client, sponsor, ourEmails) {
  const gmail = google.gmail({ version: 'v1', auth: client });
  const q = `from:${sponsor.contact} OR to:${sponsor.contact}`;
  const list = await gmail.users.threads.list({
    userId: 'me',
    q,
    maxResults: MAX_THREADS_PER_SPONSOR,
  });

  const threads = list.data.threads || [];
  if (threads.length === 0) return { lastOutboundTs: 0, lastInboundTs: 0, threads: [] };

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
      const from = (headers.find((h) => h.name === 'From')?.value || '').toLowerCase();
      const isFromUs = ourEmails.some((e) => from.includes(e));
      if (isFromUs && ts > lastOutboundTs) lastOutboundTs = ts;
      if (!isFromUs && ts > lastInboundTs) lastInboundTs = ts;
    }
  }

  return { lastOutboundTs, lastInboundTs, threads: threadIds };
}

/* Combine the static sponsor config + manual overrides + aggregated
   thread state into the shape the frontend renders. */
export async function getEnrichedSponsors() {
  const store = await loadStore();
  return SPONSORS.map((sponsor) => {
    const override = store.overrides[sponsor.id] || {};
    const merged = { ...sponsor, ...override };
    const thread = store.threadState[sponsor.id];
    const lastOutbound = thread?.lastOutbound ?? null;
    const lastInbound = thread?.lastInbound ?? null;
    const threadCount = thread?.threadCount ?? 0;
    const threads = thread?.threads ?? [];
    // Back-compat for older renderers that only knew threadIds:
    const threadIds = threads.map((t) => t.threadId);
    const followUpDue = computeFollowUp(merged, { lastOutbound, lastInbound });
    return {
      ...merged,
      lastOutbound,
      lastInbound,
      threadCount,
      threads,        // [{ account, threadId }]
      threadIds,      // [threadId]
      followUpDue,
    };
  });
}
