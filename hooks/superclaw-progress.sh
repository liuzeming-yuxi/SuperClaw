#!/bin/bash
# SuperClaw Progress — Claude Code PostToolUse hook → 进度日志 + 飞书心跳
# 触发时机：每次工具调用完成后（hooks.PostToolUse）
#
# 环境变量：
#   SUPERCLAW_FEISHU_TARGET       — 飞书通知目标 open_id（空则跳过飞书）
#   SUPERCLAW_FEISHU_ACCOUNT      — 飞书账号（默认 default）
#   SUPERCLAW_HEARTBEAT_INTERVAL  — 心跳间隔秒数（默认 300）
#   SUPERCLAW_OPENCLAW_PATH       — openclaw 路径（默认 openclaw）
#   SUPERCLAW_STATE_DIR           — 状态文件目录（默认 ~/.superclaw/state）
#   SUPERCLAW_LOG_MAX_BYTES       — 日志最大字节数（默认 10485760）

set -euo pipefail

STATE_DIR="${SUPERCLAW_STATE_DIR:-$HOME/.superclaw/state}"
LOG_MAX_BYTES="${SUPERCLAW_LOG_MAX_BYTES:-10485760}"  # 10 MiB default
FEISHU_TARGET="${SUPERCLAW_FEISHU_TARGET:-}"
FEISHU_ACCOUNT="${SUPERCLAW_FEISHU_ACCOUNT:-default}"
HEARTBEAT_INTERVAL="${SUPERCLAW_HEARTBEAT_INTERVAL:-300}"
OPENCLAW_PATH="${SUPERCLAW_OPENCLAW_PATH:-openclaw}"

mkdir -p "$STATE_DIR"

# Read hook input from stdin
HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# ── Rotate log if it exceeds size limit ──────────────────────────────────────
LOG_FILE="$STATE_DIR/tool_log.jsonl"
if [[ -f "$LOG_FILE" ]] && [[ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt "$LOG_MAX_BYTES" ]]; then
  mv "$LOG_FILE" "${LOG_FILE}.1"
fi

# ── Append to progress log (JSONL format, one line per tool call) ─────────────
echo "{\"tool\":\"$TOOL_NAME\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
  >> "$LOG_FILE"

# ── Heartbeat logic ───────────────────────────────────────────────────────────

SESSIONS_DIR="$STATE_DIR/sessions"

# Match a live session: scan session JSON files for one whose pid is alive
MATCHED_SESSION=""
MATCHED_CWD=""
MATCHED_START=""

if [[ -d "$SESSIONS_DIR" ]]; then
  for session_file in "$SESSIONS_DIR"/*.json; do
    [[ -f "$session_file" ]] || continue
    pid=$(jq -r '.pid // empty' "$session_file" 2>/dev/null) || continue
    [[ -n "$pid" ]] || continue
    if kill -0 "$pid" 2>/dev/null; then
      MATCHED_SESSION=$(jq -r '.session_name // empty' "$session_file" 2>/dev/null) || true
      MATCHED_CWD=$(jq -r '.cwd // empty' "$session_file" 2>/dev/null) || true
      MATCHED_START=$(jq -r '.start_time // empty' "$session_file" 2>/dev/null) || true
      break
    fi
  done
fi

# No live session found → exit (untracked task, skip heartbeat)
if [[ -z "$MATCHED_SESSION" ]]; then
  exit 0
fi

HEARTBEAT_FILE="$SESSIONS_DIR/${MATCHED_SESSION}.heartbeat"
NOW=$(date +%s)

# First call: write timestamp and exit (starts the clock, no message yet)
if [[ ! -f "$HEARTBEAT_FILE" ]]; then
  echo "$NOW" > "$HEARTBEAT_FILE"
  exit 0
fi

LAST_TS=$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
ELAPSED_SINCE_HB=$(( NOW - LAST_TS ))

# Interval not yet elapsed → skip
if (( ELAPSED_SINCE_HB < HEARTBEAT_INTERVAL )); then
  exit 0
fi

# ── Interval elapsed: build message and send ──────────────────────────────────

# Compute elapsed minutes since session start
ELAPSED_MINS=0
if [[ -n "$MATCHED_START" ]]; then
  START_EPOCH=$(date -d "$MATCHED_START" +%s 2>/dev/null || echo "$NOW")
  ELAPSED_MINS=$(( (NOW - START_EPOCH) / 60 ))
fi

# Count tool calls for this session from log
TOOL_COUNT=0
if [[ -f "$LOG_FILE" ]]; then
  TOOL_COUNT=$(grep -c "\"session_id\":\"$SESSION_ID\"" "$LOG_FILE" 2>/dev/null || echo 0)
fi

# Last 5 tool names
RECENT_TOOLS=""
if [[ -f "$LOG_FILE" ]]; then
  RECENT_TOOLS=$(grep "\"session_id\":\"$SESSION_ID\"" "$LOG_FILE" 2>/dev/null \
    | tail -5 \
    | jq -r '.tool' 2>/dev/null \
    | paste -sd ', ' \
    || echo "")
fi

CWD_BASENAME=$(basename "$MATCHED_CWD")

MESSAGE="📡 CC 进度 | ${MATCHED_SESSION} | ${CWD_BASENAME}
⏱ 已运行 ${ELAPSED_MINS}m | 工具调用 ${TOOL_COUNT} 次
🔧 最近: ${RECENT_TOOLS}"

# Send Feishu if target configured
if [[ -n "$FEISHU_TARGET" ]]; then
  "$OPENCLAW_PATH" message send \
    --channel feishu \
    --account "$FEISHU_ACCOUNT" \
    --target "$FEISHU_TARGET" \
    --message "$MESSAGE" 2>/dev/null || true
fi

# Update heartbeat timestamp
echo "$NOW" > "$HEARTBEAT_FILE"

exit 0
