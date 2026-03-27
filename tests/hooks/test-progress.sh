#!/bin/bash
# Test superclaw-progress.sh hook
#
# Usage: bash tests/hooks/test-progress.sh

set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/superclaw-progress.sh"

TEST_STATE_DIR=$(mktemp -d)
trap "rm -rf $TEST_STATE_DIR" EXIT

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

echo "🧪 Testing superclaw-progress.sh"
echo ""

# ─── Test 1: Single tool call logged ───

echo "Test 1: Single tool call"

export SUPERCLAW_STATE_DIR="$TEST_STATE_DIR"

echo '{"tool_name":"Write","session_id":"s1"}' | bash "$HOOK"

if [ -f "$TEST_STATE_DIR/tool_log.jsonl" ]; then
  if jq -e '.tool == "Write"' "$TEST_STATE_DIR/tool_log.jsonl" &>/dev/null; then
    pass "Single call → tool_log.jsonl with tool=Write"
  else
    fail "tool_log.jsonl wrong content"
  fi
else
  fail "tool_log.jsonl not created"
fi

# ─── Test 2: Multiple calls appended ───

echo "Test 2: Multiple calls"

echo '{"tool_name":"Read","session_id":"s1"}' | bash "$HOOK"
echo '{"tool_name":"Edit","session_id":"s1"}' | bash "$HOOK"

LINES=$(wc -l < "$TEST_STATE_DIR/tool_log.jsonl")
if [ "$LINES" -eq 3 ]; then
  pass "3 calls → 3 log lines"
else
  fail "Expected 3 lines, got $LINES"
fi

# ─── Test 3: Valid JSONL format ───

echo "Test 3: Valid JSONL"

VALID=true
while IFS= read -r line; do
  if ! echo "$line" | jq . &>/dev/null; then
    VALID=false
    break
  fi
done < "$TEST_STATE_DIR/tool_log.jsonl"

if [ "$VALID" = true ]; then
  pass "All lines are valid JSON"
else
  fail "Invalid JSON found in tool_log.jsonl"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
