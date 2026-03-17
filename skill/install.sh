#!/usr/bin/env bash
# install.sh — installs the /company skill into OpenClaw
# Run once from the repo root: bash install.sh

set -euo pipefail

SKILL_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OC_SKILLS_DIR="$HOME/.openclaw/skills/company"

echo "Installing /company skill..."
echo ""

# Check OpenClaw is installed
if ! command -v openclaw &>/dev/null; then
  echo "OpenClaw CLI not found. Install it first: npm install -g openclaw@latest"
  exit 1
fi

echo "OpenClaw $(openclaw --version) found"

# Create skill directory
mkdir -p "$OC_SKILLS_DIR"

# Copy skill metadata
cp "$SKILL_SOURCE/SKILL.md"  "$OC_SKILLS_DIR/" 2>/dev/null || true

# Copy spawn and archive scripts
cp "$SKILL_SOURCE/spawn.sh"   "$OC_SKILLS_DIR/spawn.sh"
cp "$SKILL_SOURCE/archive.sh" "$OC_SKILLS_DIR/archive.sh"
chmod +x "$OC_SKILLS_DIR/spawn.sh" "$OC_SKILLS_DIR/archive.sh"

# Copy scripts directory if it exists
if [[ -d "$SKILL_SOURCE/scripts" ]]; then
  cp -r "$SKILL_SOURCE/scripts" "$OC_SKILLS_DIR/"
  chmod +x "$OC_SKILLS_DIR/scripts/"*.sh 2>/dev/null || true
fi

# Copy agent SOUL.md templates
cp -r "$SKILL_SOURCE/agents" "$OC_SKILLS_DIR/"

# Copy templates directory (dashboard, voice, Twilio starter code)
if [[ -d "$SKILL_SOURCE/templates" ]]; then
  cp -r "$SKILL_SOURCE/templates" "$OC_SKILLS_DIR/"
  echo "Templates installed (dashboard, voice, twilio)"
fi

# Create shared directory (will be populated at spawn time)
mkdir -p "$OC_SKILLS_DIR/shared"

echo "Skill files installed to: $OC_SKILLS_DIR"

# Register the skill with OpenClaw
openclaw skills enable company 2>/dev/null || \
  echo "Skill registration: restart OpenClaw gateway to pick up new skill"

echo ""
echo "=================================================="
echo "/company skill installed."
echo ""
echo "Usage:"
echo "  /company spawn --name 'Acme' --domain 'B2B SaaS for HR teams' \\"
echo "    --authority 'approve tactical decisions under \$10k'"
echo ""
echo "  With human roles:"
echo "  /company spawn --name 'Acme' --domain 'B2B SaaS' \\"
echo "    --roles 'ceo:ai,vp-product:human,vp-engineering:ai,vp-marketing:ai,vp-finance:ai'"
echo ""
echo "  Re-spawn (backs up existing first):"
echo "  /company spawn --force --name 'Acme' ..."
echo ""
echo "  /company status    -- check all agents"
echo "  /company brief     -- pull full VP summary"
echo "  /company shutdown  -- archive and teardown"
echo "=================================================="
