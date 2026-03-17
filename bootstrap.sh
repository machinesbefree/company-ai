#!/usr/bin/env bash
# bootstrap.sh — one command to go from blank OpenClaw agent to running AI company
#
# Usage:
#   bash bootstrap.sh --name "Acme Corp" --domain "B2B SaaS for HR teams"
#
# Prerequisite: OpenClaw CLI installed (npm install -g openclaw@latest)
# Optional: ~/.openclaw/keys.env with API keys (Telegram, Twilio, ElevenLabs, xAI)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$REPO_DIR/plugin"
SKILL_DIR="$REPO_DIR/skill"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🥚 Company AI Bootstrap"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Check prerequisites ──────────────────────────────────────────────────────
if ! command -v openclaw &>/dev/null; then
  echo "OpenClaw CLI not found."
  echo "Install it: npm install -g openclaw@latest"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "Node.js not found. Install Node.js 18+ first."
  exit 1
fi

echo "✅ OpenClaw $(openclaw --version 2>/dev/null || echo 'installed')"
echo "✅ Node.js $(node --version)"
echo ""

# ── Step 1: Build the state machine plugin ────────────────────────────────────
echo "🔧 Building state machine plugin..."
(cd "$PLUGIN_DIR" && npm install --quiet 2>/dev/null && npm run build 2>/dev/null)
echo "✅ Plugin built"

# ── Step 2: Register plugin with OpenClaw ─────────────────────────────────────
echo "🔌 Registering plugin..."
openclaw plugins add "$PLUGIN_DIR" 2>/dev/null || echo "   (plugin may already be registered)"
echo "✅ Plugin registered"

# ── Step 3: Install the /company skill ────────────────────────────────────────
echo "📦 Installing /company skill..."

OC_SKILLS_DIR="$HOME/.openclaw/skills/company"
mkdir -p "$OC_SKILLS_DIR"

# Copy skill metadata
cp "$SKILL_DIR/SKILL.md" "$OC_SKILLS_DIR/" 2>/dev/null || true

# Copy scripts
cp "$SKILL_DIR/spawn.sh"   "$OC_SKILLS_DIR/spawn.sh"
cp "$SKILL_DIR/archive.sh" "$OC_SKILLS_DIR/archive.sh"
chmod +x "$OC_SKILLS_DIR/spawn.sh" "$OC_SKILLS_DIR/archive.sh"

# Copy agent SOUL.md templates
cp -r "$SKILL_DIR/agents" "$OC_SKILLS_DIR/"

# Copy the CEO SOUL.md (lives at skill root, not in agents/)
cp "$SKILL_DIR/SOUL.md" "$OC_SKILLS_DIR/SOUL.md"

# Copy templates (dashboard, voice, twilio)
cp -r "$SKILL_DIR/templates" "$OC_SKILLS_DIR/"

# Create shared directory (populated at spawn time)
mkdir -p "$OC_SKILLS_DIR/shared"

# Register skill
openclaw skills enable company 2>/dev/null || true
echo "✅ Skill installed"

# ── Step 4: Spawn the company ─────────────────────────────────────────────────
echo ""
echo "🏢 Spawning company..."
echo ""

# Pass through all args to spawn.sh, plus --plugin pointing to our built plugin
bash "$OC_SKILLS_DIR/spawn.sh" --plugin "$PLUGIN_DIR" "$@"
