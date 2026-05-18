/* Google OAuth — multi-account. Each Gmail account has its own
   token set, addressable by email. Adding a new account is the
   default flow: /auth/google never replaces an existing account,
   it appends.  googleapis OAuth2Client handles access-token refresh
   automatically when refresh_token is present. */

import { google } from 'googleapis';
import { loadStore, addAccount, updateAccountTokens } from './store.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose', // covers drafts.create + messages.send
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export const REQUIRED_SCOPE_KEYS = ['gmail.readonly', 'gmail.compose'];

export function isConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export function makeOAuthClient() {
  if (!isConfigured()) {
    throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.');
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export function getAuthUrl() {
  const client = makeOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',          // force consent so we always get a fresh refresh_token
    scope: SCOPES,
  });
}

/* Returns the granted scope keys (last URL segments) from a token blob. */
export function grantedScopeKeys(tokens) {
  if (!tokens?.scope) return [];
  return tokens.scope.split(/\s+/).map((s) => s.split('/').pop());
}

/* Completes the OAuth dance and stores the account. The user is
   identified from the token's userinfo.get(), so the caller doesn't
   have to know which inbox is being added in advance. */
export async function exchangeCode(code) {
  const client = makeOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const me = await oauth2.userinfo.get();
  const email = me.data.email;
  const name = me.data.name;

  await addAccount({ email, name, tokens });
  return { email, name };
}

/* Returns an authorized OAuth client for a specific account email,
   or null if not connected. Persists refreshed tokens automatically. */
export async function getAuthorizedClientFor(email) {
  if (!isConfigured()) return null;
  const store = await loadStore();
  const acct = store.accounts?.[email];
  if (!acct?.tokens) return null;

  const client = makeOAuthClient();
  client.setCredentials(acct.tokens);
  client.on('tokens', async (newTokens) => {
    await updateAccountTokens(email, newTokens);
  });
  return client;
}

/* Returns the primary account's client (or null). Convenience for
   single-account callers like sendEmail when no account is specified. */
export async function getPrimaryClient() {
  const store = await loadStore();
  if (!store.primaryAccount) return null;
  const client = await getAuthorizedClientFor(store.primaryAccount);
  return client ? { email: store.primaryAccount, client } : null;
}

/* Returns all authorized clients, one per connected account. */
export async function getAllAuthorizedClients() {
  const store = await loadStore();
  const emails = Object.keys(store.accounts || {});
  const out = [];
  for (const email of emails) {
    const client = await getAuthorizedClientFor(email);
    if (client) out.push({ email, name: store.accounts[email].name, client });
  }
  return out;
}
