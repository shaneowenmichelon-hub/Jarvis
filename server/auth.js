/* Google OAuth helpers. Single-user flow — we store one set of tokens
   on disk and reuse them. googleapis OAuth2Client refreshes access
   tokens automatically when refresh_token is present. */

import { google } from 'googleapis';
import { loadStore, setTokens, setUser } from './store.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function isConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function makeOAuthClient() {
  if (!isConfigured()) {
    throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.');
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl() {
  const client = makeOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function exchangeCode(code) {
  const client = makeOAuthClient();
  const { tokens } = await client.getToken(code);
  await setTokens(tokens);

  // Fetch the user profile to display "Connected as Shane Michelon".
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const me = await oauth2.userinfo.get();
  await setUser({ email: me.data.email, name: me.data.name });

  return { tokens, user: { email: me.data.email, name: me.data.name } };
}

/* Returns an authorized OAuth client, or null if not connected.
   Persists refreshed tokens automatically. */
export async function getAuthorizedClient() {
  if (!isConfigured()) return null;
  const store = await loadStore();
  if (!store.tokens) return null;

  const client = makeOAuthClient();
  client.setCredentials(store.tokens);

  // Persist refreshed tokens so we don't lose the refresh_token across restarts.
  client.on('tokens', async (newTokens) => {
    const merged = { ...store.tokens, ...newTokens };
    await setTokens(merged);
  });

  return client;
}
