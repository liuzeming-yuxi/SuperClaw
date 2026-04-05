#!/usr/bin/env bash
# Test .superclaw/lint/lint-task-file.sh
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LINT_SCRIPT="$REPO_ROOT/.superclaw/lint/lint-task-file.sh"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

echo "🧪 Testing lint-task-file.sh"
echo ""

# ─── Test 1: Valid task file passes ─────────────────────────────────────────

echo "Test: Valid task file passes"

mkdir -p "$TMPDIR_TEST/valid/.superclaw/board/inbox"
cat > "$TMPDIR_TEST/valid/.superclaw/board/inbox/001-test.md" << 'EOF'
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

# Test task
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/valid/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  pass "Valid task file passes lint"
else
  fail "Valid task file should pass lint"
fi

# ─── Test 2: Missing frontmatter fails ──────────────────────────────────────

echo "Test: Missing frontmatter fails"

mkdir -p "$TMPDIR_TEST/no-fm/.superclaw/board/inbox"
cat > "$TMPDIR_TEST/no-fm/.superclaw/board/inbox/001-test.md" << 'EOF'
# No frontmatter here
Just some content.
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/no-fm/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Missing frontmatter should fail lint"
else
  pass "Missing frontmatter fails lint"
fi

# ─── Test 3: Missing required field fails ───────────────────────────────────

echo "Test: Missing required field fails"

mkdir -p "$TMPDIR_TEST/missing-field/.superclaw/board/inbox"
cat > "$TMPDIR_TEST/missing-field/.superclaw/board/inbox/001-test.md" << 'EOF'
---
id: "001"
slug: test
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
priority: medium
type: feature
tier: T2
phase: inbox
---

# Missing assignee
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/missing-field/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Missing assignee field should fail lint"
else
  pass "Missing required field fails lint"
fi

# ─── Test 4: Multiple phase dirs checked ────────────────────────────────────

echo "Test: Checks multiple phase directories"

mkdir -p "$TMPDIR_TEST/multi/.superclaw/board/inbox"
mkdir -p "$TMPDIR_TEST/multi/.superclaw/board/executing"

cat > "$TMPDIR_TEST/multi/.superclaw/board/inbox/001-ok.md" << 'EOF'
---
id: "001"
slug: ok
created: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
assignee: user
priority: medium
type: feature
tier: T2
phase: inbox
---
# OK
EOF

cat > "$TMPDIR_TEST/multi/.superclaw/board/executing/002-bad.md" << 'EOF'
---
id: "002"
slug: bad
---
# Bad - missing fields
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/multi/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Should fail when any file has missing fields"
else
  pass "Detects invalid file across multiple phase dirs"
fi

# ─── Test 5: Empty board passes ─────────────────────────────────────────────

echo "Test: Empty board passes"

mkdir -p "$TMPDIR_TEST/empty/.superclaw/board/inbox"

if SUPERCLAW_ROOT="$TMPDIR_TEST/empty/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  pass "Empty board passes lint"
else
  fail "Empty board should pass lint"
fi

# ─── Results ────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
