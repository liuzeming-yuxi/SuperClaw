#!/bin/bash
# SuperClaw Installation Verification
# Run this after installation to verify everything is set up correctly.
#
# Usage: bash tests/install/verify-install.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed

set -euo pipefail

PASS=0
FAIL=0
WARN=0

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }
warn() { echo "  ⚠️  $1"; ((WARN++)) || true; }

echo "🦞 SuperClaw Installation Verification"
echo "======================================="
echo ""

# ─── Part 1: Prerequisites ───

echo "## Prerequisites"

if command -v openclaw &>/dev/null; then
  pass "OpenClaw installed: $(openclaw --version 2>/dev/null || echo 'unknown version')"
else
  fail "OpenClaw not found in PATH"
fi

if command -v claude &>/dev/null; then
  pass "Claude Code installed: $(claude --version 2>/dev/null || echo 'unknown version')"
else
  fail "Claude Code not found in PATH"
fi

if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    pass "Node.js $NODE_VER (>= 18 required)"
  else
    fail "Node.js $NODE_VER too old (>= 18 required)"
  fi
else
  fail "Node.js not found in PATH"
fi

if command -v jq &>/dev/null; then
  pass "jq installed"
else
  fail "jq not found (required by hooks)"
fi

echo ""

# ─── Part 2: OpenClaw Skills ───

echo "## OpenClaw Skills"

SKILL_DIR="${HOME}/.openclaw/workspace/skills/superclaw"

if [ -f "$SKILL_DIR/SKILL.md" ]; then
  pass "SuperClaw skill entry: $SKILL_DIR/SKILL.md"
else
  fail "SuperClaw skill entry not found at $SKILL_DIR/SKILL.md"
fi

for phase in align plan execute verify deliver; do
  ref="$SKILL_DIR/references/${phase}.md"
  if [ -L "$ref" ] && [ -f "$ref" ]; then
    pass "Skill reference: ${phase}.md (symlink OK)"
  elif [ -f "$ref" ]; then
    warn "Skill reference: ${phase}.md (regular file, not symlink)"
  else
    fail "Skill reference: ${phase}.md missing"
  fi
done

echo ""

# ─── Part 3: cc-delegate ───

echo "## cc-delegate Bridge"

CC_DELEGATE="/home/testclaude/cc-delegate/cc-delegate.mjs"
CC_ENV="/home/testclaude/cc-delegate/.env"

if [ -f "$CC_DELEGATE" ]; then
  pass "cc-delegate script exists"
else
  fail "cc-delegate script not found at $CC_DELEGATE"
fi

if [ -f "$CC_ENV" ]; then
  PERMS=$(stat -c %a "$CC_ENV" 2>/dev/null || stat -f %Lp "$CC_ENV" 2>/dev/null)
  if [ "$PERMS" = "600" ]; then
    pass ".env exists (permissions: 600)"
  else
    warn ".env exists but permissions are $PERMS (should be 600)"
  fi
else
  fail ".env not found at $CC_ENV"
fi

if id testclaude &>/dev/null; then
  pass "testclaude user exists"
else
  fail "testclaude user not found"
fi

echo ""

# ─── Part 4: Hooks ───

echo "## Hooks"

HOOKS_DIR="${HOME}/.superclaw/hooks"

for hook in superclaw-notify.sh superclaw-progress.sh; do
  if [ -x "$HOOKS_DIR/$hook" ]; then
    pass "Hook: $hook (executable)"
  elif [ -f "$HOOKS_DIR/$hook" ]; then
    warn "Hook: $hook exists but not executable"
  else
    fail "Hook: $hook not found at $HOOKS_DIR/$hook"
  fi
done

CLAUDE_SETTINGS="${HOME}/.claude/settings.json"
if [ -f "$CLAUDE_SETTINGS" ]; then
  if jq -e '.hooks.Stop' "$CLAUDE_SETTINGS" &>/dev/null; then
    pass "Claude Code hooks.Stop configured"
  else
    fail "Claude Code hooks.Stop not configured in settings.json"
  fi
else
  fail "Claude Code settings.json not found"
fi

echo ""

# ─── Part 5: Superpowers ───

echo "## Superpowers (Claude Code)"

if [ -f "$CLAUDE_SETTINGS" ]; then
  if jq -e '.enabledPlugins["superpowers@claude-plugins-official"]' "$CLAUDE_SETTINGS" 2>/dev/null | grep -q true; then
    pass "Superpowers plugin enabled"
  else
    warn "Superpowers plugin not found in enabledPlugins"
  fi
fi

echo ""

# ─── Part 6: Environment Variables ───

echo "## Environment Variables"

if [ -n "${SUPERCLAW_FEISHU_TARGET:-}" ]; then
  pass "SUPERCLAW_FEISHU_TARGET set"
else
  warn "SUPERCLAW_FEISHU_TARGET not set (Feishu notifications disabled)"
fi

if [ -n "${SUPERCLAW_STATE_DIR:-}" ]; then
  pass "SUPERCLAW_STATE_DIR set: $SUPERCLAW_STATE_DIR"
else
  warn "SUPERCLAW_STATE_DIR not set (using default ~/.superclaw/state)"
fi

echo ""

# ─── Summary ───

echo "======================================="
echo "Results: ✅ $PASS passed | ❌ $FAIL failed | ⚠️  $WARN warnings"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "❌ Installation incomplete. Fix the failed checks above."
  exit 1
else
  if [ "$WARN" -gt 0 ]; then
    echo "⚠️  Installation OK with warnings. Review the warnings above."
  else
    echo "✅ All checks passed! SuperClaw is ready."
  fi
  exit 0
fi
