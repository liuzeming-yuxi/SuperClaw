#!/usr/bin/env bash
# Test .superclaw/bin/board-status.sh
#
# Usage: bash tests/board/test-board-status.sh

set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BOARD_STATUS="$REPO_ROOT/.superclaw/bin/board-status.sh"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

# ─── Setup ───────────────────────────────────────────────────────────────────

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

# Build a fake .superclaw tree
SC_DIR="$TMPDIR_TEST/project/.superclaw"
mkdir -p "$SC_DIR/config"
for phase in inbox aligning planned executing reviewing done blocked; do
  mkdir -p "$SC_DIR/board/$phase"
done

cat > "$SC_DIR/config/board.yaml" << 'EOF'
next_id: 4
default_tier: T2
default_priority: medium
EOF

# Create sample task files
cat > "$SC_DIR/board/inbox/001-setup-ci.md" << 'EOF'
---
id: "001"
slug: setup-ci
priority: high
type: feature
tier: T1
phase: inbox
---

# Setup CI
EOF

cat > "$SC_DIR/board/inbox/002-fix-login.md" << 'EOF'
---
id: "002"
slug: fix-login
priority: critical
type: bug
tier: T0
phase: inbox
---

# Fix Login Bug
EOF

cat > "$SC_DIR/board/planned/003-add-tests.md" << 'EOF'
---
id: "003"
slug: add-tests
priority: medium
type: chore
tier: T2
phase: planned
---

# Add Tests
EOF

export SUPERCLAW_ROOT="$SC_DIR"

echo "🧪 Testing board-status.sh"
echo ""

# ─── Test 1: Status shows correct counts ────────────────────────────────

echo "Test: Status shows correct counts"

OUTPUT=$(bash "$BOARD_STATUS" 2>&1)

# Strip ANSI codes for matching
CLEAN=$(echo "$OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')

if echo "$CLEAN" | grep -E "inbox\s+2" > /dev/null; then
  pass "Inbox count is 2"
else
  fail "Inbox should show count 2. Got: $CLEAN"
fi

if echo "$CLEAN" | grep -E "planned\s+1" > /dev/null; then
  pass "Planned count is 1"
else
  fail "Planned should show count 1. Got: $CLEAN"
fi

if echo "$CLEAN" | grep -E "aligning\s+0" > /dev/null; then
  pass "Aligning count is 0"
else
  fail "Aligning should show count 0. Got: $CLEAN"
fi

# ─── Test 2: Total is correct ───────────────────────────────────────────

echo "Test: Total is correct"

if echo "$CLEAN" | grep -Ei "total\s+3" > /dev/null; then
  pass "Total count is 3"
else
  fail "Total should be 3. Got: $CLEAN"
fi

# ─── Test 3: Empty board handled gracefully ─────────────────────────────

echo "Test: Empty board"

# Create empty board
TMPDIR_EMPTY=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST $TMPDIR_EMPTY" EXIT

SC_EMPTY="$TMPDIR_EMPTY/project/.superclaw"
mkdir -p "$SC_EMPTY/config"
for phase in inbox aligning planned executing reviewing done blocked; do
  mkdir -p "$SC_EMPTY/board/$phase"
done

cat > "$SC_EMPTY/config/board.yaml" << 'EOF'
next_id: 1
default_tier: T2
default_priority: medium
EOF

SUPERCLAW_ROOT="$SC_EMPTY" OUTPUT=$(bash "$BOARD_STATUS" 2>&1)
CLEAN=$(echo "$OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')

if echo "$CLEAN" | grep -Ei "total\s+0" > /dev/null; then
  pass "Empty board total is 0"
else
  fail "Empty board total should be 0. Got: $CLEAN"
fi

# ─── Results ─────────────────────────────────────────────────────────────────

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
