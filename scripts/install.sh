#!/usr/bin/env bash
# SuperClaw installer
# Usage: bash scripts/install.sh [options]
#
# Options:
#   --repo-dir DIR       SuperClaw repo location (default: auto-detect from script location)
#   --skip-cc-delegate   Skip cc-delegate installation (install OpenClaw skills + hooks only)
#   --skip-hooks         Skip Claude Code hook configuration
#   --delegate-user USER Non-root user for Claude Code (default: testclaude)
#   --dry-run            Print what would be done without doing it
#   --help               Show this help
#
# Environment variables:
#   SUPERCLAW_FEISHU_TARGET   Feishu open_id for notifications (optional)
#   SUPERCLAW_FEISHU_ACCOUNT  Feishu account name (default: default)

set -euo pipefail

# ─── Defaults ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_DIR="${HOME}/.openclaw/workspace/skills/superclaw"
CC_SKILL_DIR="${HOME}/.openclaw/workspace/skills/cc-delegate"
HOOKS_DIR="${HOME}/.superclaw/hooks"
STATE_DIR="${HOME}/.superclaw/state"
DELEGATE_USER="testclaude"
SKIP_CC_DELEGATE=false
SKIP_HOOKS=false
DRY_RUN=false

# ─── Colors ───────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34m[superclaw]\033[0m %s\n' "$1"; }
ok()    { printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
warn()  { printf '  \033[1;33m⚠️\033[0m  %s\n' "$1"; }
fail()  { printf '  \033[1;31m❌\033[0m %s\n' "$1"; }
step()  { printf '\n\033[1m## %s\033[0m\n\n' "$1"; }

# ─── Args ─────────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir)       REPO_DIR="$2"; shift 2 ;;
    --skip-cc-delegate) SKIP_CC_DELEGATE=true; shift ;;
    --skip-hooks)     SKIP_HOOKS=true; shift ;;
    --delegate-user)  DELEGATE_USER="$2"; shift 2 ;;
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

# ─── Preflight ────────────────────────────────────────────────────────────────

step "Preflight checks"

ERRORS=0

if ! command -v openclaw &>/dev/null; then
  fail "OpenClaw not found in PATH"
  ((ERRORS++)) || true
else
  ok "OpenClaw: $(openclaw --version 2>/dev/null || echo 'installed')"
fi

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

if [[ ! -f "$REPO_DIR/package.json" ]]; then
  fail "SuperClaw repo not found at $REPO_DIR"
  ((ERRORS++)) || true
else
  VERSION=$(jq -r '.version' "$REPO_DIR/package.json")
  ok "SuperClaw repo: $REPO_DIR (v$VERSION)"
fi

if [[ $ERRORS -gt 0 ]]; then
  echo ""
  fail "Preflight failed with $ERRORS error(s). Fix the above issues and re-run."
  exit 1
fi

# ─── Part 1: OpenClaw Skills ─────────────────────────────────────────────────

step "Part 1: OpenClaw Skills"

run mkdir -p "$SKILL_DIR/references"

# Generate SKILL.md entry
if ! $DRY_RUN; then
cat > "$SKILL_DIR/SKILL.md" << 'SKILLEOF'
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

**默认从 align 开始。** 如果用户明确说"跳过 align，直接 plan"等，按用户指令走。
SKILLEOF
fi
ok "Created $SKILL_DIR/SKILL.md"

# Symlink phase skills
for phase in align plan execute verify deliver; do
  SRC="$REPO_DIR/skills/$phase/SKILL.md"
  DST="$SKILL_DIR/references/$phase.md"
  if [[ -f "$SRC" ]]; then
    run ln -sf "$SRC" "$DST"
    ok "Linked: $phase → $SRC"
  else
    fail "Source not found: $SRC"
  fi
done

# ─── Part 2: Hooks ───────────────────────────────────────────────────────────

if $SKIP_HOOKS; then
  info "Skipping hooks (--skip-hooks)"
