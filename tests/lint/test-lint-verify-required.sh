#!/usr/bin/env bash
# Test .superclaw/lint/lint-verify-required.sh
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LINT_SCRIPT="$REPO_ROOT/.superclaw/lint/lint-verify-required.sh"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

VALID_FRONT='---
id: "001"
slug: test
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
assignee: user
priority: medium
type: feature
tier: T2
phase: executing
---'

echo "🧪 Testing lint-verify-required.sh"
echo ""

# ─── Test 1: Task in inbox is exempt ────────────────────────────────────────

echo "Test: Inbox tasks are exempt"

mkdir -p "$TMPDIR_TEST/exempt/.superclaw/board/inbox"
cat > "$TMPDIR_TEST/exempt/.superclaw/board/inbox/001-test.md" << 'EOF'
---
id: "001"
slug: test
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
assignee: user
priority: medium
type: feature
tier: T2
phase: inbox
---

# Test
No verify section needed.
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/exempt/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  pass "Inbox tasks are exempt"
else
  fail "Inbox tasks should be exempt from verify requirement"
fi

# ─── Test 2: Executing task with verify passes ─────────────────────────────

echo "Test: Executing task with ## Verify passes"

mkdir -p "$TMPDIR_TEST/good/.superclaw/board/executing"
cat > "$TMPDIR_TEST/good/.superclaw/board/executing/001-test.md" << EOF
$VALID_FRONT

# Test

## Verify

Run the test suite and check output.

## Notes
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/good/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  pass "Task with verify section passes"
else
  fail "Task with verify section should pass"
fi

# ─── Test 3: Executing task without verify fails ───────────────────────────

echo "Test: Executing task without ## Verify fails"

mkdir -p "$TMPDIR_TEST/no-verify/.superclaw/board/executing"
cat > "$TMPDIR_TEST/no-verify/.superclaw/board/executing/001-test.md" << EOF
$VALID_FRONT

# Test

Just some content, no verify section.
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/no-verify/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Task without verify section should fail"
else
  pass "Task without verify section fails"
fi

# ─── Test 4: Empty verify section fails ─────────────────────────────────────

echo "Test: Empty verify section fails"

mkdir -p "$TMPDIR_TEST/empty-verify/.superclaw/board/executing"
cat > "$TMPDIR_TEST/empty-verify/.superclaw/board/executing/001-test.md" << EOF
$VALID_FRONT

# Test

## Verify

## Notes

Something here.
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/empty-verify/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Empty verify section should fail"
else
  pass "Empty verify section fails"
fi

# ─── Test 5: Tasks in 'done' phase also checked ────────────────────────────

echo "Test: Done phase tasks also require verify"

mkdir -p "$TMPDIR_TEST/done/.superclaw/board/done"
cat > "$TMPDIR_TEST/done/.superclaw/board/done/001-test.md" << 'EOF'
---
id: "001"
slug: test
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
assignee: user
priority: medium
type: feature
tier: T2
phase: done
---

# Test
No verify.
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/done/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Done phase tasks should require verify"
else
  pass "Done phase tasks require verify"
fi

# ─── Results ────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
