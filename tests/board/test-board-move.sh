#!/usr/bin/env bash
# Test .superclaw/bin/board-move.sh
#
# Usage: bash tests/board/test-board-move.sh

set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BOARD_MOVE="$REPO_ROOT/.superclaw/bin/board-move.sh"

source "$REPO_ROOT/.superclaw/bin/_helpers.sh"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

# ─── Setup ───────────────────────────────────────────────────────────────────

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

# Helper to create a test task in a given phase
create_test_task() {
  local phase="$1"
  local filename="$2"
  local blocked_reason="${3:-}"
  mkdir -p "$TMPDIR_TEST/project/.superclaw/board/$phase"
  cat > "$TMPDIR_TEST/project/.superclaw/board/$phase/$filename" << EOF
---
id: "001"
slug: test-task
created: 2026-01-01T00:00:00Z
updated: 2026-01-01T00:00:00Z
assignee: human
priority: medium
type: feature
tier: T2
phase: $phase
blocked_reason: "$blocked_reason"
parent: ""
spec_path: ""
plan_path: ""
---

# Test Task

## Description

A test task.

## History

| Time | Phase | Actor | Note |
|------|-------|-------|------|
| 2026-01-01T00:00:00Z | $phase | human | Created |
EOF
}

export SUPERCLAW_ROOT="$TMPDIR_TEST/project/.superclaw"

echo "🧪 Testing board-move.sh"
echo ""

# ─── Test 1: Move inbox → aligning ──────────────────────────────────────────

echo "Test: Move inbox → aligning"

create_test_task "inbox" "001-test-task.md"

bash "$BOARD_MOVE" "001-test-task.md" "inbox" "aligning" "开始对齐" >/dev/null 2>&1

if [[ -f "$TMPDIR_TEST/project/.superclaw/board/aligning/001-test-task.md" ]]; then
  pass "File exists in aligning directory"
else
  fail "File not found in aligning directory"
fi

if [[ ! -f "$TMPDIR_TEST/project/.superclaw/board/inbox/001-test-task.md" ]]; then
  pass "File removed from inbox directory"
else
  fail "File still exists in inbox directory"
fi

# ─── Test 2: Phase field updated in frontmatter ─────────────────────────────

echo "Test: Phase field updated"

MOVED_FILE="$TMPDIR_TEST/project/.superclaw/board/aligning/001-test-task.md"
RESULT=$(get_frontmatter "$MOVED_FILE" "phase")
if [[ "$RESULT" == "aligning" ]]; then
  pass "Phase updated to aligning"
else
  fail "Phase: expected 'aligning', got '$RESULT'"
fi

# ─── Test 3: Updated timestamp changed ──────────────────────────────────────

echo "Test: Updated timestamp changed"

RESULT=$(get_frontmatter "$MOVED_FILE" "updated")
if [[ "$RESULT" != "2026-01-01T00:00:00Z" ]]; then
  pass "Updated timestamp changed from original"
else
  fail "Updated timestamp not changed"
fi

# ─── Test 4: History note appended ──────────────────────────────────────────

echo "Test: History note appended"

if grep -q "| aligning | system | 开始对齐 |" "$MOVED_FILE"; then
  pass "History row appended with correct content"
else
  fail "History row not found"
fi

# ─── Test 5: Move aligning → planned ────────────────────────────────────────

echo "Test: Move aligning → planned"

bash "$BOARD_MOVE" "001-test-task.md" "aligning" "planned" "Ready to plan" >/dev/null 2>&1

if [[ -f "$TMPDIR_TEST/project/.superclaw/board/planned/001-test-task.md" ]]; then
  pass "File moved to planned"
else
  fail "File not found in planned directory"
fi

RESULT=$(get_frontmatter "$TMPDIR_TEST/project/.superclaw/board/planned/001-test-task.md" "phase")
if [[ "$RESULT" == "planned" ]]; then
  pass "Phase updated to planned"
else
  fail "Phase: expected 'planned', got '$RESULT'"
fi

# ─── Test 6: Move to blocked sets blocked_reason ────────────────────────────

echo "Test: Move to blocked sets blocked_reason"

create_test_task "executing" "002-blocked-task.md"

bash "$BOARD_MOVE" "002-blocked-task.md" "executing" "blocked" "Waiting for API key" >/dev/null 2>&1

BLOCKED_FILE="$TMPDIR_TEST/project/.superclaw/board/blocked/002-blocked-task.md"
RESULT=$(get_frontmatter "$BLOCKED_FILE" "blocked_reason")
if [[ "$RESULT" == "Waiting for API key" ]]; then
  pass "blocked_reason set to note"
else
  fail "blocked_reason: expected 'Waiting for API key', got '$RESULT'"
fi

# ─── Test 7: Move from blocked clears blocked_reason ────────────────────────

echo "Test: Move from blocked clears blocked_reason"

bash "$BOARD_MOVE" "002-blocked-task.md" "blocked" "executing" "Unblocked now" >/dev/null 2>&1

UNBLOCKED_FILE="$TMPDIR_TEST/project/.superclaw/board/executing/002-blocked-task.md"
RESULT=$(get_frontmatter "$UNBLOCKED_FILE" "blocked_reason")
if [[ -z "$RESULT" ]]; then
  pass "blocked_reason cleared"
else
  fail "blocked_reason: expected empty, got '$RESULT'"
fi

# ─── Test 8: Invalid source file fails ──────────────────────────────────────

echo "Test: Invalid source file fails"

if bash "$BOARD_MOVE" "nonexistent.md" "inbox" "aligning" "nope" 2>/dev/null; then
  fail "Should fail when source file does not exist"
else
  pass "Correctly fails when source file missing"
fi

# ─── Test 9: Invalid phase name fails ───────────────────────────────────────

echo "Test: Invalid phase name fails"

create_test_task "inbox" "003-phase-test.md"

if bash "$BOARD_MOVE" "003-phase-test.md" "inbox" "bogus" "nope" 2>/dev/null; then
  fail "Should fail with invalid to-phase"
else
  pass "Correctly fails with invalid to-phase"
fi

if bash "$BOARD_MOVE" "003-phase-test.md" "bogus" "inbox" "nope" 2>/dev/null; then
  fail "Should fail with invalid from-phase"
else
  pass "Correctly fails with invalid from-phase"
fi

# ─── Results ─────────────────────────────────────────────────────────────────

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
