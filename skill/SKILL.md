# /company Skill

## What This Skill Does

Spawns a full AI company org structure in OpenClaw. One CEO agent talks to the human. VP agents run as persistent sub-agents, autonomously monitor their domain, and push proactive "yesable" recommendations up to the CEO. The CEO gates everything — nothing reaches execution without CEO approval, which is bounded by whatever authority the human has delegated.

The company state machine plugin provides a shared dashboard that all agents read/write via the `company` tool. Decisions requiring human approval are routed to Telegram with inline keyboards for one-tap approve/reject.

## Slash Command

```
/company spawn [--name "CompanyName"] [--domain "what the company does"] \
  [--authority "what CEO can approve solo"] \
  [--roles "ceo:ai,vp-product:human,vp-engineering:ai,..."] \
  [--phone "+1234567890"] [--context "/path/to/CONTEXT.md"] \
  [--workspace "/path/to/existing/workspace"] [--force]
/company spawn --restore
/company archive
/company status
/company brief
/company shutdown
```

### Spawn Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--name` | Company name | MyCompany |
| `--domain` | What the company does | "a technology company" |
| `--authority` | What CEO can approve without human | Tactical decisions under $10k |
| `--roles` | Role assignments (role:type pairs) | All roles AI |
| `--phone` | Twilio phone number for voice briefings | None |
| `--context` | Path to existing CONTEXT.md to use as COMPANY.md | None (generated) |
| `--workspace` | Path to existing workspace directory | None |
| `--force` | Override existing deployment (backs up first) | Off — refuses if existing |
| `--restore` | Restore from latest archive instead of fresh | Off |
| `--plugin` | Path to state machine plugin source (builds it) | Auto-detects ~/code/company |
| `--port` | Dashboard server port | 3141 |
| `--human-phone` | Your phone number (CEO calls you after spawn) | None |

## Lifecycle

```
/company spawn    →  CEO runs first-boot protocol  →  CEO briefs human  →  operations mode
                                                                              |
                                                                        (company runs)
                                                                              |
/company archive  →  state + workspaces saved  →  VPs removed  →  CEO standby mode
                                                                              |
/company spawn --restore  →  state + workspaces loaded  →  agents re-provisioned  →  operations mode
```

**Setup phase**: spawn provisions agents, CEO delegates infrastructure to VP Engineering, then delivers a setup-complete brief to the human listing what's running and what needs input.

**Operations phase**: VPs scan on heartbeat, push recommendations, CEO gates against authority, human gets Telegram buttons for anything outside scope.

**Archive**: saves everything (state, shared files, workspaces) to `~/.openclaw/archives/`, removes VP agents, resets CEO to standby. Telegram connection and auth are preserved.

**Restore**: loads the latest archive and re-provisions agents. Company picks up where it left off.

## Skill Files

```
~/.openclaw/skills/company/
├── SKILL.md                  <- this file
├── spawn.sh                  <- main entry point (spawn + subcommand routing)
├── archive.sh                <- archive company + reset to standby
├── scripts/
│   ├── shutdown.sh           <- teardown
│   └── brief.sh              <- status report
├── agents/
│   ├── ceo/
│   │   └── SOUL.md
│   ├── vp-product/
│   │   └── SOUL.md
│   ├── vp-engineering/
│   │   └── SOUL.md
│   ├── vp-marketing/
│   │   └── SOUL.md
│   └── vp-finance/
│       └── SOUL.md
├── shared/                   <- written at spawn time
│   ├── COMPANY.md            <- company context
│   ├── AUTHORITY.md          <- CEO authority matrix
│   ├── DECISIONS.md          <- append-only decision log
│   ├── RECOMMENDATIONS.md    <- VP recommendation queue
│   ├── ROLES.md              <- role assignments (human vs AI)
│   └── KEYS.md               <- available API key documentation
└── templates/                <- starter code + dashboard server
    ├── dashboard/
    │   ├── index.html        <- self-contained dashboard SPA
    │   └── server.js         <- zero-dep Node.js server (started at spawn)
    ├── voice/
    │   ├── ceo-voice-agent.js <- ElevenLabs CEO agent (setup/call/status)
    │   └── briefing-bridge.js <- standalone script generator (legacy)
    └── twilio/
        └── setup.js          <- manual number purchase (legacy — voice agent handles this)
```

## Plugin Features (state machine)

