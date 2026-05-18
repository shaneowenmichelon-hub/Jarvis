/* Auto-discovery — finds external contacts in recent sent mail across
   all connected Gmail accounts and registers them as auto-tracked
   sponsors. They show up alongside the curated SPONSORS list with an
   AUTO badge. The user (or JARVIS) can promote them to a proper stage
   later via update_sponsor. */

import { google } from 'googleapis';

const NOISE_PREFIXES = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'notifications', 'notification', 'mailer-daemon', 'postmaster',
  'bounces', 'auto-reply', 'autoreply', 'reply',
  'support', 'help', 'billing', 'admin', 'team@google',
];

const NOISE_DOMAINS = new Set([
  'calendar-notification.google.com',
  'docusignmail.com',
  'em.docusign.net',
  'mail.docusign.com',
  'mail.notion.so',
  'mail.intercom.com',
  'em.calendly.com',
  'calendly.com',
  'mailtrack.io',
  'mixpanel.com',
  'amazonses.com',
  'sendgrid.net',
  'mailgun.org',
  'stripe.com',
  'hello.zoom.us',
  'no-reply.zoom.us',
]);

/* Pull every email address out of a header value. Handles
   "Name <email>" and bare "email" forms, comma-separated lists. */
export function parseAddresses(header) {
  if (!header) return [];
  return header.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((chunk) => {
    chunk = chunk.trim();
    const angle = chunk.match(/^"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
    if (angle) return { name: angle[1].trim(), email: angle[2].trim().toLowerCase() };
    const bare = chunk.match(/^([^\s<>,]+@[^\s<>,]+)$/);
    if (bare) return { name: null, email: bare[1].toLowerCase() };
    return null;
  }).filter(Boolean);
}

export function isNoise(email) {
  if (!email || !email.includes('@')) return true;
  const [prefix, domain] = email.toLowerCase().split('@');
  if (!domain) return true;
  if (NOISE_DOMAINS.has(domain)) return true;
  for (const p of NOISE_PREFIXES) {
    if (prefix === p || prefix.startsWith(p + '+') || prefix.startsWith(p + '-')) return true;
  }
  return false;
}

/* "partnerships@polymarket.com" -> "Polymarket" */
export function deriveCompanyName(email) {
  if (!email) return 'Unknown';
  const domain = (email.split('@')[1] || '').toLowerCase();
  if (!domain) return 'Unknown';
  // strip subdomains like "partnerships.brand.com" → "brand.com"
  const parts = domain.split('.');
  const head = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return head.charAt(0).toUpperCase() + head.slice(1);
}

/* Run discovery across all connected accounts. Returns a map keyed by
   contact email. options.days controls how far back to look. */
export async function discoverContacts(clients, ourEmails, knownContacts, options = {}) {
  const days = options.days || 1;
  const maxThreadsPerAccount = options.maxThreads || 100;
  const known = new Set((knownContacts || []).map((c) => (c || '').toLowerCase()));
  const selves = new Set(ourEmails.map((e) => e.toLowerCase()));

  const found = new Map();

  for (const { email: accountEmail, client } of clients) {
    try {
      const gmail = google.gmail({ version: 'v1', auth: client });
      const q = `from:me newer_than:${days}d`;
      let threads = [];
      let pageToken;
      while (threads.length < maxThreadsPerAccount) {
        const list = await gmail.users.threads.list({
          userId: 'me',
          q,
          maxResults: Math.min(50, maxThreadsPerAccount - threads.length),
          pageToken,
        });
        threads.push(...(list.data.threads || []));
        if (!list.data.nextPageToken || (list.data.threads || []).length === 0) break;
        pageToken = list.data.nextPageToken;
      }

      for (const t of threads) {
        try {
          const det = await gmail.users.threads.get({
            userId: 'me',
            id: t.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Cc'],
          });
          const messages = det.data.messages || [];
          let otherParty = null;
          let lastTs = 0;

          for (const m of messages) {
            const ts = Number(m.internalDate);
            if (ts > lastTs) lastTs = ts;
            const headers = m.payload?.headers || [];
            const fromHeader = headers.find((h) => h.name === 'From')?.value;
            const from = parseAddresses(fromHeader)[0];
            if (!from) continue;

            if (selves.has(from.email)) {
              // We sent it; other party is in To
              const toAddrs = parseAddresses(headers.find((h) => h.name === 'To')?.value);
              const external = toAddrs.find((a) => !selves.has(a.email));
              if (external && (!otherParty || (external.name && !otherParty.name))) {
                otherParty = external;
              }
            } else {
              if (!otherParty || (from.name && !otherParty.name)) {
                otherParty = from;
              }
            }
          }

          if (!otherParty) continue;
          if (selves.has(otherParty.email)) continue;
          if (known.has(otherParty.email)) continue;
          if (isNoise(otherParty.email)) continue;

          const existing = found.get(otherParty.email);
          if (!existing || lastTs > existing.lastTs) {
            found.set(otherParty.email, {
              email: otherParty.email,
              displayName: otherParty.name,
              name: deriveCompanyName(otherParty.email),
              lastTs,
              firstSeenVia: accountEmail,
            });
          }
        } catch (err) {
          // Skip individual thread failures — keep going.
          console.error(`[discovery] thread fetch failed:`, err.message);
        }
      }
    } catch (err) {
      console.error(`[discovery] account ${accountEmail} failed:`, err.message);
    }
  }

  return found;
}
