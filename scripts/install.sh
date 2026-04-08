#!/usr/bin/env bash
# SuperClaw installer — unified all-symlink installer
# Usage: bash scripts/install.sh [options]
#
# Options:
#   --repo-dir DIR       SuperClaw repo location (default: auto-detect from script location)
#   --skip-hooks         Skip Claude Code hook configuration
#   --dry-run            Print what would be done without doing it
#   --help               Show this help
#
# Environment variables:
#   SUPERCLAW_FEISHU_TARGET   Feishu open_id for notifications (optional)
#   SUPERCLAW_FEISHU_ACCOUNT  Feishu account name (default: default)

set -euo pipefail

# ─── Defaults ────────────────────────────────���────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SC_SKILL_DIR="${HOME}/.openclaw/workspace/skills/superclaw"
CLI_SKILL_DIR="${HOME}/.openclaw/workspace/skills/superclaw-cli"
BIN_DIR="${HOME}/.openclaw/workspace/bin"
HOOKS_DIR="${HOME}/.superclaw/hooks"
STATE_DIR="${HOME}/.superclaw/state"
SKIP_HOOKS=false
DRY_RUN=false

# ─── Colors ────────────────────────────────────────────────────��──────────────

info()  { printf '\033[1;34m[superclaw]\033[0m %s\n' "$1"; }
ok()    { printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
warn()  { printf '  \033[1;33m⚠️\033[0m  %s\n' "$1"; }
fail()  { printf '  \033[1;31m❌\033[0m %s\n' "$1"; }
step()  { printf '\n\033[1m## %s\033[0m\n\n' "$1"; }

# ─── Args ─────────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir)       REPO_DIR="$2"; shift 2 ;;
    --skip-hooks)     SKIP_HOOKS=true; shift ;;
    --dry-run)        DRY_RUN=true; shift ;;
    --help)
      head -20 "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

