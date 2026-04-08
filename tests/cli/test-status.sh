#!/bin/bash
# Test superclaw basic commands
#
# Usage: bash tests/cli/test-status.sh
#
# Prerequisites: superclaw installed at /root/.openclaw/workspace/bin/

set -euo pipefail

PASS=0
FAIL=0

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

SUPERCLAW_CLI="/root/.openclaw/workspace/bin/superclaw.mjs"

echo "🧪 Testing superclaw status"
echo ""

# ─── Test 1: Script exists and is executable ───

echo "Test 1: Script exists"

if [ -f "$SUPERCLAW_CLI" ]; then
  pass "superclaw.mjs exists"
else
  fail "superclaw.mjs not found"
  echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
  exit 1
fi

# ─── Test 2: Status command runs ───

echo "Test 2: Status command"

OUTPUT=$(node "$SUPERCLAW_CLI" status 2>&1) || true

if echo "$OUTPUT" | grep -qi "claude\|version\|status\|ready"; then
  pass "Status command returned meaningful output"
else
  fail "Status command output unexpected: $OUTPUT"
fi

# ─── Test 3: .env exists and has required vars ───

echo "Test 3: .env configuration"

ENV_FILE="/root/.openclaw/workspace/bin/.env"

if [ -f "$ENV_FILE" ]; then
  MISSING=""
  for var in ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC; do
    if ! grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
      MISSING="$MISSING $var"
    fi
  done
  if [ -z "$MISSING" ]; then
    pass ".env has all required variables"
  else
    fail ".env missing:$MISSING"
  fi
else
  fail ".env not found"
fi

# ─── Test 4: Session list command ───

echo "Test 4: Session list"

EXIT_CODE=0
OUTPUT=$(node "$SUPERCLAW_CLI" session list 2>&1) || EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ] || echo "$OUTPUT" | grep -qi "session\|no.*session\|empty\|\[\]"; then
  pass "Session list command works"
else
  fail "Session list failed (exit=$EXIT_CODE): $OUTPUT"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
