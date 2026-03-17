#!/usr/bin/env bash
# /company spawn — provisions the full AI company org structure
# Usage: spawn.sh [--name "Co"] [--domain "what we do"] [--authority "what CEO can approve"]
#        [--roles "ceo:ai,vp-product:human,..."] [--phone "+1234567890"]
#        [--context "/path/to/CONTEXT.md"] [--workspace "/path/to/workspace"]
# Runs via command-dispatch (no LLM overhead)

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$SKILL_DIR/shared"
AGENTS_DIR="$SKILL_DIR/agents"
TEMPLATES_DIR="$SKILL_DIR/templates"
OC_AGENTS_DIR="$HOME/.openclaw/agents"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── Parse args ────────────────────────────────────────────────────────────────
COMPANY_NAME="MyCompany"
COMPANY_DOMAIN="a technology company"
CEO_AUTHORITY="approve tactical decisions under \$10k, reassign priorities, approve public communications"
ROLES_SPEC=""
TWILIO_PHONE=""
CONTEXT_FILE=""
WORKSPACE_DIR=""
FORCE=false
RESTORE=false
PLUGIN_DIR=""
DASHBOARD_PORT="3141"
HUMAN_PHONE_NUMBER="${HUMAN_PHONE_NUMBER:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)      COMPANY_NAME="$2";    shift 2 ;;
    --domain)    COMPANY_DOMAIN="$2";  shift 2 ;;
    --authority) CEO_AUTHORITY="$2";   shift 2 ;;
    --roles)     ROLES_SPEC="$2";      shift 2 ;;
    --phone)     TWILIO_PHONE="$2";    shift 2 ;;
    --context)   CONTEXT_FILE="$2";    shift 2 ;;
    --workspace) WORKSPACE_DIR="$2";   shift 2 ;;
    --force)     FORCE=true;           shift ;;
    --restore)   RESTORE=true;         shift ;;
    --plugin)    PLUGIN_DIR="$2";           shift 2 ;;
    --port)      DASHBOARD_PORT="$2";       shift 2 ;;
    --human-phone) HUMAN_PHONE_NUMBER="$2"; shift 2 ;;
    spawn)       shift ;;  # subcommand, skip
    status)      exec "$SKILL_DIR/scripts/status.sh"; ;;
    brief)       exec "$SKILL_DIR/scripts/brief.sh"; ;;
    shutdown)    exec "$SKILL_DIR/scripts/shutdown.sh"; ;;
    archive)     exec "$SKILL_DIR/archive.sh"; ;;
    *)           shift ;;
  esac
done

# ── Check for existing deployment ────────────────────────────────────────────
STATE_DIR="$HOME/.openclaw/company"
EXISTING_STATE="$STATE_DIR/state.json"

if [[ -f "$EXISTING_STATE" && "$FORCE" != "true" ]]; then
  echo "⚠️  Existing company detected at $EXISTING_STATE"
  echo ""
  echo "   Re-running spawn will reset all state and overwrite SOUL.md files."
  echo "   Existing state will be backed up, but all accumulated data will be replaced."
  echo ""
  echo "   To proceed anyway:  /company spawn --force [other flags]"
  echo "   To update config without resetting state, edit the files directly."
  echo ""
  exit 1
fi

echo "🏢 Spawning $COMPANY_NAME..."
echo ""

# ── Backup existing workspaces ────────────────────────────────────────────────
BACKUP_BASE="$HOME/.openclaw/backups/company-spawn-${TIMESTAMP//:/}"

backup_if_exists() {
  local dir="$1"
  local label="$2"
  if [[ -d "$dir" && "$(ls -A "$dir" 2>/dev/null)" ]]; then
    local dest="$BACKUP_BASE/$label"
    mkdir -p "$dest"
    cp -a "$dir/." "$dest/"
    echo "  📦 Backed up $label → $dest"
  fi
}

