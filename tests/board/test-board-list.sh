#!/usr/bin/env bash
# Test .superclaw/bin/board-list.sh
#
# Usage: bash tests/board/test-board-list.sh

set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BOARD_LIST="$REPO_ROOT/.superclaw/bin/board-list.sh"

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

echo "🧪 Testing board-list.sh"
echo ""

# ─── Test 1: List specific phase shows correct tasks ─────────────────────

echo "Test: List specific phase with multiple tasks"

OUTPUT=$(bash "$BOARD_LIST" inbox 2>&1)

if echo "$OUTPUT" | grep -q "setup-ci" && echo "$OUTPUT" | grep -q "fix-login"; then
  pass "Inbox lists both tasks"
else
  fail "Inbox should list both tasks. Got: $OUTPUT"
fi

# ─── Test 2: List phase with one task works ──────────────────────────────

echo "Test: List phase with one task"

OUTPUT=$(bash "$BOARD_LIST" planned 2>&1)

if echo "$OUTPUT" | grep -q "add-tests"; then
  pass "Planned phase lists the single task"
else
  fail "Planned phase should list add-tests. Got: $OUTPUT"
fi

# ─── Test 3: List empty phase mentions no tasks ─────────────────────────

echo "Test: List empty phase"

OUTPUT=$(bash "$BOARD_LIST" done 2>&1)

if echo "$OUTPUT" | grep -qi "no tasks"; then
  pass "Empty phase shows 'no tasks' message"
else
  fail "Empty phase should mention 'no tasks'. Got: $OUTPUT"
fi

# ─── Test 4: --all includes all phase names ─────────────────────────────

echo "Test: --all flag lists all phases"

OUTPUT=$(bash "$BOARD_LIST" --all 2>&1)

ALL_FOUND=true
for phase in inbox aligning planned executing reviewing done blocked; do
  if ! echo "$OUTPUT" | grep -qi "$phase"; then
    ALL_FOUND=false
    fail "--all missing phase: $phase"
    break
  fi
done

if $ALL_FOUND; then
  pass "--all includes all phase names"
fi

# ─── Results ─────────────────────────────────────────────────────────────────

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
