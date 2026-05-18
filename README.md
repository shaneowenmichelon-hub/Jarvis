# ZMM // Sponsor Command

Jarvis-style sponsorship tracking dashboard with **live Gmail sync** and an optional Claude-powered JARVIS chat.

Built for Shane Michelon, President of ZMM Events.

## Stack

- **Frontend:** React 18 + Vite, lucide-react icons, inline styles
- **Backend:** Express, googleapis (Gmail), @anthropic-ai/sdk (JARVIS), JSON file persistence
- **Auth:** Google OAuth 2.0 (offline access — tokens refresh automatically)
- **Live data:** frontend polls `/api/sponsors` every 60s; manual "sync now" button forces a refresh

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure Google OAuth (Gmail)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a project (or use existing) → **Create Credentials → OAuth client ID → Web application**
3. Authorized redirect URI: `http://localhost:3001/auth/google/callback`
4. Enable the **Gmail API** in the project's API library
5. Copy `.env.example` → `.env` and fill in:
   ```
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
   ```

While the app is in "Testing" mode in Google Cloud Console, add your Gmail address as a Test User.

### 3. (Optional) Configure Anthropic for live JARVIS

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without this key, the JARVIS chat falls back to a simulated responder. The dashboard itself works fully without it.

### 4. Run

```bash
npm run dev
```

This starts the Vite dev server (port 5173) and the Express backend (port 3001) together. Vite proxies `/api/*` and `/auth/*` to the backend.

Open http://localhost:5173 → click **CONNECT GMAIL** in the top banner → authorize.

### 5. Production build

```bash
npm run build
npm start
```

The Express server serves the built SPA from the same port (3001).

## How the Gmail sync works

For each sponsor in `server/sponsors.js`, the backend searches Gmail with `from:<contact> OR to:<contact>` (max 5 threads), then derives:

- **lastOutbound** — most recent message sent by you to the contact
- **lastInbound** — most recent message from the contact
- **threadCount** — number of distinct threads
- **threadIds** — Gmail thread IDs (used for the "OPEN THREAD" deep-link)
- **followUpDue** — auto-computed: 3 days after last outbound (if no reply), else 1 day after last inbound

The frontend polls every 60 seconds, and you can force a sync with the refresh button in the top bar.

## Editing the pipeline

Edit `server/sponsors.js` to add, remove, or reclassify sponsors. The fields that come from Gmail (`lastOutbound`, `lastInbound`, etc.) are filled in automatically — you set the static config (name, stage, tier, contact, event, value, notes).

Per-sponsor overrides (e.g. updating notes or value from the UI) are stored in `data/store.json` and merged on top.

## Hard rules (codified in the JARVIS system prompt)

- CC zach@zmmevents.com on all outbound
- NEVER contact Constellation Brands
- Standard intro: "I'm Shane Michelon, President of ZMM Events and Co-Founder of the NightSchool college tour."

## Project structure

```
Jarvis/
├── index.html
├── package.json
├── vite.config.js          # proxies /api and /auth to Express
├── .env.example
├── src/
│   ├── main.jsx
│   ├── App.jsx             # the whole dashboard UI
│   └── api.js              # tiny fetch wrapper
├── server/
│   ├── index.js            # Express app
│   ├── auth.js             # Google OAuth
│   ├── gmail.js            # Gmail thread → sponsor state sync
│   ├── jarvis.js           # Anthropic chat proxy
│   ├── sponsors.js         # sponsor config + follow-up rule
│   └── store.js            # JSON file persistence
└── data/
    └── store.json          # gitignored — OAuth tokens + sync state
```

## Deploying

Anywhere Node 18+ runs. The simplest path:

- **Render / Railway / Fly:** single Node service, `npm install && npm run build && npm start`
- Set the same env vars in the host's dashboard
- Update `GOOGLE_REDIRECT_URI` and `PUBLIC_URL` to your deployed domain, and add the matching redirect URI in Google Cloud Console

## Roadmap

- [x] Express backend with Gmail OAuth
- [x] Auto-poll for real-time updates
- [x] JARVIS chat proxy (Anthropic)
- [x] Per-sponsor override store
- [ ] Gmail-label-driven stage sync (today, stages are config-driven)
- [ ] Outbound draft queue (JARVIS drafts follow-ups for stale threads, you approve before send)
- [ ] Gmail push notifications via Pub/Sub for sub-minute updates
- [ ] Event tagging surface in the UI
