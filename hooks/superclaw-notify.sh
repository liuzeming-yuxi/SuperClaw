#!/bin/bash
# SuperClaw Notify — Claude Code Stop hook → 飞书通知 + 状态文件
# 触发时机：Claude Code session 结束（hooks.Stop）
#
# 环境变量：
#   SUPERCLAW_FEISHU_TARGET   — 飞书通知目标 open_id（必填，否则跳过飞书通知）
#   SUPERCLAW_FEISHU_ACCOUNT  — 飞书账号（默认 default）
#   SUPERCLAW_OPENCLAW_PATH   — openclaw 路径（默认 openclaw）
#   SUPERCLAW_STATE_DIR       — 状态文件目录（默认 ~/.superclaw/state）
#   SUPERCLAW_LOG_MAX_BYTES   — 日志最大字节数（默认 10485760）

set -euo pipefail

FEISHU_ACCOUNT="${SUPERCLAW_FEISHU_ACCOUNT:-default}"
FEISHU_TARGET="${SUPERCLAW_FEISHU_TARGET:-}"
OPENCLAW_PATH="${SUPERCLAW_OPENCLAW_PATH:-openclaw}"
STATE_DIR="${SUPERCLAW_STATE_DIR:-$HOME/.superclaw/state}"
LOG_MAX_BYTES="${SUPERCLAW_LOG_MAX_BYTES:-10485760}"  # 10 MiB default

mkdir -p "$STATE_DIR"

# ── Helper: Rotate log if it exceeds size limit ───────────────────────────────
rotate_log() {
  local logfile="$1"
  if [[ -f "$logfile" ]] && [[ "$(stat -c%s "$logfile" 2>/dev/null || echo 0)" -gt "$LOG_MAX_BYTES" ]]; then
    mv "$logfile" "${logfile}.1"
  fi
}

# ── Helper: Send Feishu message ───────────────────────────────────────────────
send_feishu() {
  local message="$1"
  [[ -n "$FEISHU_TARGET" ]] || return 0
  "$OPENCLAW_PATH" message send \
    --channel feishu \
    --account "$FEISHU_ACCOUNT" \
    --target "$FEISHU_TARGET" \
    --message "$message" 2>/dev/null || true
}

