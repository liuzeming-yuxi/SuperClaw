#!/bin/bash
# Test superclaw-notify.sh — exit classification + orphan scan
#
# Usage: bash tests/hooks/test-notify-abnormal.sh
#
# Tests:
# 1. Normal exit (stop_reason=end_turn) → message contains "CC 完成"
# 2. Session files cleaned up after normal exit
# 3. Warning exit (stop_reason=max_turns) → message contains "CC 异常结束"
# 4. Alert exit (no stop_reason) → message contains "CC 被中断"
# 5. Orphan detection: dead pid → orphan reported and cleaned up

set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/superclaw-notify.sh"

TEST_STATE_DIR=$(mktemp -d)
MOCK_BIN_DIR=$(mktemp -d)
MOCK_LOG="$TEST_STATE_DIR/openclaw_calls.log"

trap "rm -rf $TEST_STATE_DIR $MOCK_BIN_DIR" EXIT

# Create mock openclaw that logs --message argument
cat > "$MOCK_BIN_DIR/openclaw" <<'MOCKEOF'
#!/bin/bash
# Capture args; extract the value after --message
args=("$@")
msg=""
for i in "${!args[@]}"; do
  if [[ "${args[$i]}" == "--message" ]]; then
    msg="${args[$((i+1))]}"
    break
  fi
done
echo "$msg" >> "$MOCK_OPENCLAW_LOG"
MOCKEOF
chmod +x "$MOCK_BIN_DIR/openclaw"

pass() { echo "  PASS: $1"; ((PASS++)) || true; }
fail() { echo "  FAIL: $1"; ((FAIL++)) || true; }

echo "Testing superclaw-notify.sh (exit classification + orphan scan)"
echo ""

SESSIONS_DIR="$TEST_STATE_DIR/sessions"

# ── Shared env ────────────────────────────────────────────────────────────────
export SUPERCLAW_STATE_DIR="$TEST_STATE_DIR"
export SUPERCLAW_FEISHU_TARGET="test_open_id"
export SUPERCLAW_FEISHU_ACCOUNT="default"
export SUPERCLAW_OPENCLAW_PATH="$MOCK_BIN_DIR/openclaw"
export MOCK_OPENCLAW_LOG="$MOCK_LOG"

make_session() {
  local name="$1"
  local sid="$2"
  local pid_val="${3:-$$}"
  mkdir -p "$SESSIONS_DIR"
  local start
  start=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  cat > "$SESSIONS_DIR/${name}.json" <<EOF
{
  "session_name": "$name",
  "session_id": "$sid",
  "cwd": "/root/projects/myrepo",
  "model": "sonnet",
  "pid": $pid_val,
  "start_time": "$start"
}
EOF
}

# ── Test 1: Normal exit (end_turn) ────────────────────────────────────────────
echo "Test 1: Normal exit (stop_reason=end_turn)"

rm -f "$MOCK_LOG"
make_session "my-task" "sid-001"

echo '{"tool_name":"Stop","session_id":"sid-001","stop_reason":"end_turn"}' | bash "$HOOK"

if [[ -f "$MOCK_LOG" ]] && grep -q "CC 完成" "$MOCK_LOG" 2>/dev/null; then
  pass "Normal exit → message contains 'CC 完成'"
else
  fail "Normal exit → message missing 'CC 完成' (log: $(cat "$MOCK_LOG" 2>/dev/null || echo '<empty>'))"
fi

# ── Test 2: Session files cleaned up after normal exit ────────────────────────
echo "Test 2: Session files cleaned up after normal exit"

if [[ ! -f "$SESSIONS_DIR/my-task.json" ]]; then
  pass "Session JSON cleaned up"
else
  fail "Session JSON not removed after exit"
fi

if [[ ! -f "$SESSIONS_DIR/my-task.heartbeat" ]]; then
  pass "Heartbeat file cleaned up"
else
  fail "Heartbeat file not removed after exit"
fi

# Also verify last_event.json was written with stop_reason
if [[ -f "$TEST_STATE_DIR/last_event.json" ]]; then
  sr=$(jq -r '.stop_reason // ""' "$TEST_STATE_DIR/last_event.json" 2>/dev/null || echo "")
  if [[ "$sr" == "end_turn" ]]; then
    pass "last_event.json contains stop_reason=end_turn"
  else
    fail "last_event.json stop_reason='$sr' (expected end_turn)"
  fi
else
  fail "last_event.json not created"
fi

# ── Test 3: Warning exit (max_turns) ─────────────────────────────────────────
echo "Test 3: Warning exit (stop_reason=max_turns)"

rm -f "$MOCK_LOG"
make_session "my-task2" "sid-002"

echo '{"tool_name":"Stop","session_id":"sid-002","stop_reason":"max_turns"}' | bash "$HOOK"

if [[ -f "$MOCK_LOG" ]] && grep -q "CC 异常结束" "$MOCK_LOG" 2>/dev/null; then
  pass "Warning exit → message contains 'CC 异常结束'"
else
  fail "Warning exit → message missing 'CC 异常结束' (log: $(cat "$MOCK_LOG" 2>/dev/null || echo '<empty>'))"
fi

if [[ -f "$MOCK_LOG" ]] && grep -q "max_turns" "$MOCK_LOG" 2>/dev/null; then
  pass "Warning exit → stop_reason in message"
else
  fail "Warning exit → stop_reason missing from message"
fi

# ── Test 4: Alert exit (no stop_reason) ──────────────────────────────────────
echo "Test 4: Alert exit (empty stop_reason)"

rm -f "$MOCK_LOG"
make_session "my-task3" "sid-003"

echo '{"tool_name":"Stop","session_id":"sid-003"}' | bash "$HOOK"

if [[ -f "$MOCK_LOG" ]] && grep -q "CC 被中断" "$MOCK_LOG" 2>/dev/null; then
  pass "Alert exit → message contains 'CC 被中断'"
else
  fail "Alert exit → message missing 'CC 被中断' (log: $(cat "$MOCK_LOG" 2>/dev/null || echo '<empty>'))"
fi

# ── Test 5: Orphan detection ──────────────────────────────────────────────────
echo "Test 5: Orphan detection (dead PID)"

rm -f "$MOCK_LOG"

# Create orphan session with a PID that is certainly dead
DEAD_PID=9999999
make_session "orphan-task" "sid-orphan" "$DEAD_PID"

# Create a touch heartbeat file to also test cleanup
touch "$SESSIONS_DIR/orphan-task.heartbeat"

# Trigger any Stop event (for a different session) — orphan scan fires at end
make_session "live-task" "sid-004"

echo '{"tool_name":"Stop","session_id":"sid-004","stop_reason":"end_turn"}' | bash "$HOOK"

if [[ -f "$MOCK_LOG" ]] && grep -q "CC 孤儿进程" "$MOCK_LOG" 2>/dev/null; then
  pass "Orphan detection → message contains 'CC 孤儿进程'"
else
  fail "Orphan detection → message missing 'CC 孤儿进程' (log: $(cat "$MOCK_LOG" 2>/dev/null || echo '<empty>'))"
fi

if [[ ! -f "$SESSIONS_DIR/orphan-task.json" ]]; then
  pass "Orphan session JSON cleaned up"
else
  fail "Orphan session JSON not removed"
fi

if [[ ! -f "$SESSIONS_DIR/orphan-task.heartbeat" ]]; then
  pass "Orphan heartbeat cleaned up"
else
  fail "Orphan heartbeat not removed"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: PASS=$PASS | FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
