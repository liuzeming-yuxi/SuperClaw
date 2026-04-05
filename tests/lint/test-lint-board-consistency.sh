#!/usr/bin/env bash
# Test .superclaw/lint/lint-board-consistency.sh
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LINT_SCRIPT="$REPO_ROOT/.superclaw/lint/lint-board-consistency.sh"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

echo "🧪 Testing lint-board-consistency.sh"
echo ""

# ─── Test 1: Consistent phase passes ───────────────────────────────────────

echo "Test: Consistent phase field passes"

mkdir -p "$TMPDIR_TEST/good/.superclaw/board/inbox"
cat > "$TMPDIR_TEST/good/.superclaw/board/inbox/001-test.md" << 'EOF'
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
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/good/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  pass "Consistent phase passes"
else
  fail "Consistent phase should pass"
fi

# ─── Test 2: Inconsistent phase fails ──────────────────────────────────────

echo "Test: Inconsistent phase field fails"

mkdir -p "$TMPDIR_TEST/bad/.superclaw/board/inbox"
cat > "$TMPDIR_TEST/bad/.superclaw/board/inbox/001-test.md" << 'EOF'
---
id: "001"
slug: test
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
assignee: user
priority: medium
type: feature
tier: T2
phase: executing
---
# Test
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/bad/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Inconsistent phase should fail"
else
  pass "Inconsistent phase fails"
fi

# ─── Test 3: Multiple files, mixed ─────────────────────────────────────────

echo "Test: Mixed consistency across files"

mkdir -p "$TMPDIR_TEST/mixed/.superclaw/board/executing"
cat > "$TMPDIR_TEST/mixed/.superclaw/board/executing/001-ok.md" << 'EOF'
---
id: "001"
slug: ok
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
assignee: user
priority: medium
type: feature
tier: T2
phase: executing
---
# OK
EOF

cat > "$TMPDIR_TEST/mixed/.superclaw/board/executing/002-bad.md" << 'EOF'
---
id: "002"
slug: bad
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
assignee: user
priority: medium
type: feature
tier: T2
phase: planned
---
# Bad
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/mixed/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Should fail with any inconsistency"
else
  pass "Detects inconsistency in mixed files"
fi

# ─── Test 4: Empty board passes ─────────────────────────────────────────────

echo "Test: Empty board passes"

mkdir -p "$TMPDIR_TEST/empty/.superclaw/board/inbox"

if SUPERCLAW_ROOT="$TMPDIR_TEST/empty/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  pass "Empty board passes"
else
  fail "Empty board should pass"
fi

# ─── Results ────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
