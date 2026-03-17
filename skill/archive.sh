#!/usr/bin/env bash
# /company archive — archives the current company and resets CEO to standby
# Preserves: CEO agent, Telegram connection, auth
# Archives: state.json, shared files, VP agents, workspaces, decisions history
# Removes: VP agents, company state

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$SKILL_DIR/shared"
OC_AGENTS_DIR="$HOME/.openclaw/agents"
STATE_FILE="$HOME/.openclaw/company/state.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TIMESTAMP_SAFE="${TIMESTAMP//:/}"

# ── Read company name from state ──────────────────────────────────────────────
COMPANY_NAME="unknown"
if [[ -f "$STATE_FILE" ]]; then
  # Extract company_name with basic parsing (no jq dependency)
  COMPANY_NAME=$(grep -o '"company_name"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATE_FILE" | head -1 | sed 's/.*"company_name"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "unknown")
  COMPANY_NAME="${COMPANY_NAME// /-}"
  COMPANY_NAME="${COMPANY_NAME:-unknown}"
fi

ARCHIVE_DIR="$HOME/.openclaw/archives/${COMPANY_NAME}-${TIMESTAMP_SAFE}"

echo "Archiving ${COMPANY_NAME}..."
echo ""

# ── Check there's something to archive ────────────────────────────────────────
if [[ ! -f "$STATE_FILE" && ! -d "$SHARED_DIR" ]]; then
  echo "Nothing to archive — no active company found."
  exit 1
fi

mkdir -p "$ARCHIVE_DIR"

# ── Archive state.json ────────────────────────────────────────────────────────
if [[ -f "$STATE_FILE" ]]; then
  cp "$STATE_FILE" "$ARCHIVE_DIR/state.json"
  echo "  Archived state.json"
fi

# ── Archive shared files ──────────────────────────────────────────────────────
if [[ -d "$SHARED_DIR" && "$(ls -A "$SHARED_DIR" 2>/dev/null)" ]]; then
  mkdir -p "$ARCHIVE_DIR/shared"
  cp -a "$SHARED_DIR/." "$ARCHIVE_DIR/shared/"
  echo "  Archived shared files (COMPANY.md, AUTHORITY.md, DECISIONS.md, ...)"
fi

# ── Archive agent workspaces ──────────────────────────────────────────────────
for agent_id in ceo vp-product vp-engineering vp-marketing vp-finance; do
  ws="$OC_AGENTS_DIR/$agent_id/workspace"
  if [[ -d "$ws" && "$(ls -A "$ws" 2>/dev/null)" ]]; then
    mkdir -p "$ARCHIVE_DIR/agents/$agent_id"
    # Copy workspace contents (resolve symlinks so archive is self-contained)
    cp -aL "$ws/." "$ARCHIVE_DIR/agents/$agent_id/" 2>/dev/null || \
      cp -a "$ws/." "$ARCHIVE_DIR/agents/$agent_id/"
    echo "  Archived $agent_id workspace"
  fi
done

# ── Record archive metadata ───────────────────────────────────────────────────
cat > "$ARCHIVE_DIR/ARCHIVE.md" << EOF
# Company Archive

**Company:** ${COMPANY_NAME}
**Archived:** ${TIMESTAMP}
**Source state:** ${STATE_FILE}

## Contents
- state.json — full company state at time of archive
- shared/ — all shared files (COMPANY.md, AUTHORITY.md, DECISIONS.md, etc.)
- agents/ — all agent workspaces (resolved from symlinks)

## Restore
\`\`\`
/company spawn --restore
\`\`\`
EOF

echo ""
echo "Archive saved: $ARCHIVE_DIR"
echo ""

# ── Stop dashboard server ──────────────────────────────────────────────────────
DASHBOARD_PID_FILE="$HOME/.openclaw/company/dashboard.pid"
if [[ -f "$DASHBOARD_PID_FILE" ]]; then
  DASH_PID=$(cat "$DASHBOARD_PID_FILE" 2>/dev/null || true)
  if [[ -n "$DASH_PID" ]] && kill -0 "$DASH_PID" 2>/dev/null; then
    kill "$DASH_PID" 2>/dev/null || true
    echo "  Stopped dashboard server (PID $DASH_PID)"
  fi
  rm -f "$DASHBOARD_PID_FILE"
fi

# ── Remove VP agents ──────────────────────────────────────────────────────────
echo "Spinning down VPs..."
for vp in vp-product vp-engineering vp-marketing vp-finance; do
  if openclaw agents remove "$vp" 2>/dev/null; then
    echo "  Removed $vp"
  fi
done

# ── Clean shared files ────────────────────────────────────────────────────────
rm -f "$SHARED_DIR/"*.md 2>/dev/null || true

# ── Remove state.json and dashboard deploy ────────────────────────────────────
rm -f "$STATE_FILE"
rm -rf "$HOME/.openclaw/company/dashboard" 2>/dev/null || true
rm -f "$HOME/.openclaw/company/dashboard.log" 2>/dev/null || true
rm -f "$HOME/.openclaw/company/dashboard.url" 2>/dev/null || true

# ── Reset CEO workspace ──────────────────────────────────────────────────────
CEO_WS="$OC_AGENTS_DIR/ceo/workspace"
if [[ -d "$CEO_WS" ]]; then
  # Remove symlinks to shared files (they're now dangling)
  rm -f "$CEO_WS/COMPANY.md" "$CEO_WS/AUTHORITY.md" "$CEO_WS/DECISIONS.md" \
    "$CEO_WS/RECOMMENDATIONS.md" "$CEO_WS/ROLES.md" "$CEO_WS/KEYS.md" 2>/dev/null || true
  echo "  CEO workspace cleaned (SOUL.md preserved)"
fi

# ── Restart gateway ───────────────────────────────────────────────────────────
echo ""
openclaw gateway restart 2>/dev/null || echo "Restart gateway manually: openclaw gateway restart"

echo ""
echo "=================================================="
echo "${COMPANY_NAME} archived."
echo ""
echo "  CEO is in standby mode (Telegram + auth preserved)."
echo "  VP agents removed."
echo ""
echo "  To start fresh:   /company spawn --name '...' ..."
echo "  To restore:        /company spawn --restore"
echo "  Archives:          ls ~/.openclaw/archives/"
echo "=================================================="
