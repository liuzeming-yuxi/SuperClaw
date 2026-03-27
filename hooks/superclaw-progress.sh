#!/bin/bash
# SuperClaw Progress — Claude Code PostToolUse hook → 进度日志
# 触发时机：每次工具调用完成后（hooks.PostToolUse）
#
# 环境变量：
#   SUPERCLAW_STATE_DIR — 状态文件目录（默认 ~/.superclaw/state）

set -euo pipefail

STATE_DIR="${SUPERCLAW_STATE_DIR:-$HOME/.superclaw/state}"
mkdir -p "$STATE_DIR"

# Read hook input from stdin
HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Append to progress log (JSONL format, one line per tool call)
echo "{\"tool\":\"$TOOL_NAME\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
  >> "$STATE_DIR/tool_log.jsonl"

exit 0