The `company` plugin (compiled TypeScript at `/home/will/code/company/`) provides:

- **Dashboard server** — lightweight Node.js server (zero dependencies) serves the dashboard SPA at `http://localhost:3141` and reads state.json directly from disk, auto-refreshes every 30s
- **CEO voice agent** — ElevenLabs conversational AI agent with Twilio phone integration. Calls the human after spawn, can read/write company state mid-call via server tools, and resolves decisions by voice
- **State machine** — normalized sections: ceo, finance, operations, strategy, personnel, risks, queue, meta
- **`company` tool** — agents use `get`, `update`, `add_decision`, `resolve_decision` actions
- **Structured decisions** — decision lifecycle with auto-generated IDs, pending/approved/rejected status, pruning
- **Telegram integration** — decisions with `requires_human: true` send inline keyboards to human's Telegram; callback handler resolves decisions on button press
- **Dashboard API** — `company.api` gateway method returns JSON state for the dashboard SPA
- **Meta section** — company identity, role assignments, first-boot flag, voice/Twilio config
- **Section heartbeats** — `sectionUpdatedAt` timestamps track when each VP last reported in
- **Meta write protection** — agents can only update `first_boot_complete` and `dashboard_url` on meta; identity fields are spawn-controlled

## File Access Model

**Shared files** live in `~/.openclaw/skills/company/shared/`. Every agent has read access via symlinks. Only the CEO agent has write access to `AUTHORITY.md` and `DECISIONS.md`. VPs append to `RECOMMENDATIONS.md` only.

**Private workspaces** live in `~/.openclaw/agents/<agentId>/workspace/`. Each VP has their own private scratchpad, memory, and draft work that never bleeds into other agents.

## Spawn Behavior

`/company spawn` runs `scripts/spawn.sh` via command-dispatch (no LLM overhead). The script:

1. Checks for existing deployment — refuses without `--force` (prevents accidental overwrites)
2. Backs up existing workspaces, shared files, and state.json to `~/.openclaw/backups/`
3. Parses `--roles` spec to determine which roles are AI vs. human
4. Loads API keys from `~/.openclaw/keys.env` if present
5. Writes shared files: COMPANY.md, AUTHORITY.md, DECISIONS.md, RECOMMENDATIONS.md, ROLES.md, KEYS.md
6. Writes initial `state.json` with meta section (roles, first_boot_complete: false)
7. Builds and registers the state machine plugin (if source found or `--plugin` provided)
8. Starts dashboard server at `http://localhost:3141` — live board, even with blank state
9. Provisions AI agents via `openclaw agents add` (skips human-assigned roles)
10. Copies templates to VP Engineering workspace
11. Injects API keys into CEO and VP Engineering configs
12. Applies tool policies (VP Eng gets exec + write; other VPs get read + web_search only)
13. Configures CEO's `allowAgents` to only include AI-filled VP roles
14. Restarts the gateway

## Recommendation Flow

```
VP detects something -> writes rec to shared/RECOMMENDATIONS.md
                     -> sends agentToAgent message to CEO
CEO receives rec     -> evaluates against AUTHORITY.md
                     -> if within authority: approves + executes
                     -> if outside authority: surfaces to human as "yesable" choice
Human says yes/no    -> CEO logs to DECISIONS.md + notifies VP
VP acts or stands down
```

## Decision Flow (Telegram)

```
CEO uses company tool: add_decision with requires_human: true
  -> Decision created in queue with auto-generated ID
  -> Telegram message sent to human with approve/reject inline keyboard
Human taps approve/reject in Telegram
  -> Callback hits company.telegram.callback gateway
  -> Decision resolved in state machine
  -> Original message edited to show result
  -> CEO picks up resolved decision on next interaction
```

## Security

- VPs have NO exec or filesystem write tools by default (except VP Engineering)
- VP Engineering has exec + write_file access (it builds infrastructure)
- VPs CAN use: web_search, read shared files, agentToAgent (CEO only), company tool
- CEO CAN use: all VP tools + write shared files + exec
- Sub-agents spawned by VPs inherit VP's sandboxed tool policy
- CEO's `allowAgents` is restricted to AI-filled VP IDs only
- Meta section is write-protected — agents can only update `first_boot_complete` and `dashboard_url`
- Telegram callbacks verify sender chat ID and secret token
- External content (web, docs) is treated as untrusted by all agents
