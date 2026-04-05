#!/usr/bin/env bash
# Test .superclaw/bin/_helpers.sh
#
# Usage: bash tests/board/test-helpers.sh
#
# Tests: get_frontmatter, set_frontmatter, get_yaml_value, set_yaml_value,
#        format_id, timestamp, resolve_superclaw_root, constants

set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HELPERS="$REPO_ROOT/.superclaw/bin/_helpers.sh"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

# ─── Setup ───────────────────────────────────────────────────────────────────

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

# Create sample task file with full frontmatter
cat > "$TMPDIR_TEST/task-001.md" << 'EOF'
---
id: "001"
title: "Implement login feature"
tier: T2
priority: high
type: feature
status: inbox
assigned: ""
created: "2025-01-01T00:00:00Z"
updated: "2025-01-01T00:00:00Z"
---

# Task 001: Implement login feature

Some body content here.
EOF

# Create sample board.yaml
cat > "$TMPDIR_TEST/board.yaml" << 'EOF'
next_id: 42
default_tier: T2
default_priority: medium
EOF

# Create a fake .superclaw directory structure for resolve_superclaw_root
mkdir -p "$TMPDIR_TEST/project/.superclaw"

# Source helpers
source "$HELPERS"

echo "🧪 Testing _helpers.sh"
echo ""

# ─── Test get_frontmatter ────────────────────────────────────────────────────

echo "Test: get_frontmatter"

RESULT=$(get_frontmatter "$TMPDIR_TEST/task-001.md" "id")
if [[ "$RESULT" == "001" ]]; then
  pass "get_frontmatter extracts id"
else
  fail "get_frontmatter id: expected '001', got '$RESULT'"
fi

RESULT=$(get_frontmatter "$TMPDIR_TEST/task-001.md" "title")
if [[ "$RESULT" == "Implement login feature" ]]; then
  pass "get_frontmatter extracts title"
else
  fail "get_frontmatter title: expected 'Implement login feature', got '$RESULT'"
fi

RESULT=$(get_frontmatter "$TMPDIR_TEST/task-001.md" "priority")
if [[ "$RESULT" == "high" ]]; then
  pass "get_frontmatter extracts unquoted value"
else
  fail "get_frontmatter priority: expected 'high', got '$RESULT'"
fi

RESULT=$(get_frontmatter "$TMPDIR_TEST/task-001.md" "assigned")
if [[ "$RESULT" == "" ]]; then
  pass "get_frontmatter returns empty for empty value"
else
  fail "get_frontmatter assigned: expected '', got '$RESULT'"
fi

RESULT=$(get_frontmatter "$TMPDIR_TEST/task-001.md" "nonexistent" 2>/dev/null || true)
if [[ "$RESULT" == "" ]]; then
  pass "get_frontmatter returns empty for missing key"
else
  fail "get_frontmatter nonexistent: expected '', got '$RESULT'"
fi

# ─── Test set_frontmatter ────────────────────────────────────────────────────

echo "Test: set_frontmatter"

cp "$TMPDIR_TEST/task-001.md" "$TMPDIR_TEST/task-set.md"

set_frontmatter "$TMPDIR_TEST/task-set.md" "priority" "low"
RESULT=$(get_frontmatter "$TMPDIR_TEST/task-set.md" "priority")
if [[ "$RESULT" == "low" ]]; then
  pass "set_frontmatter updates existing key"
else
  fail "set_frontmatter priority: expected 'low', got '$RESULT'"
fi

set_frontmatter "$TMPDIR_TEST/task-set.md" "title" "New title here"
RESULT=$(get_frontmatter "$TMPDIR_TEST/task-set.md" "title")
if [[ "$RESULT" == "New title here" ]]; then
  pass "set_frontmatter updates quoted value"
else
  fail "set_frontmatter title: expected 'New title here', got '$RESULT'"
fi

# Verify body content is preserved
if grep -q "Some body content here." "$TMPDIR_TEST/task-set.md"; then
  pass "set_frontmatter preserves body content"
else
  fail "set_frontmatter lost body content"
fi

# ─── Test get_yaml_value ─────────────────────────────────────────────────────

echo "Test: get_yaml_value"

RESULT=$(get_yaml_value "$TMPDIR_TEST/board.yaml" "next_id")
if [[ "$RESULT" == "42" ]]; then
  pass "get_yaml_value extracts next_id"
else
  fail "get_yaml_value next_id: expected '42', got '$RESULT'"
fi

RESULT=$(get_yaml_value "$TMPDIR_TEST/board.yaml" "default_tier")
if [[ "$RESULT" == "T2" ]]; then
  pass "get_yaml_value extracts default_tier"
else
  fail "get_yaml_value default_tier: expected 'T2', got '$RESULT'"
fi

RESULT=$(get_yaml_value "$TMPDIR_TEST/board.yaml" "missing_key" 2>/dev/null || true)
if [[ "$RESULT" == "" ]]; then
  pass "get_yaml_value returns empty for missing key"
else
  fail "get_yaml_value missing_key: expected '', got '$RESULT'"
fi

# ─── Test set_yaml_value ─────────────────────────────────────────────────────

