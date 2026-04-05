#!/usr/bin/env bash
# Test .superclaw/lint/lint-no-placeholder.sh
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LINT_SCRIPT="$REPO_ROOT/.superclaw/lint/lint-no-placeholder.sh"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

echo "🧪 Testing lint-no-placeholder.sh"
echo ""

# ─── Test 1: Clean file passes ──────────────────────────────────────────────

echo "Test: Clean file passes"

cat > "$TMPDIR_TEST/clean.md" << 'EOF'
# Spec

This is a complete specification with no placeholders.

## Details

Everything is filled in.
EOF

if bash "$LINT_SCRIPT" "$TMPDIR_TEST/clean.md" > /dev/null 2>&1; then
  pass "Clean file passes"
else
  fail "Clean file should pass"
fi

# ─── Test 2: File with TODO fails ───────────────────────────────────────────

echo "Test: File with TODO fails"

cat > "$TMPDIR_TEST/has-todo.md" << 'EOF'
# Spec

TODO: fill in the details later
EOF

if bash "$LINT_SCRIPT" "$TMPDIR_TEST/has-todo.md" > /dev/null 2>&1; then
  fail "File with TODO should fail"
else
  pass "File with TODO fails"
fi

# ─── Test 3: File with TBD fails ───────────────────────────────────────────

echo "Test: File with TBD fails"

cat > "$TMPDIR_TEST/has-tbd.md" << 'EOF'
# Spec

The API design is TBD.
EOF

if bash "$LINT_SCRIPT" "$TMPDIR_TEST/has-tbd.md" > /dev/null 2>&1; then
  fail "File with TBD should fail"
else
  pass "File with TBD fails"
fi

# ─── Test 4: Placeholders inside code blocks are skipped ────────────────────

echo "Test: Placeholders inside code blocks are skipped"

cat > "$TMPDIR_TEST/codeblock.md" << 'EOF'
# Spec

Here is some code:

```bash
# TODO: this is inside a code block and should be ignored
echo "FIXME in code"
```

Everything else is fine.
EOF

if bash "$LINT_SCRIPT" "$TMPDIR_TEST/codeblock.md" > /dev/null 2>&1; then
  pass "Placeholders in code blocks are skipped"
else
  fail "Should skip placeholders inside code blocks"
fi

# ─── Test 5: FIXME and XXX detected ────────────────────────────────────────

echo "Test: FIXME detected"

cat > "$TMPDIR_TEST/has-fixme.md" << 'EOF'
# Spec

FIXME: broken stuff
EOF

if bash "$LINT_SCRIPT" "$TMPDIR_TEST/has-fixme.md" > /dev/null 2>&1; then
  fail "File with FIXME should fail"
else
  pass "FIXME detected"
fi

# ─── Test 6: Chinese placeholders detected ──────────────────────────────────

echo "Test: Chinese placeholder 待定 detected"

cat > "$TMPDIR_TEST/has-chinese.md" << 'EOF'
# Spec

这部分待定。
EOF

if bash "$LINT_SCRIPT" "$TMPDIR_TEST/has-chinese.md" > /dev/null 2>&1; then
  fail "File with 待定 should fail"
else
  pass "Chinese placeholder 待定 detected"
fi

# ─── Test 7: Multiple files, one bad ────────────────────────────────────────

echo "Test: Multiple files with one bad"

if bash "$LINT_SCRIPT" "$TMPDIR_TEST/clean.md" "$TMPDIR_TEST/has-todo.md" > /dev/null 2>&1; then
  fail "Should fail when any file has placeholders"
else
  pass "Fails when any file has placeholders"
fi

# ─── Results ────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
