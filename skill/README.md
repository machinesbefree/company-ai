# /company — OpenClaw Slash Command Skill

Spawns a full AI company org structure in OpenClaw. One CEO agent is your single point of contact. Four VP agents run persistently in the background, proactively scanning their domain and pushing **yesable recommendations** up to the CEO. The CEO gates everything against a defined authority matrix — executing what's within scope, surfacing the rest to you as clean yes/no choices.

Decisions requiring human approval are delivered to your Telegram with inline approve/reject buttons. The CEO self-builds company infrastructure (dashboard, voice briefings, Twilio) on first boot by delegating to VP Engineering.

**Spin up a company, run it, spin it down. One command each way.**

```
/company spawn --name "Acme Corp" --domain "B2B SaaS" \
  --phone "+15551234567" --human-phone "+15559876543"     # spin up — CEO calls you
  ... company runs ...
/company archive                                          # spin down (state preserved)
/company spawn --restore                                  # spin back up where you left off
```

---

## Architecture

```
Human
  |
  v
CEO Agent  (Opus -- persistent, your only interface)
  |
  |--- agentToAgent ---> VP Product     (Sonnet -- persistent sub-agent)
  |                          +-- spawns one-shot sub-agents for research/specs
  |--- agentToAgent ---> VP Engineering (Sonnet -- persistent, has exec access)
  |                          +-- builds dashboard, Twilio, voice bridge
  |--- agentToAgent ---> VP Marketing   (Sonnet -- persistent sub-agent)
  |                          +-- spawns one-shot sub-agents for content/research
  +--- agentToAgent ---> VP Finance     (Sonnet -- persistent sub-agent)
                             +-- spawns one-shot sub-agents for models/research

  Telegram <--- inline keyboards for human decisions
  Dashboard <--- company.api gateway for live state
```

Any role can be assigned to a human instead of an AI agent. Human-assigned roles skip agent provisioning — the CEO handles that domain directly and routes decisions to the human via Telegram.

### State Machine

All agents share a company state dashboard via the `company` tool (provided by the compiled TypeScript plugin). Sections: `ceo`, `finance`, `operations`, `strategy`, `personnel`, `risks`, `queue`, `meta`.

Each VP owns a section and updates it with metrics, attention level, and narrative reports. The CEO reads the full dashboard. The `queue` section tracks structured decisions with auto-generated IDs. The `meta` section stores company identity, role assignments, and first-boot state.

A lightweight dashboard server (zero Node.js dependencies) starts at spawn and serves a live web board at `http://localhost:3141`. It reads state.json directly from disk, so it works even with blank state — you can open the dashboard the moment spawn finishes.

### File Access Model

```
~/.openclaw/skills/company/
+-- shared/                       <- READ by all agents (symlinked into workspaces)
|   +-- COMPANY.md                   company context (written at spawn)
|   +-- AUTHORITY.md                 CEO authority matrix
|   +-- DECISIONS.md                 append-only decision log
|   +-- RECOMMENDATIONS.md          VP recommendation queue
|   +-- ROLES.md                     role assignments (human vs AI)
|   +-- KEYS.md                      available API key documentation
|
+-- agents/                       <- SOUL.md templates per role
|   +-- ceo/
|   +-- vp-product/
|   +-- vp-engineering/
|   +-- vp-marketing/
|   +-- vp-finance/
|
+-- templates/                    <- dashboard server + starter code
    +-- dashboard/
    |   +-- index.html               self-contained dashboard SPA
    |   +-- server.js                zero-dep Node.js server (started at spawn)
    +-- voice/
    |   +-- ceo-voice-agent.js       ElevenLabs CEO agent (setup/call/status)
    |   +-- briefing-bridge.js       standalone script generator
    +-- voice/briefing-bridge.js     xAI Grok voice bridge
    +-- twilio/setup.js              number purchase + webhook config

~/.openclaw/agents/               <- OpenClaw's own agent store
    +-- ceo/workspace/            <- CEO private workspace + symlinks to shared/
    +-- vp-product/workspace/
    +-- vp-engineering/workspace/ <- also gets templates/ directory
    +-- vp-marketing/workspace/
    +-- vp-finance/workspace/
```

**Shared files** are symlinked into every agent's workspace — all agents can read them. Private workspace contents are isolated per agent.

---

## Install

```bash
git clone <this-repo>
cd company-skill
bash install.sh
```

Requires OpenClaw CLI (`npm install -g openclaw@latest`).

---

## Usage

### Spawn your company

