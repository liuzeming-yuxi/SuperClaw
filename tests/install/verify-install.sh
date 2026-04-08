#!/bin/bash
# SuperClaw Installation Verification (all-symlink layout)
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

# check_symlink PATH [LABEL [REPO_SOURCE]]
# pass if symlink pointing to existing target.
# If REPO_SOURCE is given and PATH is a regular file, also pass when both
# resolve to the same inode (bind-mount / overlayfs environments).
check_symlink() {
  local path="$1"
  local label="${2:-$1}"
  local repo_src="${3:-}"
  if [ -L "$path" ] && [ -e "$path" ]; then
    local target
    target=$(readlink "$path")
    pass "$label -> $target"
  elif [ -L "$path" ]; then
    fail "$label is a dangling symlink (target missing)"
  elif [ -f "$path" ]; then
    # In bind-mount / overlayfs setups the file may share an inode with
    # the repo source instead of appearing as a symlink.
    if [ -n "$repo_src" ] && [ -f "$repo_src" ]; then
      local ino_path ino_src
      ino_path=$(stat -c %i "$path" 2>/dev/null)
      ino_src=$(stat -c %i "$repo_src" 2>/dev/null)
      if [ "$ino_path" = "$ino_src" ]; then
        pass "$label (same inode as repo source — bind-mount OK)"
        return
      fi
    fi
    fail "$label exists but is a regular file (expected symlink)"
  else
    fail "$label not found"
  fi
}

echo "🦞 SuperClaw Installation Verification"
echo "======================================="
echo ""

# ─── Part 1: Prerequisites ───

echo "## Prerequisites"

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

if command -v git &>/dev/null; then
  pass "git installed"
else
  fail "git not found in PATH"
fi

if command -v claude &>/dev/null; then
  pass "Claude Code installed: $(claude --version 2>/dev/null || echo 'unknown version')"
else
  warn "Claude Code not found in PATH"
fi

if command -v openclaw &>/dev/null; then
  pass "OpenClaw installed: $(openclaw --version 2>/dev/null || echo 'unknown version')"
else
  warn "OpenClaw not found in PATH"
fi

echo ""

# ─── Part 2: Version Stamp ───

echo "## Version Stamp"

INSTALLED_JSON="${HOME}/.superclaw/installed.json"

if [ -f "$INSTALLED_JSON" ]; then
  pass "installed.json exists at $INSTALLED_JSON"
  if command -v jq &>/dev/null; then
    VER=$(jq -r '.version // empty' "$INSTALLED_JSON" 2>/dev/null)
    COMMIT=$(jq -r '.commit // empty' "$INSTALLED_JSON" 2>/dev/null)
    if [ -n "$VER" ]; then
      pass "version: $VER"
    else
      fail "installed.json missing 'version' field"
    fi
    if [ -n "$COMMIT" ]; then
      pass "commit: $COMMIT"
    else
      fail "installed.json missing 'commit' field"
    fi
  else
    warn "jq not available — cannot validate installed.json fields"
  fi
else
  fail "installed.json not found at $INSTALLED_JSON"
fi

echo ""

# ─── Part 3: Symlinks ───

echo "## Symlinks"

# Derive REPO_DIR from installed.json or fall back to script location
if [ -f "$INSTALLED_JSON" ] && command -v jq &>/dev/null; then
  REPO_DIR=$(jq -r '.repoPath // empty' "$INSTALLED_JSON" 2>/dev/null)
fi
if [ -z "${REPO_DIR:-}" ]; then
  # Fall back: assume this script lives at <repo>/tests/install/verify-install.sh
  REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

# 3a: CLI binary
check_symlink "/root/.openclaw/workspace/bin/superclaw.mjs" \
  "bin/superclaw.mjs" "$REPO_DIR/cli/superclaw.mjs"

# 3b: superclaw skill — SKILL.md is generated inline (regular file OK)
SC_SKILL="${HOME}/.openclaw/workspace/skills/superclaw/SKILL.md"
if [ -f "$SC_SKILL" ]; then
  pass "superclaw/SKILL.md exists (generated inline — regular file OK)"
else
  fail "superclaw/SKILL.md not found at $SC_SKILL"
fi

# 3c: superclaw phase references (all symlinks)
for phase in align plan execute verify deliver; do
  check_symlink "${HOME}/.openclaw/workspace/skills/superclaw/references/${phase}.md" \
    "superclaw/references/${phase}.md" "$REPO_DIR/skills/${phase}/SKILL.md"
done

# 3d: superclaw-cli SKILL.md (symlink)
check_symlink "${HOME}/.openclaw/workspace/skills/superclaw-cli/SKILL.md" \
  "superclaw-cli/SKILL.md" "$REPO_DIR/cli/SKILL.md"

# 3e: hooks (symlinks)
check_symlink "${HOME}/.superclaw/hooks/superclaw-notify.sh" \
  "hooks/superclaw-notify.sh" "$REPO_DIR/hooks/superclaw-notify.sh"
check_symlink "${HOME}/.superclaw/hooks/superclaw-progress.sh" \
  "hooks/superclaw-progress.sh" "$REPO_DIR/hooks/superclaw-progress.sh"

echo ""

# ─── Part 4: CLI & Env ───

echo "## CLI & Env"

if command -v superclaw &>/dev/null; then
  pass "superclaw command found in PATH: $(which superclaw)"
else
  fail "superclaw command not found in PATH"
fi

CC_ENV="/root/.openclaw/workspace/bin/.env"
if [ -f "$CC_ENV" ]; then
  PERMS=$(stat -c %a "$CC_ENV" 2>/dev/null || stat -f %Lp "$CC_ENV" 2>/dev/null)
  if [ "$PERMS" = "600" ]; then
    pass ".env exists (permissions: 600)"
  else
    fail ".env permissions are $PERMS (should be 600)"
  fi
else
  fail ".env not found at $CC_ENV"
fi

echo ""

# ─── Part 5: Hooks Configuration ───

echo "## Hooks Configuration"

CLAUDE_SETTINGS="${HOME}/.claude/settings.json"
if [ -f "$CLAUDE_SETTINGS" ]; then
  if jq -e '.hooks.Stop' "$CLAUDE_SETTINGS" &>/dev/null; then
    pass "Claude Code hooks.Stop configured"
  else
    fail "Claude Code hooks.Stop not configured in settings.json"
  fi
  if jq -e '.hooks.PostToolUse' "$CLAUDE_SETTINGS" &>/dev/null; then
    pass "Claude Code hooks.PostToolUse configured"
  else
    fail "Claude Code hooks.PostToolUse not configured in settings.json"
  fi
else
  fail "Claude Code settings.json not found at $CLAUDE_SETTINGS"
fi

echo ""

# ─── Part 6: Version Command ───

echo "## Version Command"

if command -v superclaw &>/dev/null; then
  VERSION_OUT=$(superclaw version 2>&1) && {
    pass "superclaw version: $VERSION_OUT"
  } || {
    fail "superclaw version exited with error: $VERSION_OUT"
  }
else
  fail "superclaw not in PATH — cannot run 'superclaw version'"
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
