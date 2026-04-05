#!/usr/bin/env bash
# Test .superclaw/bin/board-create.sh
#
# Usage: bash tests/board/test-board-create.sh

set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BOARD_CREATE="$REPO_ROOT/.superclaw/bin/board-create.sh"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

# ─── Setup ───────────────────────────────────────────────────────────────────

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

# Build a fake .superclaw tree so resolve_superclaw_root finds it
mkdir -p "$TMPDIR_TEST/project/.superclaw/config"
mkdir -p "$TMPDIR_TEST/project/.superclaw/board/inbox"

cat > "$TMPDIR_TEST/project/.superclaw/config/board.yaml" << 'EOF'
next_id: 1
default_tier: T2
default_priority: medium
EOF

export SUPERCLAW_ROOT="$TMPDIR_TEST/project/.superclaw"

echo "🧪 Testing board-create.sh"
echo ""

# ─── Test 1: Basic task creation ────────────────────────────────────────────

echo "Test: Basic task creation"

OUTPUT=$(bash "$BOARD_CREATE" --title "My first task" 2>&1)
TASK_FILE="$TMPDIR_TEST/project/.superclaw/board/inbox/001-my-first-task.md"

if [[ -f "$TASK_FILE" ]]; then
  pass "Task file exists in inbox with correct name"
else
  fail "Task file not found at $TASK_FILE"
fi

# ─── Test 2: Frontmatter correctness ───────────────────────────────────────

echo "Test: Frontmatter values"

source "$REPO_ROOT/.superclaw/bin/_helpers.sh"

RESULT=$(get_frontmatter "$TASK_FILE" "id")
if [[ "$RESULT" == "001" ]]; then
  pass "Frontmatter id is 001"
else
  fail "Frontmatter id: expected '001', got '$RESULT'"
fi

RESULT=$(get_frontmatter "$TASK_FILE" "slug")
if [[ "$RESULT" == "my-first-task" ]]; then
  pass "Frontmatter slug is correct"
else
  fail "Frontmatter slug: expected 'my-first-task', got '$RESULT'"
fi

RESULT=$(get_frontmatter "$TASK_FILE" "phase")
if [[ "$RESULT" == "inbox" ]]; then
  pass "Frontmatter phase is inbox"
else
  fail "Frontmatter phase: expected 'inbox', got '$RESULT'"
fi

RESULT=$(get_frontmatter "$TASK_FILE" "type")
if [[ "$RESULT" == "feature" ]]; then
  pass "Frontmatter type defaults to feature"
else
  fail "Frontmatter type: expected 'feature', got '$RESULT'"
fi

RESULT=$(get_frontmatter "$TASK_FILE" "tier")
if [[ "$RESULT" == "T2" ]]; then
  pass "Frontmatter tier defaults to T2 from board.yaml"
else
  fail "Frontmatter tier: expected 'T2', got '$RESULT'"
fi

RESULT=$(get_frontmatter "$TASK_FILE" "priority")
if [[ "$RESULT" == "medium" ]]; then
  pass "Frontmatter priority defaults to medium from board.yaml"
else
  fail "Frontmatter priority: expected 'medium', got '$RESULT'"
fi

# ─── Test 3: next_id incremented ───────────────────────────────────────────

echo "Test: next_id increment"

RESULT=$(get_yaml_value "$TMPDIR_TEST/project/.superclaw/config/board.yaml" "next_id")
if [[ "$RESULT" == "2" ]]; then
  pass "next_id incremented to 2"
else
  fail "next_id: expected '2', got '$RESULT'"
fi

# ─── Test 4: Title heading present ─────────────────────────────────────────

echo "Test: Title heading"

if grep -q "^# My first task$" "$TASK_FILE"; then
  pass "Title heading present"
else
  fail "Title heading not found"
fi

# ─── Test 5: History section present ───────────────────────────────────────

echo "Test: History section"

if grep -q "## History" "$TASK_FILE"; then
  pass "History section present"
else
  fail "History section not found"
fi

if grep -q "| inbox | human | Created |" "$TASK_FILE"; then
  pass "History row has correct phase/actor/note"
else
  fail "History row not found or incorrect"
fi

# ─── Test 6: Custom priority/tier override defaults ────────────────────────

echo "Test: Custom priority and tier"

bash "$BOARD_CREATE" --title "High priority spike" --priority critical --tier T0 >/dev/null 2>&1
TASK_FILE2="$TMPDIR_TEST/project/.superclaw/board/inbox/002-high-priority-spike.md"

RESULT=$(get_frontmatter "$TASK_FILE2" "priority")
if [[ "$RESULT" == "critical" ]]; then
  pass "Custom priority override works"
else
  fail "Custom priority: expected 'critical', got '$RESULT'"
fi

RESULT=$(get_frontmatter "$TASK_FILE2" "tier")
if [[ "$RESULT" == "T0" ]]; then
  pass "Custom tier override works"
else
  fail "Custom tier: expected 'T0', got '$RESULT'"
fi

# ─── Test 7: Description included when provided ───────────────────────────

echo "Test: Description"

bash "$BOARD_CREATE" --title "Described task" --description "This is a detailed description" >/dev/null 2>&1
TASK_FILE3="$TMPDIR_TEST/project/.superclaw/board/inbox/003-described-task.md"

if grep -q "This is a detailed description" "$TASK_FILE3"; then
  pass "Custom description included"
else
  fail "Custom description not found"
fi

# Default description
if grep -q "No description provided." "$TASK_FILE"; then
  pass "Default description used when none given"
else
  fail "Default description not found"
fi

# ─── Test 8: Missing --title fails ─────────────────────────────────────────

echo "Test: Missing --title fails"

if bash "$BOARD_CREATE" 2>/dev/null; then
  fail "Should fail without --title"
else
  pass "Correctly fails without --title"
fi

# ─── Results ─────────────────────────────────────────────────────────────────

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
