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
const DEEP_MAX_THREADS_PER_SPONSOR = 50;  // upper bound to keep total scan time bounded
const DEEP_PAGE_SIZE = 25;
const MIN_INTERVAL_MS = (Number(process.env.SYNC_MIN_INTERVAL) || 30) * 1000;

let lastSyncAt = 0;
let inFlight = null;

/* Deep sync state. Lives in memory; lost on server restart, which is
   fine — the user just retriggers. Frontend polls /api/sync/status. */
const deepSyncState = {
  running: false,
  progress: null,     // { sponsorsDone, totalSponsors, currentSponsor, accounts }
  lastResult: null,
  lastDeepSync: null,
};

export function getDeepSyncState() {
  return { ...deepSyncState };
}

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
    // Manual "MARK FOLLOWED UP" override takes precedence if it's newer
    // than what Gmail last reported. That way the dashboard updates
    // immediately even before the next sync confirms the send.
    const gmailLastOutbound = thread?.lastOutbound ?? null;
    const manualLastOutbound = override._manualLastOutbound ?? null;
    const lastOutbound =
      manualLastOutbound && (!gmailLastOutbound || new Date(manualLastOutbound) > new Date(gmailLastOutbound))
        ? manualLastOutbound
        : gmailLastOutbound;
    const lastInbound = thread?.lastInbound ?? null;
    const threadCount = thread?.threadCount ?? 0;
    const threads = thread?.threads ?? [];
    const messageCount = thread?.messageCount ?? null;
    const firstContact = thread?.firstContact ?? null;
    const threadIds = threads.map((t) => t.threadId);
    const followUpDue = computeFollowUp(merged, { lastOutbound, lastInbound });
    return {
      ...merged,
      lastOutbound,
      lastInbound,
      threadCount,
      threads,
      threadIds,
      messageCount,
      firstContact,
      followUpDue,
    };
  });
}

/* ============================================================
   DEEP SYNC — scans every email across every connected inbox.
   Same aggregation logic as the regular sync but with no thread cap
   (well, capped at 50 per sponsor per account for sanity), full
   pagination, and progress reported via deepSyncState.
   ============================================================ */
export function startDeepSync() {
  if (deepSyncState.running) {
    return { started: false, reason: 'already_running', progress: deepSyncState.progress };
  }
  runDeepSync().catch((err) => {
    console.error('[deep-sync] unhandled:', err);
  });
  return { started: true };
}

async function runDeepSync() {
  deepSyncState.running = true;
  deepSyncState.progress = { sponsorsDone: 0, totalSponsors: 0, currentSponsor: null, accounts: 0 };
  const startedAt = Date.now();

  try {
    const clients = await getAllAuthorizedClients();
    if (clients.length === 0) {
      deepSyncState.lastResult = { ok: false, error: 'No Gmail accounts connected.' };
      return;
    }

    const ourEmails = clients.map((c) => c.email.toLowerCase());
    const sponsorsWithContact = SPONSORS.filter((s) => s.contact);
    deepSyncState.progress.totalSponsors = sponsorsWithContact.length;
    deepSyncState.progress.accounts = clients.length;

    const threadState = {};
    let totalThreads = 0;
    let totalMessages = 0;

    for (const sponsor of sponsorsWithContact) {
      deepSyncState.progress.currentSponsor = sponsor.name;

      let lastOutTs = 0;
      let lastInTs = 0;
      let firstTs = Infinity;
      let messageCount = 0;
      const allThreads = [];

      for (const { email, client } of clients) {
        try {
          const partial = await deepSyncSponsorForAccount(client, sponsor, ourEmails);
          if (partial.lastOutboundTs > lastOutTs) lastOutTs = partial.lastOutboundTs;
          if (partial.lastInboundTs > lastInTs) lastInTs = partial.lastInboundTs;
          if (partial.firstTs && partial.firstTs < firstTs) firstTs = partial.firstTs;
          messageCount += partial.messageCount;
          for (const t of partial.threads) allThreads.push({ account: email, threadId: t });
        } catch (err) {
          console.error(`[deep-sync] ${sponsor.name} via ${email}:`, err.message);
        }
      }

      threadState[sponsor.id] = {
        lastOutbound: lastOutTs ? new Date(lastOutTs).toISOString() : null,
        lastInbound: lastInTs ? new Date(lastInTs).toISOString() : null,
        firstContact: isFinite(firstTs) ? new Date(firstTs).toISOString() : null,
        messageCount,
        threadCount: allThreads.length,
        threads: allThreads,
      };

      totalThreads += allThreads.length;
      totalMessages += messageCount;
      deepSyncState.progress.sponsorsDone++;
    }

    const lastSync = new Date().toISOString();
    await setThreadState(threadState, lastSync);
    lastSyncAt = Date.now();
    deepSyncState.lastDeepSync = lastSync;
    deepSyncState.lastResult = {
      ok: true,
      durationMs: Date.now() - startedAt,
      counts: {
        accounts: clients.length,
        sponsors: sponsorsWithContact.length,
        threads: totalThreads,
        messages: totalMessages,
      },
    };
  } catch (err) {
    console.error('[deep-sync] failed:', err);
    deepSyncState.lastResult = { ok: false, error: err.message };
  } finally {
    deepSyncState.running = false;
    deepSyncState.progress = null;
  }
}

async function deepSyncSponsorForAccount(client, sponsor, ourEmails) {
  const gmail = google.gmail({ version: 'v1', auth: client });
  const q = `from:${sponsor.contact} OR to:${sponsor.contact}`;

  // Paginate through all matching threads up to the cap.
  const allThreads = [];
  let pageToken;
  while (allThreads.length < DEEP_MAX_THREADS_PER_SPONSOR) {
    const remaining = DEEP_MAX_THREADS_PER_SPONSOR - allThreads.length;
    const list = await gmail.users.threads.list({
      userId: 'me',
      q,
      maxResults: Math.min(DEEP_PAGE_SIZE, remaining),
      pageToken,
    });
    const threads = list.data.threads || [];
    allThreads.push(...threads);
    if (!list.data.nextPageToken || threads.length === 0) break;
    pageToken = list.data.nextPageToken;
  }

  if (allThreads.length === 0) {
    return { lastOutboundTs: 0, lastInboundTs: 0, firstTs: 0, threads: [], messageCount: 0 };
  }

  let lastOutboundTs = 0;
  let lastInboundTs = 0;
  let firstTs = Infinity;
  let messageCount = 0;
  const threadIds = [];

  for (const t of allThreads) {
    threadIds.push(t.id);
    const det = await gmail.users.threads.get({
      userId: 'me',
      id: t.id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Date'],
    });
    const messages = det.data.messages || [];
    messageCount += messages.length;
    for (const m of messages) {
      const ts = Number(m.internalDate);
      if (!ts) continue;
      const headers = m.payload?.headers || [];
      const from = (headers.find((h) => h.name === 'From')?.value || '').toLowerCase();
      const isFromUs = ourEmails.some((e) => from.includes(e));
      if (isFromUs && ts > lastOutboundTs) lastOutboundTs = ts;
      if (!isFromUs && ts > lastInboundTs) lastInboundTs = ts;
      if (ts < firstTs) firstTs = ts;
    }
  }

  return { lastOutboundTs, lastInboundTs, firstTs: isFinite(firstTs) ? firstTs : 0, threads: threadIds, messageCount };
}