echo "Test: set_yaml_value"

cp "$TMPDIR_TEST/board.yaml" "$TMPDIR_TEST/board-set.yaml"

set_yaml_value "$TMPDIR_TEST/board-set.yaml" "next_id" "43"
RESULT=$(get_yaml_value "$TMPDIR_TEST/board-set.yaml" "next_id")
if [[ "$RESULT" == "43" ]]; then
  pass "set_yaml_value updates next_id"
else
  fail "set_yaml_value next_id: expected '43', got '$RESULT'"
fi

set_yaml_value "$TMPDIR_TEST/board-set.yaml" "default_priority" "high"
RESULT=$(get_yaml_value "$TMPDIR_TEST/board-set.yaml" "default_priority")
if [[ "$RESULT" == "high" ]]; then
  pass "set_yaml_value updates default_priority"
else
  fail "set_yaml_value default_priority: expected 'high', got '$RESULT'"
fi

# ─── Test format_id ──────────────────────────────────────────────────────────

echo "Test: format_id"

RESULT=$(format_id 1)
if [[ "$RESULT" == "001" ]]; then
  pass "format_id 1 → 001"
else
  fail "format_id 1: expected '001', got '$RESULT'"
fi

RESULT=$(format_id 42)
if [[ "$RESULT" == "042" ]]; then
  pass "format_id 42 → 042"
else
  fail "format_id 42: expected '042', got '$RESULT'"
fi

RESULT=$(format_id 100)
if [[ "$RESULT" == "100" ]]; then
  pass "format_id 100 → 100"
else
  fail "format_id 100: expected '100', got '$RESULT'"
fi

RESULT=$(format_id 1000)
if [[ "$RESULT" == "1000" ]]; then
  pass "format_id 1000 → 1000"
else
  fail "format_id 1000: expected '1000', got '$RESULT'"
fi

# ─── Test timestamp ──────────────────────────────────────────────────────────

echo "Test: timestamp"

RESULT=$(timestamp)
# Should match ISO 8601 UTC pattern: YYYY-MM-DDTHH:MM:SSZ
if [[ "$RESULT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
  pass "timestamp returns ISO 8601 UTC format: $RESULT"
else
  fail "timestamp format invalid: '$RESULT'"
fi

# ─── Test resolve_superclaw_root ─────────────────────────────────────────────

echo "Test: resolve_superclaw_root"

# Test with explicit start dir
RESULT=$(resolve_superclaw_root "$TMPDIR_TEST/project")
EXPECTED="$TMPDIR_TEST/project/.superclaw"
if [[ "$RESULT" == "$EXPECTED" ]]; then
  pass "resolve_superclaw_root finds .superclaw from project dir"
else
  fail "resolve_superclaw_root: expected '$EXPECTED', got '$RESULT'"
fi

# Test with SUPERCLAW_ROOT env override
RESULT=$(SUPERCLAW_ROOT="/tmp/custom-root" resolve_superclaw_root "$TMPDIR_TEST/project")
if [[ "$RESULT" == "/tmp/custom-root" ]]; then
  pass "resolve_superclaw_root respects SUPERCLAW_ROOT env"
else
  fail "resolve_superclaw_root env override: expected '/tmp/custom-root', got '$RESULT'"
fi

# Ensure SUPERCLAW_ROOT is not set for subsequent tests
unset SUPERCLAW_ROOT 2>/dev/null || true

# Test from nested subdir
mkdir -p "$TMPDIR_TEST/project/deep/nested/dir"
RESULT=$(resolve_superclaw_root "$TMPDIR_TEST/project/deep/nested/dir")
if [[ "$RESULT" == "$EXPECTED" ]]; then
  pass "resolve_superclaw_root walks up from nested dir"
else
  fail "resolve_superclaw_root nested: expected '$EXPECTED', got '$RESULT'"
fi

# ─── Test constants ──────────────────────────────────────────────────────────

echo "Test: constants"

if [[ -n "$BOARD_PHASES" ]] && echo "$BOARD_PHASES" | grep -q "inbox"; then
  pass "BOARD_PHASES contains inbox"
else
  fail "BOARD_PHASES missing or doesn't contain inbox"
fi

if echo "$BOARD_PHASES" | grep -q "done"; then
  pass "BOARD_PHASES contains done"
else
  fail "BOARD_PHASES missing done"
fi

if [[ -n "$VALID_PRIORITIES" ]] && echo "$VALID_PRIORITIES" | grep -q "high"; then
  pass "VALID_PRIORITIES contains high"
else
  fail "VALID_PRIORITIES missing or doesn't contain high"
fi

if [[ -n "$VALID_TYPES" ]] && echo "$VALID_TYPES" | grep -q "feature"; then
  pass "VALID_TYPES contains feature"
else
  fail "VALID_TYPES missing or doesn't contain feature"
fi

if [[ -n "$VALID_TIERS" ]] && echo "$VALID_TIERS" | grep -q "T2"; then
  pass "VALID_TIERS contains T2"
else
  fail "VALID_TIERS missing or doesn't contain T2"
fi

# ─── Results ─────────────────────────────────────────────────────────────────

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