run() {
  if $DRY_RUN; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

# Create symlink, removing any existing file/link first.
# Handles same-inode edge cases (hardlinks from previous cp-based installs,
# overlayfs, or skill dir being a symlink into the repo tree).
make_link() {
  local src="$1" dst="$2"
  if $DRY_RUN; then
    echo "  [dry-run] ln -sfn $src $dst"
    return
  fi
  # If dst already resolves to the same real path as src, skip
  local real_src real_dst
  real_src="$(readlink -f "$src" 2>/dev/null || true)"
  real_dst="$(readlink -f "$dst" 2>/dev/null || true)"
  if [[ -n "$real_src" ]] && [[ "$real_src" = "$real_dst" ]]; then
    # Already pointing to the right place (or IS the same file)
    return
  fi
  rm -f "$dst"
  ln -sfn "$src" "$dst"
}

# Clean up temp files on exit
cleanup() {
  local settings="${HOME}/.claude/settings.json.tmp"
  [[ -f "$settings" ]] && rm -f "$settings" || true
}
trap cleanup EXIT

# ─── Preflight ────────────────────────────────────────────────────────────────

step "Preflight checks"

ERRORS=0

if ! command -v node &>/dev/null; then
  fail "Node.js not found in PATH"
  ((ERRORS++)) || true
else
  NODE_VER=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
  if [[ $NODE_MAJOR -ge 18 ]]; then
    ok "Node.js: $NODE_VER"
  else
    fail "Node.js $NODE_VER too old (>= 18 required)"
    ((ERRORS++)) || true
  fi
fi

if ! command -v jq &>/dev/null; then
  fail "jq not found (required by hooks)"
  ((ERRORS++)) || true
else
  ok "jq: $(jq --version 2>/dev/null)"
fi

if ! command -v git &>/dev/null; then
  fail "git not found in PATH"
  ((ERRORS++)) || true
else
  ok "git: $(git --version 2>/dev/null)"
fi

if [[ ! -f "$REPO_DIR/package.json" ]]; then
  fail "SuperClaw repo not found at $REPO_DIR"
  ((ERRORS++)) || true
else
  VERSION=$(jq -r '.version' "$REPO_DIR/package.json")
  ok "SuperClaw repo: $REPO_DIR (v$VERSION)"
fi

if ! command -v claude &>/dev/null; then
  warn "Claude Code not found in PATH — install it before using SuperClaw"
else
  ok "Claude Code: $(claude --version 2>/dev/null || echo 'installed')"
fi

if [[ $ERRORS -gt 0 ]]; then
  echo ""
  fail "Preflight failed with $ERRORS error(s). Fix the above issues and re-run."
  exit 1
fi

# ─── Part 1: OpenClaw Skills ─────────────────────────────────────────────────

step "Part 1: OpenClaw Skills"

# --- 1a: superclaw skill ---

run mkdir -p "$SC_SKILL_DIR/references"

# SKILL.md — symlink to repo if it exists, otherwise generate inline
SC_SKILL_SRC="$REPO_DIR/skills/superclaw/SKILL.md"
if [[ -f "$SC_SKILL_SRC" ]]; then
  make_link "$SC_SKILL_SRC" "$SC_SKILL_DIR/SKILL.md"
  ok "Linked: superclaw SKILL.md → $SC_SKILL_SRC"
else
  # Generate inline SKILL.md (repo does not have skills/superclaw/SKILL.md yet)
  if ! $DRY_RUN; then
cat > "$SC_SKILL_DIR/SKILL.md" << 'SKILLEOF'
---
name: superclaw
description: |
  SuperClaw — OpenClaw + Claude Code 超级编码体。
  当用户要求开发功能、写代码、实现需求时使用。
  自动走 align → plan → execute → verify → deliver 五阶段流程。

  Use when:
  (1) 用户提出开发需求（"帮我实现 xxx"、"写一个 xxx"）
  (2) 用户说"用 SuperClaw"、"走 SuperClaw 流程"
  (3) 需要 OpenClaw 和 Claude Code 协作完成编码任务
---

# SuperClaw

OpenClaw + Claude Code 的超级编码体。人管方向，OpenClaw 管对齐和验收，Claude Code 管执行。

## 工作流

人 →[align]→ spec → 人 approve →[plan]→ plan → 人 approve（可跳过）
  →[execute]→ Claude Code 自治 →[verify]→ OpenClaw 独立验收 →[deliver]→ 人最终验收

## 阶段入口

| 阶段 | 文件 | 触发条件 |
|---|---|---|
| align | `references/align.md` | 新需求进来 |
| plan | `references/plan.md` | spec 已 approve |
| execute | `references/execute.md` | plan 已 approve |
| verify | `references/verify.md` | execute 完成 |
| deliver | `references/deliver.md` | verify 通过 |

## 必读

**开始任何对话前，先读 `references/using-superclaw.md`。** 这里定义了你的角色边界、CC prompt 铁律、session 复用规则。

**默认从 align 开始。** 如果用户明确说"跳过 align，直接 plan"等，按用户指令走。
SKILLEOF
  fi
  ok "Generated: $SC_SKILL_DIR/SKILL.md (inline)"
fi

# Symlink phase skills into references/
for phase in align plan execute verify deliver; do
  SRC="$REPO_DIR/skills/$phase/SKILL.md"
  DST="$SC_SKILL_DIR/references/$phase.md"
  if [[ -f "$SRC" ]]; then
    make_link "$SRC" "$DST"
    ok "Linked: $phase → $SRC"
  else
    fail "Source not found: $SRC"
  fi
done

# Symlink meta-skill (using-superclaw teaches OpenClaw its role and boundaries)
SRC="$REPO_DIR/skills/using-superclaw/SKILL.md"
DST="$SC_SKILL_DIR/references/using-superclaw.md"
if [[ -f "$SRC" ]]; then
  make_link "$SRC" "$DST"
  ok "Linked: using-superclaw → $SRC"
else
  fail "Source not found: $SRC"
fi

# --- 1b: superclaw-cli skill ---

run mkdir -p "$CLI_SKILL_DIR/references"

# Symlink SKILL.md
CLI_SKILL_SRC="$REPO_DIR/cli/SKILL.md"
if [[ -f "$CLI_SKILL_SRC" ]]; then
  make_link "$CLI_SKILL_SRC" "$CLI_SKILL_DIR/SKILL.md"
  ok "Linked: superclaw-cli SKILL.md → $CLI_SKILL_SRC"
else
  fail "Source not found: $CLI_SKILL_SRC"
fi

# Symlink setup-guide.md
SETUP_GUIDE_SRC="$REPO_DIR/cli/references/setup-guide.md"
if [[ -f "$SETUP_GUIDE_SRC" ]]; then
  make_link "$SETUP_GUIDE_SRC" "$CLI_SKILL_DIR/references/setup-guide.md"
  ok "Linked: setup-guide.md → $SETUP_GUIDE_SRC"
else
  fail "Source not found: $SETUP_GUIDE_SRC"
fi

# ─── Part 2: Hooks ───────────────────────────────────────────────────────────

if $SKIP_HOOKS; then
  info "Skipping hooks (--skip-hooks)"
else
  step "Part 2: Claude Code Hooks"

  run mkdir -p "$HOOKS_DIR"
  run mkdir -p "$STATE_DIR"

  # Symlink hook scripts from repo (not copy!)
  for hook in superclaw-notify.sh superclaw-progress.sh; do
    SRC="$REPO_DIR/hooks/$hook"
    DST="$HOOKS_DIR/$hook"
    if [[ -f "$SRC" ]]; then
      make_link "$SRC" "$DST"
      ok "Linked hook: $hook → $SRC"
    else
      fail "Hook source not found: $SRC"
    fi
  done

  # Configure Claude Code settings.json
  CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

  if [[ -f "$CLAUDE_SETTINGS" ]]; then
    if ! $DRY_RUN; then
      # Check if hooks already configured (search nested .hooks[].hooks[].command)
      STOP_EXISTS=$(jq -r '[.hooks.Stop[]?.hooks[]?.command // empty] | map(select(contains("superclaw"))) | length' "$CLAUDE_SETTINGS" 2>/dev/null || echo "0")
      PTU_EXISTS=$(jq -r '[.hooks.PostToolUse[]?.hooks[]?.command // empty] | map(select(contains("superclaw"))) | length' "$CLAUDE_SETTINGS" 2>/dev/null || echo "0")
      if [[ "${STOP_EXISTS:-0}" -gt 0 ]] && [[ "${PTU_EXISTS:-0}" -gt 0 ]]; then
        ok "SuperClaw hooks already in settings.json — skipping"
      else
        # Backup before modifying
        run cp "$CLAUDE_SETTINGS" "${CLAUDE_SETTINGS}.bak.$(date +%s)"
        ok "Backed up: $CLAUDE_SETTINGS"

        jq --arg notify "$HOOKS_DIR/superclaw-notify.sh" \
           --arg progress "$HOOKS_DIR/superclaw-progress.sh" \
           '.hooks = (.hooks // {}) |
            .hooks.Stop = ((.hooks.Stop // []) + [{
              "matcher": "",
              "hooks": [{"type": "command", "command": $notify, "timeout": 30}]
            }]) |
            .hooks.PostToolUse = ((.hooks.PostToolUse // []) + [{
              "matcher": "",
              "hooks": [{"type": "command", "command": $progress, "timeout": 10}]
            }])' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp" && \
          mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"
        ok "Configured hooks in $CLAUDE_SETTINGS"
      fi
    fi
  else
    warn "Claude Code settings.json not found at $CLAUDE_SETTINGS"
    warn "You may need to run Claude Code at least once, then re-run this installer"
  fi
