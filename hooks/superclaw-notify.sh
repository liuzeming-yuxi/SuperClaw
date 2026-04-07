#!/bin/bash
# SuperClaw Notify — Claude Code Stop hook → 飞书通知 + 状态文件
# 触发时机：Claude Code session 结束（hooks.Stop）
#
# 环境变量：
#   SUPERCLAW_FEISHU_TARGET   — 飞书通知目标 open_id（必填，否则跳过飞书通知）
#   SUPERCLAW_FEISHU_ACCOUNT  — 飞书账号（默认 default）
#   SUPERCLAW_OPENCLAW_PATH   — openclaw 路径（默认 openclaw）
#   SUPERCLAW_STATE_DIR       — 状态文件目录（默认 ~/.superclaw/state）

set -euo pipefail

FEISHU_ACCOUNT="${SUPERCLAW_FEISHU_ACCOUNT:-default}"
FEISHU_TARGET="${SUPERCLAW_FEISHU_TARGET:-}"
OPENCLAW_PATH="${SUPERCLAW_OPENCLAW_PATH:-openclaw}"
STATE_DIR="${SUPERCLAW_STATE_DIR:-$HOME/.superclaw/state}"
LOG_MAX_BYTES="${SUPERCLAW_LOG_MAX_BYTES:-10485760}"  # 10 MiB default

mkdir -p "$STATE_DIR"

# Rotate log if it exceeds size limit
rotate_log() {
  local logfile="$1"
  if [[ -f "$logfile" ]] && [[ "$(stat -c%s "$logfile" 2>/dev/null || echo 0)" -gt "$LOG_MAX_BYTES" ]]; then
    mv "$logfile" "${logfile}.1"
  fi
}

# Read hook input from stdin
HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

case "$TOOL_NAME" in
  "Stop")
    TITLE="🦞 Claude Code 执行完成"
    MESSAGE="Session: $SESSION_ID\n📅 $TIMESTAMP"

    # Notify Feishu (skip if no target configured)
    if [ -n "$FEISHU_TARGET" ]; then
      "$OPENCLAW_PATH" message send \
        --channel feishu \
        --account "$FEISHU_ACCOUNT" \
        --target "$FEISHU_TARGET" \
        --message "$TITLE\n\n$MESSAGE" 2>/dev/null || true
    fi

    # Write state file for OpenClaw to pick up
    echo "{\"event\":\"execute_done\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\",\"tool_name\":\"$TOOL_NAME\"}" \
      > "$STATE_DIR/last_event.json"
    ;;
  *)
    # Non-Stop events: log only
    rotate_log "$STATE_DIR/tool_log.jsonl"
    echo "{\"tool\":\"$TOOL_NAME\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
      >> "$STATE_DIR/tool_log.jsonl"
    ;;
esac

exit 0
