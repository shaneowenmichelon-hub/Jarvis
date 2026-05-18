/* Today's email volume — sent + received counts across all connected
   inboxes, computed by date-filtered Gmail search. Cached server-side
   so the frontend can refresh aggressively without hitting Gmail every
   tick. */

import { google } from 'googleapis';
import { getAllAuthorizedClients } from './auth.js';

const CACHE_MS = 60 * 1000;
const MAX_PAGES = 10; // hard cap so a runaway inbox can't burn the request

let cache = null;
let cacheAt = 0;

function today() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

async function countMessages(gmail, q) {
  let count = 0;
  let pageToken;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: 500,
      pageToken,
    });
    count += (res.data.messages || []).length;
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return count;
}

export async function getTodayStats({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;

  const clients = await getAllAuthorizedClients();
  if (clients.length === 0) {
    cache = { connected: false, sent: 0, received: 0, perAccount: [], date: today(), asOf: new Date().toISOString() };
    cacheAt = Date.now();
    return cache;
  }

  const dateStr = today();
  const perAccount = [];
  let totalSent = 0;
  let totalReceived = 0;

  // Parallel across accounts; each pair (sent + received) runs in parallel
  // within the account too.
  await Promise.all(
    clients.map(async ({ email, client }) => {
      const gmail = google.gmail({ version: 'v1', auth: client });
      try {
        const [sent, received] = await Promise.all([
          countMessages(gmail, `from:me after:${dateStr}`),
          countMessages(gmail, `to:me after:${dateStr}`),
        ]);
        perAccount.push({ email, sent, received });
        totalSent += sent;
        totalReceived += received;
      } catch (err) {
        console.error(`[stats] ${email} failed:`, err.message);
        perAccount.push({ email, sent: 0, received: 0, error: err.message });
      }
    }),
  );

  // Keep the per-account list in a stable order so the UI doesn't reshuffle.
  perAccount.sort((a, b) => a.email.localeCompare(b.email));

  cache = {
    connected: true,
    sent: totalSent,
    received: totalReceived,
    perAccount,
    date: dateStr,
    asOf: new Date().toISOString(),
  };
  cacheAt = Date.now();
  return cache;
}