fi

# ─── Part 3: CLI ─────────────────────────────────────────────────────────────

step "Part 3: superclaw CLI"

run mkdir -p "$BIN_DIR"
run mkdir -p "$BIN_DIR/state"

# Symlink superclaw.mjs (not copy!)
CLI_SRC="$REPO_DIR/cli/superclaw.mjs"
CLI_DST="$BIN_DIR/superclaw.mjs"
if [[ -f "$CLI_SRC" ]]; then
  make_link "$CLI_SRC" "$CLI_DST"
  ok "Linked: superclaw.mjs → $CLI_SRC"
else
  fail "Source not found: $CLI_SRC"
fi

# Create wrapper script for short command name
WRAPPER="/usr/local/bin/superclaw"
if ! $DRY_RUN; then
cat > "$WRAPPER" << WRAPEOF
#!/bin/bash
exec node "${BIN_DIR}/superclaw.mjs" "\$@"
WRAPEOF
  chmod +x "$WRAPPER"
fi
ok "Created wrapper: $WRAPPER"

# Generate .env template if not exists
ENV_FILE="${BIN_DIR}/.env"
if [[ -f "${ENV_FILE}" ]]; then
  warn ".env already exists at ${ENV_FILE} — not overwriting"
else
  if ! $DRY_RUN; then