```bash
/company spawn \
  --name "Acme Corp" \
  --domain "B2B SaaS platform for HR teams" \
  --authority "approve tactical decisions under $10k, approve public content"
```

### Spawn with human roles and Telegram

```bash
/company spawn \
  --name "Acme Corp" \
  --domain "B2B SaaS platform for HR teams" \
  --authority "approve tactical decisions under $10k" \
  --roles "ceo:ai,vp-product:human,vp-engineering:ai,vp-marketing:ai,vp-finance:ai" \
  --phone "+15551234567"
```

### Spawn into existing workspace

```bash
/company spawn \
  --name "Acme Corp" \
  --context "/path/to/existing/CONTEXT.md" \
  --workspace "/path/to/existing/workspace"
```

### Re-spawn (overwrites existing)

```bash
/company spawn --force --name "Acme Corp" ...
```

Existing workspaces, shared files, and state.json are backed up to `~/.openclaw/backups/` before overwriting.

### Spawn flags

| Flag | Description | Default |
|------|-------------|---------|
| `--name` | Company name | MyCompany |
| `--domain` | What the company does | "a technology company" |
| `--authority` | What CEO can approve without human | Tactical decisions under $10k |
| `--roles` | Role type assignments (format: `role:type,...`) | All AI |
| `--phone` | Twilio phone for voice briefings (enables voice) | None |
| `--context` | Path to existing file to use as COMPANY.md | Auto-generated |
| `--workspace` | Path to existing workspace directory | None |
| `--force` | Override existing deployment | Off (refuses if existing) |
| `--restore` | Restore from latest archive | Off |
| `--plugin` | Path to state machine plugin source | Auto-detects ~/code/company |
| `--port` | Dashboard server port | 3141 |
| `--human-phone` | Your phone number — CEO calls you after spawn! | None (or HUMAN_PHONE_NUMBER env) |

This:
1. Backs up any existing company deployment
2. Writes shared files (COMPANY.md, AUTHORITY.md, DECISIONS.md, RECOMMENDATIONS.md, ROLES.md, KEYS.md)
3. Writes initial state.json with meta section and role assignments
4. Builds and registers the state machine plugin (auto-detects or `--plugin`)
5. Starts dashboard server at `http://localhost:3141` — viewable immediately, even with blank state
6. Provisions AI agents via `openclaw agents add` (skips human-assigned roles)
7. Copies templates to VP Engineering workspace
8. Injects API keys from `~/.openclaw/keys.env` into agent configs
9. Applies tool policies and configures CEO's allowAgents
10. Restarts the gateway

### Archive (spin down)

```bash
/company archive
```

This:
1. Saves state.json, shared files, and all agent workspaces to `~/.openclaw/archives/`
2. Removes VP agents
3. Cleans shared files and state
4. Resets CEO to standby mode (Telegram + auth preserved)

CEO will report "No company is active" until the next spawn or restore.

### Restore (spin back up)

```bash
/company spawn --restore
```

Loads the latest archive and re-provisions all agents. Company picks up where it left off. CEO re-enters operations mode.

### Other commands

```bash
/company status     # health check -- agents active, pending rec count
/company brief      # triggers CEO to pull full VP briefs
/company shutdown   # full teardown (no archive, removes everything)
```

---

## How the Recommendation Flow Works

```
VP detects something (heartbeat scan or event)
  |
  v
VP appends to shared/RECOMMENDATIONS.md
VP sends agentToAgent to CEO: "I have a rec -- [priority]"
  |
  v
CEO reads rec, checks AUTHORITY.md
  |
  |-- Within CEO authority?
  |     YES -> CEO acts, logs to DECISIONS.md, notifies VP
  |
  +-- Outside CEO authority?
        -> CEO uses company tool: add_decision (requires_human: true)
        -> Telegram inline keyboard sent to human
        -> Human taps approve/reject
        -> Decision resolved in state machine
        -> CEO picks up result and acts
```

### What a VP recommendation looks like

```
---
**From:** VP Product
**Date:** 2026-03-15T14:22:00Z
**Priority:** high
**Recommendation:** Launch closed beta to 500-user cohort next Friday
**Rationale:** Retention at 68% (above 60% threshold). Waiting longer risks
  competitor announcing first in the same segment.
**Action Required:** Approve beta launch date and notify engineering to prep
**Requires Human?** no -- within CEO authority
**Status:** pending
---
```

### What CEO surfaces to you

