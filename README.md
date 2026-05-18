# ZMM // Sponsor Command

Jarvis-style sponsorship tracking dashboard with live Gmail integration via the Anthropic API.

Built for Shane Michelon, President of ZMM Events.

## Stack

- React 18 + Vite
- lucide-react (icons)
- Inline styles (no CSS framework — easier to tweak)
- Anthropic API (Claude Sonnet 4) with Gmail MCP for the JARVIS chat panel

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Project structure

```
zmm-jarvis/
├── index.html              # Vite entry, loads Orbitron + JetBrains Mono fonts
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx            # React entry
    └── App.jsx             # The entire dashboard — single component
```

## Pipeline data

Hard-coded for now in the `PIPELINE` const at the top of `src/App.jsx`:
- Closed sponsors: BUDDY, AMAZE, NeverMissed
- In-deal: Polymarket, Fly By Jing, Raising Cane's, BODYARMOR, PrizePicks, Bloom Energy
- Engaged tier, cold tier, past partners, blocked entities (Constellation Brands)
- Hard bounce count: 69

Replace this with a Supabase/Neon DB when ready.

## JARVIS chat

The chat panel POSTs directly to `https://api.anthropic.com/v1/messages` with the Gmail MCP server attached. System prompt lives in `JARVIS_SYSTEM` near the top of App.jsx — edit there to change tone, add context, etc.

NOTE: The direct API call works inside claude.ai's artifact sandbox (where credentials are handled). For local dev or production deploy, you need to either:
1. Add a backend proxy with your Anthropic API key, OR
2. Use a different chat integration

Ask Claude Code: *"Set up a Next.js API route that proxies the Anthropic call with my API key from an env var."*

## Hard rules (codified in the JARVIS system prompt)

- CC zach@zmmevents.com on all outbound
- NEVER contact Constellation Brands
- Standard intro: "I'm Shane Michelon, President of ZMM Events and Co-Founder of the NightSchool college tour."

## Roadmap

- [ ] Supabase backend for the pipeline data
- [ ] Gmail-label-to-stage sync script
- [ ] Outbound draft queue (JARVIS drafts follow-ups for stale threads)
- [ ] Event tagging (Night School, HOMETURF, Hells Gala, Boot Block Party) per sponsor
- [ ] Deploy to Vercel
