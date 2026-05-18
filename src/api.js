/* Tiny fetch wrapper. All paths relative — Vite proxies /api and /auth
   to the Express server in dev; in production, the server serves the
   built SPA from the same origin. */

async function req(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

export const api = {
  health:        ()             => req('/api/health'),
  meta:          ()             => req('/api/meta'),
  authStatus:    ()             => req('/api/auth/status'),
  logout:        ()             => req('/api/auth/logout', { method: 'POST' }),
  sponsors:      ({ sync } = {}) => req(`/api/sponsors${sync ? '?sync=1' : ''}`),
  patchSponsor:  (id, patch)    => req(`/api/sponsors/${id}`, { method: 'POST', body: JSON.stringify(patch) }),
  markFollowup:  (id)           => req(`/api/sponsors/${id}/followup`, { method: 'POST' }),
  jarvis:        (messages)     => req('/api/jarvis/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
  sendDraft:     (draft)        => req('/api/jarvis/send', { method: 'POST', body: JSON.stringify(draft) }),
  checkDraft:    (draft)        => req('/api/jarvis/check', { method: 'POST', body: JSON.stringify(draft) }),
  sentLog:       ()             => req('/api/email/log'),
  setBounces:    (value)        => req('/api/meta/hard-bounces', { method: 'POST', body: JSON.stringify({ value }) }),
};