cat > "${ENV_FILE}" << 'ENVEOF'
# Claude Code environment variables
# Fill in your values and save.

# API endpoint (your proxy or https://api.anthropic.com)
ANTHROPIC_BASE_URL=https://api.anthropic.com

# API key or auth token
ANTHROPIC_AUTH_TOKEN=sk-your-token-here

# Disable non-essential traffic (recommended for proxied setups)
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
ENVEOF
    ok "Created .env template at ${ENV_FILE}"
    warn "Edit ${ENV_FILE} and fill in your ANTHROPIC_AUTH_TOKEN before use!"
  fi
fi

if ! $DRY_RUN; then
  chmod 600 "${ENV_FILE}"
fi
ok "Permissions set (${ENV_FILE} is 600)"

# ─── Part 4: Version stamp ───────────────────────────────────────────────────

step "Part 4: Version stamp"

if ! $DRY_RUN; then
  COMMIT_FULL=$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
  COMMIT_SHORT=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  INSTALLED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  mkdir -p "${HOME}/.superclaw"
  cat > "${HOME}/.superclaw/installed.json" << STAMPEOF
{
  "version": "${VERSION}",
  "commit": "${COMMIT_SHORT}",
  "commitFull": "${COMMIT_FULL}",
  "installedAt": "${INSTALLED_AT}",
  "repoPath": "${REPO_DIR}",
  "installer": "scripts/install.sh"
}
STAMPEOF
  ok "Wrote ${HOME}/.superclaw/installed.json"
else
  echo "  [dry-run] write ${HOME}/.superclaw/installed.json"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

step "Installation complete"

echo "  SuperClaw skill:     $SC_SKILL_DIR"
echo "  superclaw-cli skill: $CLI_SKILL_DIR"
echo "  CLI binary:          $BIN_DIR/superclaw.mjs"
echo "  Hooks:               $HOOKS_DIR"
echo "  State:               $STATE_DIR"
echo "  Version stamp:       ${HOME}/.superclaw/installed.json"
echo ""

if [[ -z "${SUPERCLAW_FEISHU_TARGET:-}" ]]; then
  warn "SUPERCLAW_FEISHU_TARGET not set — Feishu notifications disabled"
  echo "  To enable: export SUPERCLAW_FEISHU_TARGET=\"ou_your_open_id\""
  echo ""
fi

info "Verify installation:"
echo "  bash $REPO_DIR/tests/run-all.sh"
echo ""
info "Quick start — tell OpenClaw:"
echo '  "用 SuperClaw 帮我写一个 hello world"'
echo ""