# Back up any existing agent workspaces that will be overwritten
for agent_id in ceo vp-product vp-engineering vp-marketing vp-finance; do
  backup_if_exists "$OC_AGENTS_DIR/$agent_id/workspace" "$agent_id"
done

# Back up existing shared dir
backup_if_exists "$SKILL_DIR/shared" "shared"

# Back up existing state.json
STATE_DIR_BACKUP="$HOME/.openclaw/company"
if [[ -f "$STATE_DIR_BACKUP/state.json" ]]; then
  mkdir -p "$BACKUP_BASE"
  cp "$STATE_DIR_BACKUP/state.json" "$BACKUP_BASE/state.json"
  echo "  📦 Backed up state.json → $BACKUP_BASE/state.json"
fi

if [[ -d "$BACKUP_BASE" ]]; then
  echo "✅ Pre-spawn backup complete: $BACKUP_BASE"
else
  echo "  (no existing workspaces to back up)"
fi

# ── Restore from archive (if --restore) ──────────────────────────────────────
if [[ "$RESTORE" == "true" ]]; then
  ARCHIVES_DIR="$HOME/.openclaw/archives"
  LATEST_ARCHIVE=$(ls -td "$ARCHIVES_DIR"/*/ 2>/dev/null | head -1)

  if [[ -z "$LATEST_ARCHIVE" ]]; then
    echo "No archived companies found in $ARCHIVES_DIR"
    echo "Use /company spawn (without --restore) to create a new company."
    exit 1
  fi

  echo "Restoring from: $LATEST_ARCHIVE"
  echo ""

  # Restore state.json
  if [[ -f "$LATEST_ARCHIVE/state.json" ]]; then
    mkdir -p "$HOME/.openclaw/company"
    cp "$LATEST_ARCHIVE/state.json" "$HOME/.openclaw/company/state.json"
    echo "  Restored state.json"

    # Extract company name and roles from restored state for provisioning
    COMPANY_NAME=$(grep -o '"company_name"[[:space:]]*:[[:space:]]*"[^"]*"' "$HOME/.openclaw/company/state.json" | head -1 | sed 's/.*"company_name"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "$COMPANY_NAME")
  fi

  # Restore shared files
  if [[ -d "$LATEST_ARCHIVE/shared" ]]; then
    mkdir -p "$SHARED_DIR"
    cp -a "$LATEST_ARCHIVE/shared/." "$SHARED_DIR/"
    echo "  Restored shared files"
  fi

  # Restore agent workspaces
  for agent_id in ceo vp-product vp-engineering vp-marketing vp-finance; do
    if [[ -d "$LATEST_ARCHIVE/agents/$agent_id" ]]; then
      mkdir -p "$OC_AGENTS_DIR/$agent_id/workspace"
      cp -a "$LATEST_ARCHIVE/agents/$agent_id/." "$OC_AGENTS_DIR/$agent_id/workspace/"
      echo "  Restored $agent_id workspace"
    fi
  done

  echo ""
  echo "Shared files and state restored. Now re-provisioning agents..."
  echo ""

  # Fall through to the normal provisioning flow below
  # (roles will be parsed from restored state.json via ROLES_SPEC or defaults)
fi

# ── Parse roles spec ──────────────────────────────────────────────────────────
# Format: "ceo:ai,vp-product:human,vp-engineering:ai,vp-marketing:ai,vp-finance:ai"
declare -A ROLE_TYPES
DEFAULT_ROLES=("ceo" "vp-product" "vp-engineering" "vp-marketing" "vp-finance")

if [[ -n "$ROLES_SPEC" ]]; then
  IFS=',' read -ra ROLE_PAIRS <<< "$ROLES_SPEC"
  for pair in "${ROLE_PAIRS[@]}"; do
    IFS=':' read -r role type <<< "$pair"
    role=$(echo "$role" | xargs)
    type=$(echo "$type" | xargs)
    ROLE_TYPES["$role"]="${type:-ai}"
  done
else
  for role in "${DEFAULT_ROLES[@]}"; do
    ROLE_TYPES["$role"]="ai"
  done
fi

# ── Load API keys ────────────────────────────────────────────────────────────
KEYS_FILE="$HOME/.openclaw/keys.env"
if [[ -f "$KEYS_FILE" ]]; then
  echo "  🔑 Loading API keys from $KEYS_FILE"
  set -a
  source "$KEYS_FILE"
  set +a
fi

# ── Backup existing openclaw.json ─────────────────────────────────────────────
OC_CONFIG="$HOME/.openclaw/openclaw.json"
if [[ -f "$OC_CONFIG" ]]; then
  cp "$OC_CONFIG" "${OC_CONFIG}.backup.${TIMESTAMP//:/}"
  echo "✅ Config backed up"
fi

# ── Write shared company context (skip if restoring — already loaded) ─────────
mkdir -p "$SHARED_DIR"

if [[ "$RESTORE" == "true" ]]; then
  echo "Shared files already restored from archive — skipping generation."
  echo ""
else

# If --context provided, use it as the base for COMPANY.md
if [[ -n "$CONTEXT_FILE" && -f "$CONTEXT_FILE" ]]; then
  cp "$CONTEXT_FILE" "$SHARED_DIR/COMPANY.md"
  echo "✅ Company context loaded from $CONTEXT_FILE"
else
  cat > "$SHARED_DIR/COMPANY.md" << EOF
# $COMPANY_NAME — Company Context

**Domain:** $COMPANY_DOMAIN
**Spawned:** $TIMESTAMP

## What We Do
$COMPANY_DOMAIN

## Org Structure
- **CEO** — single point of contact with the human. Gates all VP recommendations.
- **VP Product** — owns roadmap, user research, feature prioritization
- **VP Engineering** — owns technical architecture, delivery, engineering health
- **VP Marketing** — owns positioning, growth, content, brand
- **VP Finance** — owns budget, runway, financial modelling, vendor contracts

## Communication Protocol
- VPs → CEO: proactive recommendations via agentToAgent + RECOMMENDATIONS.md append
- CEO → Human: surfaces approved-to-surface items as clear yes/no choices
- Human → CEO: grants approvals, changes authority bounds, asks questions
- CEO → VPs: relays decisions, updates direction

## Shared Files (read by all agents)
- COMPANY.md — this file, company context
- AUTHORITY.md — what CEO can approve unilaterally vs. what needs human
- DECISIONS.md — append-only decision log
- RECOMMENDATIONS.md — VP recommendation queue

## Private Workspaces
Each agent has a private workspace at ~/.openclaw/agents/<agentId>/workspace/
Use private workspace for: drafts, research notes, working memory, sub-agent outputs
EOF
fi

cat > "$SHARED_DIR/AUTHORITY.md" << EOF
# CEO Authority Matrix

**Effective:** $TIMESTAMP

## CEO Can Approve Without Human
$CEO_AUTHORITY

## Always Requires Human Approval
- Any commitment over \$10k (unless authority expanded)
- Hiring or firing decisions
- Public announcements affecting company reputation
- Strategy pivots
- Any legal agreements
- Anything a VP flags as "human decision required"

## How CEO Uses This File
Read this before acting on any VP recommendation.
If the action falls in "CEO Can Approve" → execute and log to DECISIONS.md.
If it falls in "Always Requires Human" → surface to human as a clear yes/no.

## Authority Changes
Human can expand or restrict CEO authority at any time by saying:
"CEO, update your authority to include/exclude [X]"
CEO must then update this file and notify all VPs.
EOF

cat > "$SHARED_DIR/DECISIONS.md" << EOF
# Decision Log

Append-only. CEO writes every decision here with timestamp, source recommendation, and outcome.

| Timestamp | Decision | Source | Outcome | Approved By |
|-----------|----------|--------|---------|-------------|
| $TIMESTAMP | Company spawned | Human | Active | Human |
EOF

cat > "$SHARED_DIR/RECOMMENDATIONS.md" << EOF
# VP Recommendation Queue

VPs append recommendations here. CEO reviews and acts.

Format:
---
**From:** [VP Role]
**Date:** [timestamp]
**Priority:** [critical/high/medium/low]
**Recommendation:** [one clear sentence]
**Rationale:** [2-3 sentences max]
**Action Required:** [specific ask of CEO]
**Requires Human?** [yes/no + why if yes]
**Status:** [pending/approved/rejected/deferred]
---

EOF

# ── Write ROLES.md ────────────────────────────────────────────────────────────
{
  echo "# Role Assignments"
  echo ""
  echo "| Role | Type | Agent ID |"
  echo "|------|------|----------|"
  for role in "${!ROLE_TYPES[@]}"; do
    local_type="${ROLE_TYPES[$role]}"
    if [[ "$local_type" == "ai" ]]; then
      echo "| $role | AI | $role |"
    else
      echo "| $role | Human | — |"
    fi
  done
} > "$SHARED_DIR/ROLES.md"

# ── Write KEYS.md ─────────────────────────────────────────────────────────────
{
  echo "# Available API Keys"
  echo ""
  echo "Keys are injected into agent configs at spawn time. This file documents what's available."
  echo ""
  [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]] && echo "- **TELEGRAM_BOT_TOKEN** — Telegram bot for decision routing"
  [[ -n "${TWILIO_ACCOUNT_SID:-}" ]] && echo "- **TWILIO_ACCOUNT_SID** — Twilio for voice briefings"
  [[ -n "${TWILIO_AUTH_TOKEN:-}" ]] && echo "- **TWILIO_AUTH_TOKEN** — Twilio auth"
  [[ -n "${XAI_API_KEY:-}" ]] && echo "- **XAI_API_KEY** — xAI Grok for voice bridge"
  [[ -n "${ELEVENLABS_API_KEY:-}" ]] && echo "- **ELEVENLABS_API_KEY** — ElevenLabs for voice synthesis"
  echo ""
  echo "VP Engineering has access to all infra keys. CEO has Telegram + voice keys."
} > "$SHARED_DIR/KEYS.md"

echo "✅ Shared company files written"

# ── Build meta.roles JSON for state.json ──────────────────────────────────────
ROLES_JSON="["
first=true
for role in "${!ROLE_TYPES[@]}"; do
  local_type="${ROLE_TYPES[$role]}"
  if [[ "$first" == "true" ]]; then first=false; else ROLES_JSON+=","; fi
  if [[ "$local_type" == "ai" ]]; then
    ROLES_JSON+="{\"role\":\"$role\",\"type\":\"ai\",\"agentId\":\"$role\",\"displayName\":\"$role\"}"
  else
    ROLES_JSON+="{\"role\":\"$role\",\"type\":\"human\",\"displayName\":\"$role\"}"
  fi
done
ROLES_JSON+="]"

# ── Write initial state.json with meta section ───────────────────────────────
STATE_DIR="$HOME/.openclaw/company"
mkdir -p "$STATE_DIR"

VOICE_ENABLED="false"
[[ -n "$TWILIO_PHONE" ]] && VOICE_ENABLED="true"

cat > "$STATE_DIR/state.json" << STATEOF
{
  "version": 4,
  "lastUpdated": $(date +%s)000,
  "ceo": {
    "focus": "initializing",
    "goals": [],
    "current_priority": "bootstrap company infrastructure",
    "blocked_on": "none",
    "next_action": "delegate infrastructure setup to VP Engineering",
    "note_to_self": "First boot — check if dashboard exists, set up Twilio if phone provided"
  },
  "finance": {
    "runway_months": 0, "monthly_burn": 0, "monthly_revenue": 0, "cash_on_hand": 0,
    "burn_trend": "unknown", "next_funding_event": "none",
    "attention": "none", "report": "No report yet.", "needs": "none", "report_file": ""
  },
  "operations": {
    "active_projects": [], "blocked_projects": [], "headcount": 0, "open_roles": 0,
    "system_health": "unknown", "incident_summary": "none",
    "attention": "none", "report": "No report yet.", "needs": "none", "report_file": ""
  },
  "strategy": {
    "current_priorities": [], "quarterly_objectives": [], "competitive_landscape": "unknown",
    "pending_decisions": [],
    "attention": "none", "report": "No report yet.", "needs": "none", "report_file": ""
  },
  "personnel": {
    "org_mood": "unknown", "attrition_risk": "unknown", "key_hires_status": "unknown",
    "delegation_map": "unset",
    "attention": "none", "report": "No report yet.", "needs": "none", "report_file": ""
  },
  "risks": {
    "top_risks": [], "mitigations_in_progress": [], "risk_level": "unknown", "last_review": "never",
    "attention": "none", "report": "No report yet.", "needs": "none", "report_file": ""
  },
  "queue": {
    "pending_count": 0, "pending_summaries": [], "awaiting_human": [],
    "last_decision": "Company spawned", "last_decision_by": "Human",
    "report": "Queue empty.", "decisions": []
  },
  "meta": {
    "company_name": "$COMPANY_NAME",
    "domain": "$COMPANY_DOMAIN",
    "spawned_at": "$TIMESTAMP",
    "roles": $ROLES_JSON,
    "twilio_phone": "$TWILIO_PHONE",
    "voice_enabled": $VOICE_ENABLED,
    "dashboard_url": "",
    "context_path": "${CONTEXT_FILE:-}",
    "first_boot_complete": false
  }
}
STATEOF

echo "✅ Initial state.json written"

fi  # end of "not restoring" block

# ── Helper: provision one AI agent ────────────────────────────────────────────
provision_agent() {
  local AGENT_ID="$1"
  local AGENT_NAME="$2"
  local MODEL="$3"
  local ROLE_DIR="$AGENTS_DIR/$AGENT_ID"

  echo ""
  echo "  🤖 Provisioning $AGENT_NAME ($AGENT_ID)..."

  # Add agent via CLI
  openclaw agents add "$AGENT_ID" \
    --model "$MODEL" \
    --workspace "$OC_AGENTS_DIR/$AGENT_ID/workspace" \
    2>/dev/null || echo "     (agent may already exist, continuing)"

  # Set display name
  openclaw agents set-identity \
    --agent "$AGENT_ID" \
    --name "$AGENT_NAME" \
    2>/dev/null || true

  # Copy role files into agent workspace
  local WS="$OC_AGENTS_DIR/$AGENT_ID/workspace"
  mkdir -p "$WS"

  # Copy private role files
  [[ -f "$ROLE_DIR/SOUL.md" ]]     && cp "$ROLE_DIR/SOUL.md"     "$WS/SOUL.md"
  [[ -f "$ROLE_DIR/AGENTS.md" ]]   && cp "$ROLE_DIR/AGENTS.md"   "$WS/AGENTS.md"
  [[ -f "$ROLE_DIR/ROUTINES.md" ]] && cp "$ROLE_DIR/ROUTINES.md" "$WS/ROUTINES.md"

  # Symlink shared files (read access for all)
  ln -sf "$SHARED_DIR/COMPANY.md"         "$WS/COMPANY.md"       2>/dev/null || true
  ln -sf "$SHARED_DIR/AUTHORITY.md"       "$WS/AUTHORITY.md"     2>/dev/null || true
  ln -sf "$SHARED_DIR/DECISIONS.md"       "$WS/DECISIONS.md"     2>/dev/null || true
  ln -sf "$SHARED_DIR/RECOMMENDATIONS.md" "$WS/RECOMMENDATIONS.md" 2>/dev/null || true
  ln -sf "$SHARED_DIR/ROLES.md"           "$WS/ROLES.md"          2>/dev/null || true
  ln -sf "$SHARED_DIR/KEYS.md"            "$WS/KEYS.md"           2>/dev/null || true

  echo "     ✅ $AGENT_NAME ready"
}

# ── Helper: inject API keys into agent config ────────────────────────────────
inject_agent_keys() {
  local AGENT_ID="$1"
  shift
  local KEYS=("$@")

  for KEY in "${KEYS[@]}"; do
    local VALUE="${!KEY:-}"
    if [[ -n "$VALUE" ]]; then
      openclaw config set "agents.list[id=$AGENT_ID].env.$KEY" "$VALUE" 2>/dev/null || true
    fi
  done
}

# ── Provision VP agents ──────────────────────────────────────────────────────
VP_ROLES=("vp-product" "vp-engineering" "vp-marketing" "vp-finance")
VP_NAMES=("🎯 VP Product" "⚙️  VP Engineering" "📣 VP Marketing" "💰 VP Finance")

for i in "${!VP_ROLES[@]}"; do
  role="${VP_ROLES[$i]}"
  name="${VP_NAMES[$i]}"
  role_type="${ROLE_TYPES[$role]:-ai}"

  if [[ "$role_type" == "human" ]]; then
    echo ""
    echo "  👤 $role assigned to human — skipping agent creation"
    continue
  fi

  provision_agent "$role" "$name" "claude-sonnet-4-5"
done

# ── Copy templates to VP Engineering workspace ────────────────────────────────
if [[ "${ROLE_TYPES[vp-engineering]:-ai}" == "ai" ]]; then
  VPE_WS="$OC_AGENTS_DIR/vp-engineering/workspace"
  if [[ -d "$TEMPLATES_DIR" ]]; then
    cp -r "$TEMPLATES_DIR" "$VPE_WS/templates" 2>/dev/null || true
    echo "  ✅ Templates copied to VP Engineering workspace"
  fi
fi

# ── Provision CEO last ────────────────────────────────────────────────────────
CEO_TYPE="${ROLE_TYPES[ceo]:-ai}"
if [[ "$CEO_TYPE" == "ai" ]]; then
  provision_agent "ceo" "👔 CEO" "claude-opus-4-5"

  # Inject CEO keys
  inject_agent_keys "ceo" "TELEGRAM_BOT_TOKEN" "TWILIO_ACCOUNT_SID" "TWILIO_AUTH_TOKEN" \
    "XAI_API_KEY" "ELEVENLABS_API_KEY"
fi

# ── Inject VP Engineering infra keys ──────────────────────────────────────────
if [[ "${ROLE_TYPES[vp-engineering]:-ai}" == "ai" ]]; then
  inject_agent_keys "vp-engineering" "TELEGRAM_BOT_TOKEN" "TWILIO_ACCOUNT_SID" "TWILIO_AUTH_TOKEN" \
    "XAI_API_KEY" "ELEVENLABS_API_KEY"
fi

# ── Configure tool policies ───────────────────────────────────────────────────
echo ""
echo "  🔒 Applying tool policies..."

# VPs: web_search + agentToAgent, no exec, no filesystem writes
for VP in vp-product vp-engineering vp-marketing vp-finance; do
  if [[ "${ROLE_TYPES[$VP]:-ai}" != "ai" ]]; then continue; fi

  openclaw config set "agents.list[id=$VP].tools.allow" \
    '["web_search","agentToAgent","read_file"]' 2>/dev/null || true
  openclaw config set "agents.list[id=$VP].tools.deny" \
    '["exec","bash","write_file","delete_file"]' 2>/dev/null || true
  # Allow spawning sub-agents (one level deep)
  openclaw config set "agents.list[id=$VP].subagents.maxDepth" "1" 2>/dev/null || true
done

# VP Engineering gets exec access (it builds things)
if [[ "${ROLE_TYPES[vp-engineering]:-ai}" == "ai" ]]; then
  openclaw config set "agents.list[id=vp-engineering].tools.allow" \
    '["web_search","agentToAgent","read_file","write_file","exec"]' 2>/dev/null || true
  openclaw config set "agents.list[id=vp-engineering].tools.deny" \
    '["delete_file"]' 2>/dev/null || true
fi

# CEO: full read/write on shared dir, agentToAgent, web_search
if [[ "$CEO_TYPE" == "ai" ]]; then
  openclaw config set "agents.list[id=ceo].tools.allow" \
    '["web_search","agentToAgent","read_file","write_file","exec"]' 2>/dev/null || true

  # Build allowAgents list from AI roles only
  ALLOW_AGENTS="["
  first=true
  for role in "${VP_ROLES[@]}"; do
    if [[ "${ROLE_TYPES[$role]:-ai}" == "ai" ]]; then
      if [[ "$first" == "true" ]]; then first=false; else ALLOW_AGENTS+=","; fi
      ALLOW_AGENTS+="\"$role\""
    fi
  done
  ALLOW_AGENTS+="]"
  openclaw config set "agents.list[id=ceo].subagents.allowAgents" "$ALLOW_AGENTS" 2>/dev/null || true
fi

echo "  ✅ Tool policies applied"

# ── Build & install state machine plugin ──────────────────────────────────────
if [[ -n "$PLUGIN_DIR" && -d "$PLUGIN_DIR" ]]; then
  echo ""
  echo "  🔧 Building state machine plugin..."
  if (cd "$PLUGIN_DIR" && npm run build 2>/dev/null); then
    echo "  ✅ Plugin built"
    openclaw plugins add "$PLUGIN_DIR" 2>/dev/null || \
      echo "  ℹ️  Plugin may already be registered"
  else
    echo "  ⚠️  Plugin build failed — install manually: cd $PLUGIN_DIR && npm run build"
  fi
elif [[ -z "$PLUGIN_DIR" ]]; then
  # Try default location
  DEFAULT_PLUGIN="$HOME/code/company"
  if [[ -d "$DEFAULT_PLUGIN/src/state-machine.ts" || -d "$DEFAULT_PLUGIN/dist" ]]; then
    echo ""
    echo "  🔧 Found state machine plugin at $DEFAULT_PLUGIN"
    if [[ -d "$DEFAULT_PLUGIN/dist" ]]; then
      openclaw plugins add "$DEFAULT_PLUGIN" 2>/dev/null || true
      echo "  ✅ Plugin registered"
    else
      echo "  ℹ️  Plugin not built — run: cd $DEFAULT_PLUGIN && npm run build"
    fi
  fi
fi

# ── Start dashboard server ────────────────────────────────────────────────────
echo ""
echo "  📊 Starting dashboard server..."

DASHBOARD_SERVER="$TEMPLATES_DIR/dashboard/server.js"
DASHBOARD_PID_FILE="$STATE_DIR/dashboard.pid"
DASHBOARD_URL="http://localhost:$DASHBOARD_PORT"

# Kill any existing dashboard server
if [[ -f "$DASHBOARD_PID_FILE" ]]; then
  OLD_PID=$(cat "$DASHBOARD_PID_FILE" 2>/dev/null || true)
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    echo "  Stopped previous dashboard (PID $OLD_PID)"
  fi
  rm -f "$DASHBOARD_PID_FILE"
fi

# Copy dashboard files to state dir so they persist independent of skill dir
DASHBOARD_DEPLOY="$STATE_DIR/dashboard"
mkdir -p "$DASHBOARD_DEPLOY"
cp "$TEMPLATES_DIR/dashboard/index.html" "$DASHBOARD_DEPLOY/" 2>/dev/null || true
cp "$TEMPLATES_DIR/dashboard/server.js"  "$DASHBOARD_DEPLOY/" 2>/dev/null || true

if [[ -f "$DASHBOARD_DEPLOY/server.js" ]]; then
  DASHBOARD_PORT="$DASHBOARD_PORT" STATE_FILE="$STATE_DIR/state.json" \
    nohup node "$DASHBOARD_DEPLOY/server.js" > "$STATE_DIR/dashboard.log" 2>&1 &
  DASHBOARD_PID=$!
  echo "$DASHBOARD_PID" > "$DASHBOARD_PID_FILE"
  echo "  ✅ Dashboard running at $DASHBOARD_URL (PID $DASHBOARD_PID)"
else
  echo "  ⚠️  Dashboard server not found at $DASHBOARD_DEPLOY/server.js"
  DASHBOARD_URL=""
fi

# Write dashboard URL to state.json meta
if [[ -n "$DASHBOARD_URL" && -f "$STATE_DIR/state.json" ]]; then
  # Patch dashboard_url into state.json using Node (no jq dependency)
  node -e "
    const fs = require('fs');
    const f = '$STATE_DIR/state.json';
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    s.meta.dashboard_url = '$DASHBOARD_URL';
    fs.writeFileSync(f, JSON.stringify(s, null, 2));
  " 2>/dev/null || true
fi

# ── Set up CEO voice agent (ElevenLabs + Twilio) ─────────────────────────────
CEO_VOICE_READY=false
VOICE_AGENT_SCRIPT="$TEMPLATES_DIR/voice/ceo-voice-agent.js"

# Deploy voice agent scripts to state dir (always, so VP Eng can use them)
VOICE_DEPLOY="$STATE_DIR/voice"
mkdir -p "$VOICE_DEPLOY"
cp "$TEMPLATES_DIR/voice/ceo-voice-agent.js" "$VOICE_DEPLOY/" 2>/dev/null || true
cp "$TEMPLATES_DIR/voice/briefing-bridge.js" "$VOICE_DEPLOY/" 2>/dev/null || true

if [[ -n "${ELEVENLABS_API_KEY:-}" && -n "${TWILIO_ACCOUNT_SID:-}" ]]; then
  echo ""
  echo "  📞 Voice agent scripts deployed to $VOICE_DEPLOY"
  echo "  ℹ️  VP Engineering will complete voice setup (requires HTTPS tunnel)."
  echo "     The CEO will delegate this on first boot."
elif [[ -n "$TWILIO_PHONE" ]]; then
  echo ""
  echo "  ℹ️  Voice: phone number provided. VP Engineering will set up voice agent."
  echo "     Keys needed in ~/.openclaw/keys.env: ELEVENLABS_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN"
fi

# ── Restart gateway ───────────────────────────────────────────────────────────
echo ""
echo "  🔄 Restarting gateway..."
openclaw gateway restart 2>/dev/null || echo "  ℹ️  Restart gateway manually if needed: openclaw gateway restart"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏢 $COMPANY_NAME is live."
echo ""
echo "  Talk to:  CEO (the only agent in your main chat)"
echo "  VPs run autonomously and push recommendations up."
if [[ -n "$DASHBOARD_URL" ]]; then
echo ""
echo "  📊 Dashboard: $DASHBOARD_URL"
fi
if [[ -n "$TWILIO_PHONE" ]]; then
echo "  📞 Voice: VP Engineering will set up CEO voice agent"
echo "     (needs HTTPS tunnel — CEO delegates on first boot)"
fi
echo ""
echo "  CEO authority: $CEO_AUTHORITY"
echo ""
echo "  Roles:"
for role in "${!ROLE_TYPES[@]}"; do
  echo "    $role → ${ROLE_TYPES[$role]}"
done
echo ""
echo "  /company archive  — spin down (preserves state)"
echo "  /company spawn --restore  — spin back up"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
