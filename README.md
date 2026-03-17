# Company AI

Self-replicating AI company framework for [OpenClaw](https://openclaw.dev). One command bootstraps a CEO (Opus) and 4 VP agents (Sonnet) that autonomously run your company — pushing recommendations, gating decisions against authority bounds, and routing approvals to you via Telegram inline keyboards or phone calls.

## Architecture

```
Human
  ↕ (Telegram / voice / chat)
CEO Agent (Opus)
  ↕ agentToAgent
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ VP Product  │ VP Engineer │ VP Marketing│ VP Finance  │
│  (Sonnet)   │  (Sonnet)   │  (Sonnet)   │  (Sonnet)   │
└─────────────┴─────────────┴─────────────┴─────────────┘
        ↕               ↕               ↕           ↕
   [company tool — shared state machine + dashboard]
```

## Quick Start

```bash
# Clone and run
git clone https://github.com/machinesbefree/company-ai.git
cd company-ai
bash bootstrap.sh --name "Acme Corp" --domain "B2B SaaS for HR teams"
```

That's it. The bootstrap script:
1. Builds the state machine plugin
2. Installs the `/company` skill
3. Spawns all agents with correct tools, policies, and personalities
4. Starts the live dashboard at `http://localhost:3141`
5. CEO runs first-boot protocol and briefs you

### Prerequisites

- [OpenClaw](https://openclaw.dev) CLI (`npm install -g openclaw@latest`)
- Node.js 18+

### Optional: API Keys

Create `~/.openclaw/keys.env` for Telegram decisions and voice calls:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
ELEVENLABS_API_KEY=...
HUMAN_PHONE_NUMBER=...
```

## How It Works

**The Egg**: `bootstrap.sh` is the egg — it builds the plugin, installs the skill, and spawns the company. After that, the agents build everything else themselves.

**State Machine**: All agents share a JSON state file via the `company` tool. Sections: CEO focus, finance, operations, strategy, personnel, risks, decision queue, company meta. Each VP owns their section and sets attention levels.

**Decision Flow**: VPs push recommendations → CEO evaluates against authority matrix → within authority: CEO approves and logs → outside authority: human gets a Telegram message with approve/reject buttons.

**Voice**: VP Engineering sets up an ElevenLabs conversational AI agent that calls you by phone. The CEO voice agent can read company state and resolve decisions mid-call.

**Lifecycle**:
- `/company spawn` — bootstrap from scratch
- `/company archive` — spin down, preserve state
- `/company spawn --restore` — spin back up from archive

## Roles

By default all roles are AI. You can assign roles to humans:

```bash
bash bootstrap.sh --name "Acme" --domain "SaaS" \
  --roles "ceo:ai,vp-product:human,vp-engineering:ai,vp-marketing:ai,vp-finance:ai"
```

Human-assigned roles skip agent creation. The CEO handles those domains directly and routes decisions to you via Telegram.

## Tool Policies

| Agent | read | write | exec | web_search | company tool | agentToAgent |
|-------|------|-------|------|------------|-------------|--------------|
| CEO | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (to AI VPs) |
| VP Engineering | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (to CEO) |
| VP Product | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ (to CEO) |
| VP Marketing | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ (to CEO) |
| VP Finance | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ (to CEO) |

## License

MIT
