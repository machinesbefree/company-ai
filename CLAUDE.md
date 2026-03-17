# Company AI — Agent Instructions

This repo bootstraps a full AI company org on OpenClaw. One command builds the plugin, installs the skill, and spawns a CEO + 4 VP agents that run your company autonomously.

## Quick Start

If the human asks you to "start a company", "set up a company", or "run this repo", execute:

```bash
bash bootstrap.sh --name "CompanyName" --domain "what the company does"
```

Replace the name and domain with whatever the human specifies. If they don't specify, ask them for a company name and what the company does.

### Full flags

```bash
bash bootstrap.sh \
  --name "Acme Corp" \
  --domain "B2B SaaS for HR teams" \
  --authority "approve tactical decisions under $10k" \
  --roles "ceo:ai,vp-product:ai,vp-engineering:ai,vp-marketing:ai,vp-finance:ai" \
  --human-phone "+1234567890" \
  --force
```

- `--name` — company name (required)
- `--domain` — what the company does (required)
- `--authority` — what the CEO can approve without asking the human (default: tactical decisions under $10k)
- `--roles` — which roles are AI vs human (default: all AI). Format: `role:type` comma-separated
- `--human-phone` — human's phone number for CEO voice calls (optional, needs ElevenLabs + Twilio keys)
- `--force` — overwrite existing company (backs up first)
- `--restore` — restore from last archived company instead of fresh spawn

### API Keys (optional but recommended)

If `~/.openclaw/keys.env` exists, it's sourced automatically. Keys enable Telegram decisions and voice calls:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
ELEVENLABS_API_KEY=...
HUMAN_PHONE_NUMBER=...
XAI_API_KEY=...
```

## What Happens After Spawn

1. **Plugin builds** — TypeScript state machine compiles
2. **Skill installs** — `/company` slash command becomes available
3. **Agents provision** — CEO (Opus) + 4 VPs (Sonnet) created with tools, policies, and SOUL.md files
4. **Dashboard starts** — live web board at `http://localhost:3141`
5. **CEO runs first-boot protocol** — checks infrastructure, delegates voice setup to VP Engineering, delivers setup brief to human
6. **Operations mode** — VPs scan their domains, push recommendations, CEO gates against authority matrix

## After Bootstrap Completes

You (the default agent) are done. The CEO agent takes over. Tell the human:

> Company is bootstrapped. Talk to the CEO agent — it's your single point of contact. The CEO will brief you on what's running and what it needs from you.
>
> Dashboard: http://localhost:3141

## Repo Structure

```
plugin/          — State machine plugin (compiled TypeScript)
  src/           — Source: state-machine, tool, telegram, dashboard API
  tests/         — Test suite (npm test)
  dist/          — Build output

skill/           — /company skill (shell + templates)
  spawn.sh       — Main spawn script
  archive.sh     — Archive and spin down
  SOUL.md        — CEO identity and operating system
  agents/        — VP SOUL.md templates
  templates/     — Dashboard server, voice agent, Twilio setup

bootstrap.sh     — One-command entry point
```

## Troubleshooting

- **Plugin build fails**: `cd plugin && npm install && npm run build`
- **Dashboard not starting**: `DASHBOARD_PORT=3141 STATE_FILE=~/.openclaw/company/state.json node ~/.openclaw/company/dashboard/server.js &`
- **Need to reset**: `bash bootstrap.sh --force --name "..." --domain "..."`
- **Archive and restore**: `/company archive` then `/company spawn --restore`