# ── Helper: Find session file by session_id ───────────────────────────────────
find_session_file() {
  local sid="$1"
  local sessions_dir="$STATE_DIR/sessions"
  [[ -d "$sessions_dir" ]] || return 0
  for f in "$sessions_dir"/*.json; do
    [[ -f "$f" ]] || continue
    local fid
    fid=$(jq -r '.session_id // empty' "$f" 2>/dev/null) || continue
    if [[ "$fid" == "$sid" ]]; then
      echo "$f"
      return 0
    fi
  done
}

# ── Helper: Cleanup session files ─────────────────────────────────────────────
cleanup_session() {
  local name="$1"
  local sessions_dir="$STATE_DIR/sessions"
  rm -f "$sessions_dir/${name}.json"
  rm -f "$sessions_dir/${name}.heartbeat"
}

# ── Read hook input from stdin ────────────────────────────────────────────────
HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
NOW=$(date +%s)

LOG_FILE="$STATE_DIR/tool_log.jsonl"

case "$TOOL_NAME" in
  "Stop")
    # ── Parse stop_reason ─────────────────────────────────────────────────────
    STOP_REASON=$(echo "$HOOK_INPUT" | jq -r '.stop_reason // ""')

    # ── Find matching session file ────────────────────────────────────────────
    SESSION_FILE=$(find_session_file "$SESSION_ID")

    SESSION_NAME="unknown"
    SESSION_CWD="."
    START_TIME=""

    if [[ -n "$SESSION_FILE" && -f "$SESSION_FILE" ]]; then
      SESSION_NAME=$(jq -r '.session_name // "unknown"' "$SESSION_FILE" 2>/dev/null || echo "unknown")
      SESSION_CWD=$(jq -r '.cwd // "."' "$SESSION_FILE" 2>/dev/null || echo ".")
      START_TIME=$(jq -r '.start_time // ""' "$SESSION_FILE" 2>/dev/null || echo "")
    fi

    CWD_BASENAME=$(basename "$SESSION_CWD")

    # ── Calculate elapsed minutes ─────────────────────────────────────────────
    ELAPSED=0
    if [[ -n "$START_TIME" ]]; then
      START_EPOCH=$(date -d "$START_TIME" +%s 2>/dev/null || echo "$NOW")
      ELAPSED=$(( (NOW - START_EPOCH) / 60 ))
    fi

    # ── Count total tool calls for this session ───────────────────────────────
    TOOL_COUNT=0
    if [[ -f "$LOG_FILE" ]]; then
      TOOL_COUNT=$(grep -c "\"session_id\":\"$SESSION_ID\"" "$LOG_FILE" 2>/dev/null || echo 0)
    fi

    # ── Classify exit and build message ──────────────────────────────────────
    case "$STOP_REASON" in
      "end_turn")
        MESSAGE="✅ CC 完成 | ${SESSION_NAME} | ${CWD_BASENAME}
⏱ 耗时 ${ELAPSED}m | 工具调用 ${TOOL_COUNT} 次"
        ;;
      "tool_error"|"max_turns")
        MESSAGE="⚠️ CC 异常结束 | ${SESSION_NAME} | ${CWD_BASENAME}
原因: ${STOP_REASON} | ⏱ 耗时 ${ELAPSED}m"
        ;;
      *)
        # Empty or unknown stop_reason → likely killed
        MESSAGE="🚨 CC 被中断 | ${SESSION_NAME} | ${CWD_BASENAME}
可能原因: SIGTERM/SIGKILL/Gateway 崩溃
⏱ 已运行 ${ELAPSED}m | 工具调用 ${TOOL_COUNT} 次"
        ;;
    esac

    # ── Send Feishu notification ──────────────────────────────────────────────
    send_feishu "$MESSAGE"

    # ── Write last_event.json ─────────────────────────────────────────────────
    cat > "$STATE_DIR/last_event.json" <<EOF
{"event":"execute_done","session_id":"$SESSION_ID","timestamp":"$TIMESTAMP","tool_name":"$TOOL_NAME","stop_reason":"$STOP_REASON"}
EOF

    # ── Cleanup current session ───────────────────────────────────────────────
    if [[ "$SESSION_NAME" != "unknown" ]]; then
      cleanup_session "$SESSION_NAME"
    fi

    # ── Orphan scan: check remaining session files ────────────────────────────
    SESSIONS_DIR="$STATE_DIR/sessions"
    if [[ -d "$SESSIONS_DIR" ]]; then
      for orphan_file in "$SESSIONS_DIR"/*.json; do
        [[ -f "$orphan_file" ]] || continue
        orphan_pid=$(jq -r '.pid // empty' "$orphan_file" 2>/dev/null) || continue
        [[ -n "$orphan_pid" ]] || continue

        # Check if pid is still alive
        if ! kill -0 "$orphan_pid" 2>/dev/null; then
          # Process is dead — orphan detected
          orphan_name=$(jq -r '.session_name // "unknown"' "$orphan_file" 2>/dev/null || echo "unknown")
          orphan_cwd=$(jq -r '.cwd // "."' "$orphan_file" 2>/dev/null || echo ".")
          orphan_start=$(jq -r '.start_time // ""' "$orphan_file" 2>/dev/null || echo "")
          orphan_cwd_base=$(basename "$orphan_cwd")

          orphan_elapsed=0
          if [[ -n "$orphan_start" ]]; then
            orphan_start_epoch=$(date -d "$orphan_start" +%s 2>/dev/null || echo "$NOW")
            orphan_elapsed=$(( (NOW - orphan_start_epoch) / 60 ))
          fi

          ORPHAN_MSG="🚨 CC 孤儿进程 | ${orphan_name} | ${orphan_cwd_base}
PID ${orphan_pid} 已不存在 | 已运行 ${orphan_elapsed}m"

          send_feishu "$ORPHAN_MSG"
          cleanup_session "$orphan_name"
        fi
      done
    fi

    # ── System orphan scan: kill PPID=1 claude-agent-acp processes ─────────
    # When Gateway crashes, CC processes become orphans (reparented to init).
    # These consume memory indefinitely. Clean them up on each Stop event.
    while IFS= read -r orphan_line; do
      [[ -n "$orphan_line" ]] || continue
      sys_pid=$(echo "$orphan_line" | awk '{print $1}')
      sys_start=$(echo "$orphan_line" | awk '{print $5, $6, $7, $8, $9}')
      # Don't kill processes less than 10 minutes old (might be starting up)
      sys_elapsed_s=0
      sys_start_epoch=$(date -d "$sys_start" +%s 2>/dev/null || echo "$NOW")
      sys_elapsed_s=$((NOW - sys_start_epoch))
      if [[ "$sys_elapsed_s" -gt 600 ]]; then
        sys_elapsed_m=$((sys_elapsed_s / 60))
        kill "$sys_pid" 2>/dev/null || true
        send_feishu "🧹 清理孤儿 CC 进程 | PID ${sys_pid} | 已运行 ${sys_elapsed_m}m | PPID=1 (Gateway 崩溃遗留)"
      fi
    done < <(ps -eo pid,ppid,lstart,cmd 2>/dev/null | grep "claude-agent-acp" | grep -v grep | awk '$2 == 1 {print}')
    ;;

  *)
    # Non-Stop events: log only
    rotate_log "$LOG_FILE"
    echo "{\"tool\":\"$TOOL_NAME\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
      >> "$LOG_FILE"
    ;;
esac

exit 0
