#!/bin/bash
# Test superclaw-notify.sh hook
#
# Usage: bash tests/hooks/test-notify.sh
#
# Tests:
# 1. Stop event → creates last_event.json
# 2. Non-Stop event → appends to tool_log.jsonl
# 3. Missing jq → graceful failure

set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/superclaw-notify.sh"

TEST_STATE_DIR=$(mktemp -d)
trap "rm -rf $TEST_STATE_DIR" EXIT

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

echo "🧪 Testing superclaw-notify.sh"
echo ""

# ─── Test 1: Stop event creates last_event.json ───

echo "Test 1: Stop event"

export SUPERCLAW_STATE_DIR="$TEST_STATE_DIR"
export SUPERCLAW_FEISHU_TARGET=""

echo '{"tool_name":"Stop","session_id":"test-123"}' | bash "$HOOK"

if [ -f "$TEST_STATE_DIR/last_event.json" ]; then
  EVENT=$(cat "$TEST_STATE_DIR/last_event.json")
  if echo "$EVENT" | jq -e '.event == "execute_done"' &>/dev/null; then
    pass "Stop → last_event.json with event=execute_done"
  else
    fail "last_event.json has wrong content: $EVENT"
  fi
else
  fail "last_event.json not created"
fi

# ─── Test 2: Non-Stop event appends to tool_log.jsonl ───

echo "Test 2: Non-Stop event"

rm -f "$TEST_STATE_DIR/tool_log.jsonl"

export SUPERCLAW_STATE_DIR="$TEST_STATE_DIR"

echo '{"tool_name":"Write","session_id":"test-123"}' | bash "$HOOK"
echo '{"tool_name":"Read","session_id":"test-123"}' | bash "$HOOK"

if [ -f "$TEST_STATE_DIR/tool_log.jsonl" ]; then
  LINES=$(wc -l < "$TEST_STATE_DIR/tool_log.jsonl")
  if [ "$LINES" -eq 2 ]; then
    pass "Non-Stop → tool_log.jsonl with 2 entries"
  else
    fail "tool_log.jsonl has $LINES lines (expected 2)"
  fi
else
  fail "tool_log.jsonl not created"
fi

# ─── Test 3: State dir auto-creation ───

echo "Test 3: State dir auto-creation"

NEW_STATE="$TEST_STATE_DIR/nested/deep/state"

export SUPERCLAW_STATE_DIR="$NEW_STATE"
export SUPERCLAW_FEISHU_TARGET=""

echo '{"tool_name":"Stop","session_id":"test-456"}' | bash "$HOOK"

if [ -d "$NEW_STATE" ]; then
  pass "State dir auto-created: $NEW_STATE"
else
  fail "State dir not auto-created"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
