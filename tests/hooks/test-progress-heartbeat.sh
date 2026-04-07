#!/bin/bash
# Test superclaw-progress.sh heartbeat + Feishu logic
#
# Usage: bash tests/hooks/test-progress-heartbeat.sh

set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/superclaw-progress.sh"

# Temp dirs
TEST_STATE_DIR=$(mktemp -d)
MOCK_BIN_DIR=$(mktemp -d)
MOCK_LOG="$TEST_STATE_DIR/openclaw_calls.log"
trap "rm -rf $TEST_STATE_DIR $MOCK_BIN_DIR" EXIT

# Create a mock 'openclaw' that logs invocations
cat > "$MOCK_BIN_DIR/openclaw" <<'EOF'
#!/bin/bash
echo "$@" >> "$MOCK_OPENCLAW_LOG"
EOF
chmod +x "$MOCK_BIN_DIR/openclaw"

pass() { echo "  PASS: $1"; ((PASS++)) || true; }
fail() { echo "  FAIL: $1"; ((FAIL++)) || true; }

echo "Testing superclaw-progress.sh heartbeat"
echo ""

# ── Setup: session file with the current process PID ─────────────────────────

SESSIONS_DIR="$TEST_STATE_DIR/sessions"
mkdir -p "$SESSIONS_DIR"

SESSION_NAME="test-session"
SESSION_CWD="/root/code/myproject"
START_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

cat > "$SESSIONS_DIR/${SESSION_NAME}.json" <<EOF
{
  "session_name": "$SESSION_NAME",
  "cwd": "$SESSION_CWD",
  "model": "sonnet",
  "pid": $$,
  "start_time": "$START_TIME"
}
EOF

# Common env for all calls
export SUPERCLAW_STATE_DIR="$TEST_STATE_DIR"
export SUPERCLAW_HEARTBEAT_INTERVAL=2
export SUPERCLAW_OPENCLAW_PATH="$MOCK_BIN_DIR/openclaw"
export SUPERCLAW_FEISHU_TARGET="test_open_id_123"
export SUPERCLAW_FEISHU_ACCOUNT="default"
export MOCK_OPENCLAW_LOG="$MOCK_LOG"

# ── Test 1: First call writes heartbeat file but does NOT send Feishu ─────────

echo "Test 1: First call starts the clock (no Feishu send)"

echo '{"tool_name":"Read","session_id":"s1"}' | bash "$HOOK"

HEARTBEAT_FILE="$SESSIONS_DIR/${SESSION_NAME}.heartbeat"

if [[ -f "$HEARTBEAT_FILE" ]]; then
  pass "Heartbeat file created on first call"
else
  fail "Heartbeat file not created on first call"
fi

if [[ ! -f "$MOCK_LOG" ]] || ! grep -q "message send" "$MOCK_LOG" 2>/dev/null; then
  pass "No Feishu send on first call"
else
  fail "Feishu was sent on first call (should not happen)"
fi

# ── Test 2: Immediate second call skips (interval not elapsed) ────────────────

echo "Test 2: Immediate second call skips Feishu"

touch "$MOCK_LOG"
CALLS_BEFORE=$(wc -l < "$MOCK_LOG")
echo '{"tool_name":"Edit","session_id":"s1"}' | bash "$HOOK"
CALLS_AFTER=$(wc -l < "$MOCK_LOG")

if [[ "$CALLS_BEFORE" -eq "$CALLS_AFTER" ]]; then
  pass "No Feishu call when interval not elapsed"
else
  fail "Feishu was called before interval elapsed"
fi

# ── Test 3: After sleep 3s, call sends Feishu heartbeat ──────────────────────

echo "Test 3: After interval elapsed, Feishu heartbeat sent (sleeping 3s...)"

sleep 3

echo '{"tool_name":"Bash","session_id":"s1"}' | bash "$HOOK"

if [[ -f "$MOCK_LOG" ]] && grep -q "message send" "$MOCK_LOG" 2>/dev/null; then
  pass "Feishu sent after interval elapsed"
else
  fail "Feishu not sent after interval elapsed"
fi

# ── Test 4: Message contains session_name and cwd_basename ───────────────────

echo "Test 4: Message contains session_name and cwd basename"

if grep -q "$SESSION_NAME" "$MOCK_LOG" 2>/dev/null; then
  pass "Message contains session_name"
else
  fail "Message missing session_name"
fi

CWD_BASENAME=$(basename "$SESSION_CWD")
if grep -q "$CWD_BASENAME" "$MOCK_LOG" 2>/dev/null; then
  pass "Message contains cwd basename"
else
  fail "Message missing cwd basename"
fi

# ── Test 5: Empty FEISHU_TARGET → no send ────────────────────────────────────

echo "Test 5: Empty FEISHU_TARGET skips Feishu"

# Reset heartbeat so interval logic fires again
rm -f "$HEARTBEAT_FILE"
# First call sets the clock (no send regardless)
SUPERCLAW_FEISHU_TARGET="" bash "$HOOK" <<< '{"tool_name":"Read","session_id":"s5"}'

PREV_LOG_LINES=$(wc -l < "$MOCK_LOG")
sleep 3
# Second call after interval: no target so no Feishu send expected
SUPERCLAW_FEISHU_TARGET="" bash "$HOOK" <<< '{"tool_name":"Read","session_id":"s5"}'

NEW_LOG_LINES=$(wc -l < "$MOCK_LOG")
if [[ "$PREV_LOG_LINES" -eq "$NEW_LOG_LINES" ]]; then
  pass "Empty FEISHU_TARGET → no Feishu call"
else
  fail "Feishu called even though FEISHU_TARGET was empty"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "Results: PASS=$PASS | FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