else
  step "Part 2: Claude Code Hooks"

  run mkdir -p "$HOOKS_DIR"
  run mkdir -p "$STATE_DIR"

  # Copy hook scripts from repo
  for hook in superclaw-notify.sh superclaw-progress.sh; do
    SRC="$REPO_DIR/hooks/$hook"
    DST="$HOOKS_DIR/$hook"
    if [[ -f "$SRC" ]]; then
      run cp "$SRC" "$DST"
      run chmod +x "$DST"
      ok "Installed hook: $hook"
    else
      fail "Hook source not found: $SRC"
    fi
  done

  # Configure Claude Code settings.json
  CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

  if [[ -f "$CLAUDE_SETTINGS" ]]; then
    # Backup
    run cp "$CLAUDE_SETTINGS" "${CLAUDE_SETTINGS}.bak.$(date +%s)"
    ok "Backed up: $CLAUDE_SETTINGS"

    if ! $DRY_RUN; then
      # Check if hooks already configured
      if jq -e '.hooks.Stop[]? | select(.command | contains("superclaw"))' "$CLAUDE_SETTINGS" &>/dev/null; then
        warn "SuperClaw hooks already in settings.json — skipping"
      else
        jq --arg notify "$HOOKS_DIR/superclaw-notify.sh" \
           --arg progress "$HOOKS_DIR/superclaw-progress.sh" \
           '.hooks = (.hooks // {}) |
            .hooks.Stop = ((.hooks.Stop // []) + [{
              "type": "command",
              "command": $notify,
              "timeout": 30
            }]) |
            .hooks.PostToolUse = ((.hooks.PostToolUse // []) + [{
              "type": "command",
              "command": $progress,
              "timeout": 10
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

# ─── Part 3: cc-delegate ─────────────────────────────────────────────────────

if $SKIP_CC_DELEGATE; then
  info "Skipping cc-delegate (--skip-cc-delegate)"
else
  step "Part 3: cc-delegate bridge"

  # Delegate to the existing cc-delegate setup script
  CC_SETUP="$REPO_DIR/cc-delegate/scripts/setup.sh"

  if [[ -f "$CC_SETUP" ]]; then
    if [[ $EUID -eq 0 ]]; then
      info "Running cc-delegate setup as root (delegate user: $DELEGATE_USER)..."
      if $DRY_RUN; then
        echo "  [dry-run] CC_DELEGATE_USER=$DELEGATE_USER bash $CC_SETUP"
      else
        CC_DELEGATE_USER="$DELEGATE_USER" bash "$CC_SETUP"
      fi
    else
      warn "cc-delegate setup requires root. Run with sudo or as root."
      warn "Or run separately: sudo CC_DELEGATE_USER=$DELEGATE_USER bash $CC_SETUP"
    fi
  else
    fail "cc-delegate setup script not found: $CC_SETUP"
  fi

  # Install cc-delegate OpenClaw skill
  run mkdir -p "$CC_SKILL_DIR/references" "$CC_SKILL_DIR/scripts"
  for f in SKILL.md; do
    [[ -f "$REPO_DIR/cc-delegate/$f" ]] && run cp "$REPO_DIR/cc-delegate/$f" "$CC_SKILL_DIR/$f"
  done
  [[ -f "$REPO_DIR/cc-delegate/references/setup-guide.md" ]] && \
    run cp "$REPO_DIR/cc-delegate/references/setup-guide.md" "$CC_SKILL_DIR/references/"
  [[ -f "$REPO_DIR/cc-delegate/scripts/cc-delegate.mjs" ]] && \
    run cp "$REPO_DIR/cc-delegate/scripts/cc-delegate.mjs" "$CC_SKILL_DIR/scripts/"
  [[ -f "$REPO_DIR/cc-delegate/scripts/setup.sh" ]] && \
    run cp "$REPO_DIR/cc-delegate/scripts/setup.sh" "$CC_SKILL_DIR/scripts/"
  ok "Installed cc-delegate skill to $CC_SKILL_DIR"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

step "Installation complete"

echo "  SuperClaw skill:    $SKILL_DIR"
echo "  cc-delegate skill:  $CC_SKILL_DIR"
echo "  Hooks:              $HOOKS_DIR"
echo "  State:              $STATE_DIR"
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
