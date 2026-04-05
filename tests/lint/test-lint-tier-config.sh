#!/usr/bin/env bash
# Test .superclaw/lint/lint-tier-config.sh
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LINT_SCRIPT="$REPO_ROOT/.superclaw/lint/lint-tier-config.sh"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

echo "🧪 Testing lint-tier-config.sh"
echo ""

# ─── Test 1: Valid tier config passes ───────────────────────────────────────

echo "Test: Valid tier config passes"

mkdir -p "$TMPDIR_TEST/good/.superclaw/config/tiers"
cat > "$TMPDIR_TEST/good/.superclaw/config/tiers/T2.yaml" << 'EOF'
name: Standard
checklist:
  - id: design
    name: Design review
  - id: tests
    name: Unit tests
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/good/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  pass "Valid tier config passes"
else
  fail "Valid tier config should pass"
fi

# ─── Test 2: Missing name field fails ───────────────────────────────────────

echo "Test: Missing name field fails"

mkdir -p "$TMPDIR_TEST/no-name/.superclaw/config/tiers"
cat > "$TMPDIR_TEST/no-name/.superclaw/config/tiers/T2.yaml" << 'EOF'
checklist:
  - id: design
    name: Design review
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/no-name/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Missing name should fail"
else
  pass "Missing name field fails"
fi

# ─── Test 3: Missing checklist fails ───────────────────────────────────────

echo "Test: Missing checklist section fails"

mkdir -p "$TMPDIR_TEST/no-checklist/.superclaw/config/tiers"
cat > "$TMPDIR_TEST/no-checklist/.superclaw/config/tiers/T2.yaml" << 'EOF'
name: Standard
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/no-checklist/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Missing checklist should fail"
else
  pass "Missing checklist fails"
fi

# ─── Test 4: Checklist item missing id fails ────────────────────────────────

echo "Test: Checklist item missing id fails"

mkdir -p "$TMPDIR_TEST/no-id/.superclaw/config/tiers"
cat > "$TMPDIR_TEST/no-id/.superclaw/config/tiers/T2.yaml" << 'EOF'
name: Standard
checklist:
  - name: Design review
  - id: tests
    name: Unit tests
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/no-id/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Checklist item missing id should fail"
else
  pass "Checklist item missing id fails"
fi

# ─── Test 5: Checklist item missing name fails ─────────────────────────────

echo "Test: Checklist item missing name fails"

mkdir -p "$TMPDIR_TEST/no-item-name/.superclaw/config/tiers"
cat > "$TMPDIR_TEST/no-item-name/.superclaw/config/tiers/T2.yaml" << 'EOF'
name: Standard
checklist:
  - id: design
  - id: tests
    name: Unit tests
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/no-item-name/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  fail "Checklist item missing name should fail"
else
  pass "Checklist item missing name fails"
fi

# ─── Test 6: No tier files passes (nothing to lint) ────────────────────────

echo "Test: No tier files passes"

mkdir -p "$TMPDIR_TEST/empty/.superclaw/config/tiers"

if SUPERCLAW_ROOT="$TMPDIR_TEST/empty/.superclaw" bash "$LINT_SCRIPT" > /dev/null 2>&1; then
  pass "No tier files passes"
else
  fail "No tier files should pass"
fi

# ─── Results ────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