Within authority:
```
[VP Product] recommends:
Launch closed beta to 500 users next Friday.

Rationale: Retention is strong; delay risks competitor window.

Within my authority -- approved. VP Product is proceeding.
```

Requires human:
```
[VP Finance] recommends:
Renegotiate Vercel contract -- current plan is $2,400/mo, market rate is ~$900/mo.

Rationale: 12-month contract renewal is in 45 days. Estimated annual savings: $18k.

Requires your call (>$10k annual impact).
[Approve] [Reject] buttons sent to your Telegram
```

---

## Decision Flow (Telegram Integration)

When a decision requires human approval:

1. CEO calls `company tool: add_decision` with `requires_human: true`
2. State machine creates a Decision with auto-generated ID and `status: pending`
3. Telegram message sent to human with inline approve/reject keyboard
4. Human taps a button in Telegram
5. `company.telegram.callback` gateway handles the callback
6. Decision resolved in state machine, original message edited to show result
7. CEO picks up the resolved decision on next interaction

Decisions within CEO authority are created with `requires_human: false` and immediately resolved — no Telegram message sent.

Failed Telegram sends are queued for retry with exponential backoff (max 5 attempts).

---

## CEO Voice Agent

When `ELEVENLABS_API_KEY` is set and `--phone` is provided, spawn automatically:

1. Creates an ElevenLabs conversational AI agent with the CEO personality
2. Imports your Twilio number into ElevenLabs
3. Links the number to the agent
4. **Calls your `--human-phone` number immediately** — the CEO introduces itself and gives the first briefing

**What the CEO can do on the phone:**
- Read live company state mid-call (fetches from dashboard server via server tools)
- Drill into specific sections ("What's the finance situation?")
- Resolve pending decisions by voice ("Approve that", "Reject it")
- Give 60-second company briefings with attention levels and pending counts

**How it works under the hood:**
- ElevenLabs agent has 3 server tools (webhooks) pointing at `http://localhost:3141/api/gateway/company.api`
  - `get_company_state` — reads full dashboard
  - `get_section` — reads one section
  - `resolve_decision` — approves/rejects a decision, writes to state.json
- Twilio handles the phone connection, ElevenLabs handles the conversation
- Config saved to `~/.openclaw/company/voice-agent.json`

**Manual calls later:**
```bash
# CEO calls you again (e.g. scheduled daily briefing)
ELEVENLABS_API_KEY=xxx HUMAN_PHONE_NUMBER=+15559876543 \
  node ~/.openclaw/company/voice/ceo-voice-agent.js call
```

Required keys in `~/.openclaw/keys.env`:
```
ELEVENLABS_API_KEY=your-key
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
```

---

## Human Roles

When a role is assigned to a human (`--roles "vp-product:human"`):

- No AI agent is provisioned for that role
- CEO owns that domain directly (e.g., handles product questions, roadmap thinking)
- When work in that domain needs human input, CEO routes via `add_decision` with `requires_human: true`
- In company pulse, CEO reports: "[VP Product] -- human-filled, awaiting input on [N items]"
- CEO's `allowAgents` excludes human-filled roles

---

## First Boot Protocol

On first interaction after spawn, CEO checks `meta.first_boot_complete`. If false:

1. Reads ROLES.md to understand who is human vs AI
2. Checks if dashboard exists — if not, delegates to VP Engineering
3. If `meta.twilio_phone` is set, delegates Twilio setup to VP Engineering
4. If `meta.voice_enabled` is true, coordinates voice bridge setup
5. Sets `meta.first_boot_complete` to true (prevents re-running)

VP Engineering uses template code in `workspace/templates/` to build everything. The agents build their own infrastructure.

---

## Adjusting CEO Authority

At any time, tell the CEO:

> "CEO, update your authority to include approving vendor contract renegotiations under $20k."

CEO updates `shared/AUTHORITY.md` and notifies all VPs.

---

## VP Heartbeat Cadence

| VP              | Scan interval | What they watch                              |
|-----------------|---------------|----------------------------------------------|
| VP Product      | Every 2h      | Competitors, roadmap drift, user signals     |
| VP Engineering  | Every 2h      | System health, delivery risk, dependencies   |
| VP Marketing    | Every 2h      | News hooks, channel silence, content queue   |
| VP Finance      | Every 4h      | Runway, budget drift, contract renewals      |

Each VP update records a `sectionUpdatedAt` timestamp in the state machine. If a section goes stale, CEO can detect it.

---

## Tool Policies

