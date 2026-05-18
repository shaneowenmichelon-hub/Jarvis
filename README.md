# ZMM // Sponsor Command

Jarvis-style sponsorship tracking dashboard with **live Gmail sync** and an optional Claude-powered JARVIS chat.

Built for Shane Michelon, President of ZMM Events.

---

## Two ways to run it

| | Deploy to web | Run on your laptop |
|---|---|---|
| URL | `https://your-name.onrender.com` | `http://localhost:5173` |
| Setup time | 10 min | 15 min |
| Best for | Daily use, access from phone | Tinkering with the code |

**Important:** The "localhost" links in this README only work on the computer that's actually running the server. They won't work in your Claude Code chat — that's a cloud sandbox, not your machine.

---

## Path A — Deploy to Render (recommended)

This gives you a real web URL you can open from any device.

### 1. Create accounts
- Render account: https://render.com (free tier is fine to start)
- Google Cloud Console: https://console.cloud.google.com (free, you already have it if you have Gmail)

### 2. Deploy from this repo

1. Push this repo to **your** GitHub account if it isn't already.
2. Go to https://dashboard.render.com → **New → Blueprint**.
3. Connect your GitHub and pick this repo. Render will read `render.yaml` and prep the service.
4. Click **Apply**. Render will give you a URL like `https://zmm-sponsor-command-abc.onrender.com`. **Copy this URL — you need it for the next step.**

### 3. Set up Google OAuth

1. Open https://console.cloud.google.com/apis/credentials
2. **Create credentials → OAuth client ID → Web application**
3. **Authorized redirect URIs** — add (using YOUR Render URL):
   ```
   https://zmm-sponsor-command-abc.onrender.com/auth/google/callback
   ```
4. Enable the **Gmail API**: https://console.cloud.google.com/apis/library/gmail.googleapis.com
5. **OAuth consent screen** → add your Gmail address as a **Test user** (while in Testing mode)
6. Copy the **Client ID** and **Client secret** somewhere safe.

### 4. Configure Render env vars

In the Render dashboard, open your service → **Environment** → add:

| Key | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the Client ID from step 3 |
| `GOOGLE_CLIENT_SECRET` | the Client secret from step 3 |
| `GOOGLE_REDIRECT_URI` | `https://zmm-sponsor-command-abc.onrender.com/auth/google/callback` (your Render URL) |
| `ANTHROPIC_API_KEY` | *(optional)* `sk-ant-...` for live JARVIS chat. Get one at console.anthropic.com |

Render will redeploy. When it's done, open the URL → click **CONNECT GMAIL** → authorize.

### Caveat on Render free tier
The free tier's filesystem is ephemeral, so OAuth tokens get wiped when the service idles or redeploys. In practice this means you'll click **CONNECT GMAIL** again every day or so. Upgrade to the Starter plan ($7/mo) + a persistent disk to make it permanent, or swap `data/store.json` for a real database (see the roadmap).

---

## Path B — Run on your laptop

### 1. Install prerequisites
- **Node.js 20+** — https://nodejs.org/ (install the LTS version)
- **Git** — https://git-scm.com/downloads
- A terminal: **Terminal** on Mac, **PowerShell** on Windows

### 2. Get the code

Open your terminal and run:
```bash
git clone https://github.com/shaneowenmichelon-hub/Jarvis.git
cd Jarvis
npm install
```

### 3. Configure your env file

```bash
cp .env.example .env
```

Edit `.env` (any text editor — VS Code, Notepad, TextEdit) and fill in your Google OAuth values. The Google Cloud setup is the same as in Path A above — but use this redirect URI instead:

```
http://localhost:3001/auth/google/callback
```

Then in `.env`:
```
GOOGLE_CLIENT_ID=...your client id...
GOOGLE_CLIENT_SECRET=...your client secret...
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
ANTHROPIC_API_KEY=sk-ant-...   # optional
```

### 4. Start it

```bash
npm run dev
```

This runs the Vite frontend (port 5173) and Express backend (port 3001) together. It'll auto-open `http://localhost:5173` in your browser.

Click **CONNECT GMAIL** → authorize → done.

---

## How the live sync works

Every 60 seconds (and on demand via the refresh button in the top bar), the backend:

1. For each sponsor in `server/sponsors.js`, searches Gmail for `from:contact OR to:contact`
2. Pulls metadata for up to 5 matching threads
3. Derives:
   - **lastOutbound** — most recent message you sent
   - **lastInbound** — most recent reply
   - **threadCount** — how many distinct threads
   - **threadIds** — for the "OPEN THREAD" deep-link
   - **followUpDue** — 3 days after last outbound (if no reply), else 1 day after last inbound

It's read-only. The Gmail API scope (`gmail.readonly`) means the app **cannot send mail or modify your inbox** — only read thread metadata.

## Editing the sponsor list

Open `server/sponsors.js`. Add a sponsor by copying an existing entry and changing the name, contact email, stage, etc. After deploying or restarting, the new sponsor shows up in the dashboard and starts syncing.

Per-sponsor UI edits (notes, values) persist to `data/store.json`.

## Hard rules (codified in JARVIS system prompt)

- CC zach@zmmevents.com on all outbound
- NEVER contact Constellation Brands
- Standard intro: "I'm Shane Michelon, President of ZMM Events and Co-Founder of the NightSchool college tour."

## Project structure

```
Jarvis/
├── index.html
├── package.json
├── render.yaml             # Render deploy manifest
├── vite.config.js          # proxies /api and /auth to Express in dev
├── .env.example
├── src/
│   ├── main.jsx
│   ├── App.jsx             # the whole dashboard UI
│   └── api.js              # fetch wrapper
├── server/
│   ├── index.js            # Express app
│   ├── auth.js             # Google OAuth
│   ├── gmail.js            # Gmail thread → sponsor state sync
│   ├── jarvis.js           # Anthropic chat proxy
│   ├── sponsors.js         # sponsor config + follow-up rule
│   └── store.js            # JSON file persistence
└── data/                   # gitignored — OAuth tokens + sync state
```

## Roadmap

- [x] Express backend with Gmail OAuth
- [x] Auto-poll for real-time updates
- [x] JARVIS chat proxy (Anthropic)
- [x] Per-sponsor override store
- [x] Render deploy manifest
- [ ] Postgres persistence (so tokens survive Render free-tier restarts)
- [ ] Gmail-label-driven stage sync
- [ ] Outbound draft queue (JARVIS drafts follow-ups, you approve before send)
- [ ] Gmail push notifications via Pub/Sub for sub-minute updates