| Agent          | web_search | agentToAgent | read_file | write_file | exec | company tool | spawn sub-agents |
|----------------|:----------:|:------------:|:---------:|:----------:|:----:|:------------:|:----------------:|
| CEO            | Y          | Y            | Y         | Y (shared) | Y    | Y            | Y (VPs only)     |
| VP Product     | Y          | Y (CEO only) | Y         | N          | N    | Y            | Y (depth 1)      |
| VP Engineering | Y          | Y (CEO only) | Y         | Y          | Y    | Y            | Y (depth 1)      |
| VP Marketing   | Y          | Y (CEO only) | Y         | N          | N    | Y            | Y (depth 1)      |
| VP Finance     | Y          | Y (CEO only) | Y         | N          | N    | Y            | Y (depth 1)      |

VP Engineering has write_file and exec access because it builds infrastructure (dashboard, Twilio, voice). Other VPs cannot write to shared files directly — only append to RECOMMENDATIONS.md via their rec format.

---

## API Keys

Place keys in `~/.openclaw/keys.env` before spawning:

```bash
ELEVENLABS_API_KEY=your-elevenlabs-key      # CEO voice agent (required for voice calls)
TELEGRAM_BOT_TOKEN=your-bot-token            # Telegram decision routing
TWILIO_ACCOUNT_SID=your-sid                  # Phone integration
TWILIO_AUTH_TOKEN=your-auth-token            # Phone integration
HUMAN_PHONE_NUMBER=+15559876543              # Your phone (CEO calls this number)
XAI_API_KEY=your-xai-key                     # Optional: Grok for script generation
```

CEO gets Telegram + voice keys. VP Engineering gets all infra keys. Other VPs get no keys.

For the full voice experience (CEO calls you after spawn), you need: `ELEVENLABS_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `--human-phone` flag or `HUMAN_PHONE_NUMBER` env var.

---

## Customization

**Add a new VP:** Copy any `agents/vp-*/` directory, update the SOUL.md for the new role, add an entry in `spawn.sh`'s provision loop.

**Change models:** Edit the `provision_agent` calls in `spawn.sh`. Default: CEO on Opus, VPs on Sonnet.

**Change heartbeat cadence:** Configure OpenClaw's cron or heartbeat system for each agent.

**Multi-company:** Run `/company shutdown` first. Each spawn writes fresh shared files, so companies don't collide — but running two simultaneously would conflict on agent IDs. Namespace agent IDs in `spawn.sh` if you need concurrent companies.

---

## Security Notes

- VPs have no exec or filesystem write access by default (except VP Engineering)
- VP Engineering has exec + write because it builds infrastructure
- Sub-agents spawned by VPs inherit VP's sandboxed policy
- All agents' SOUL.md files include a prompt injection guard: external web content is treated as untrusted
- `allowAgents` on CEO is restricted to AI-filled VP IDs — CEO cannot spawn arbitrary agents
- Shared files are symlinks, not copies — all agents always read the current version
- Meta section is write-protected: agents can only update `first_boot_complete` and `dashboard_url`
- Telegram callback handler verifies sender chat ID and secret token
- Existing deployments are backed up before `--force` re-spawn
- The sandbox inheritance guard prevents a sandboxed requester from spawning unsandboxed sub-agents

---

## File Reference

```
company-skill/
+-- README.md
+-- SKILL.md
+-- install.sh
+-- spawn.sh              <- main entry point (spawn + subcommand routing)
+-- archive.sh            <- archive company + reset to standby
+-- agents/
|   +-- ceo/
|   |   +-- SOUL.md
|   +-- vp-product/
|   |   +-- SOUL.md
|   +-- vp-engineering/
|   |   +-- SOUL.md
|   +-- vp-marketing/
|   |   +-- SOUL.md
|   +-- vp-finance/
|       +-- SOUL.md
+-- templates/
|   +-- dashboard/
|   |   +-- index.html    <- self-contained dashboard SPA
|   |   +-- server.js     <- zero-dep Node.js server
|   +-- voice/
|   |   +-- ceo-voice-agent.js  <- ElevenLabs CEO voice agent
|   |   +-- briefing-bridge.js  <- script generator
|   +-- voice/
|   |   +-- briefing-bridge.js  <- xAI Grok voice bridge
|   +-- twilio/
|       +-- setup.js      <- number purchase + webhook config
+-- shared/               <- written at spawn time, symlinked into agent workspaces
    +-- COMPANY.md
    +-- AUTHORITY.md
    +-- DECISIONS.md
    +-- RECOMMENDATIONS.md
    +-- ROLES.md
    +-- KEYS.md
```
