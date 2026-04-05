#!/usr/bin/env bash
# Test tier-check.sh and tier config files
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BIN_DIR="$REPO_ROOT/.superclaw/bin"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

echo "🧪 Testing tier-check.sh"
echo ""

# ─── Setup: Create a mock project with passing commands ───────────────────────

setup_tier_env() {
  local root="$1"
  mkdir -p "$root/.superclaw/config/tiers"
  mkdir -p "$root/project"

  # Copy real tier configs
  cp "$REPO_ROOT/.superclaw/config/tiers/"*.yaml "$root/.superclaw/config/tiers/"

  cat > "$root/.superclaw/config/board.yaml" << 'EOF'
next_id: 1
default_tier: T2
default_priority: medium
EOF
}

# ─── Test 1: All 4 tier configs pass lint ────────────────────────────────────

echo "Test 1: All tier configs pass lint"

if SUPERCLAW_ROOT="$REPO_ROOT/.superclaw" bash "$REPO_ROOT/.superclaw/lint/lint-tier-config.sh" > /dev/null 2>&1; then
  pass "All tier configs pass lint"
else
  fail "Tier config lint failed"
fi

# ─── Test 2: T3 tier-check with passing commands ─────────────────────────────

echo "Test 2: T3 tier-check with project that has passing lint"

setup_tier_env "$TMPDIR_TEST/t2"

# Create a custom T3 with a command that will pass
cat > "$TMPDIR_TEST/t2/.superclaw/config/tiers/T3.yaml" << 'EOF'
name: "T3 — Dev Scripts"
checklist:
  - id: syntax
    name: "Syntax check"
    verify: "true"
    required: true
  - id: self_review
    name: "AI self review"
    verify: null
    required: true
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/t2/.superclaw" bash "$BIN_DIR/tier-check.sh" T3 --cwd "$TMPDIR_TEST/t2/project" 2>&1 | grep -q "passed"; then
  pass "T3 tier-check runs and reports results"
else
  fail "T3 tier-check failed"
fi

# ─── Test 3: Tier-check fails when verify command fails ──────────────────────

echo "Test 3: Tier-check fails on failing verify command"

cat > "$TMPDIR_TEST/t2/.superclaw/config/tiers/T2.yaml" << 'EOF'
name: "T2 — Internal"
checklist:
  - id: tests
    name: "Unit tests"
    verify: "false"
    required: true
  - id: lint
    name: "Code lint"
    verify: "true"
    required: true
EOF

if SUPERCLAW_ROOT="$TMPDIR_TEST/t2/.superclaw" bash "$BIN_DIR/tier-check.sh" T2 --cwd "$TMPDIR_TEST/t2/project" > /dev/null 2>&1; then
  fail "Should fail when verify command fails"
else
  pass "Tier-check fails on failing verify command"
fi

# ─── Test 4: Manual checks are skipped ──────────────────────────────────────

echo "Test 4: Manual checks (verify: null) are skipped"

output=$(SUPERCLAW_ROOT="$TMPDIR_TEST/t2/.superclaw" bash "$BIN_DIR/tier-check.sh" T3 --cwd "$TMPDIR_TEST/t2/project" 2>&1)

if echo "$output" | grep -q "manual"; then
  pass "Manual checks reported as skipped"
else
  fail "Manual checks should be reported"
fi

# ─── Test 5: Missing tier config errors ──────────────────────────────────────

echo "Test 5: Missing tier config gives error"

if SUPERCLAW_ROOT="$TMPDIR_TEST/t2/.superclaw" bash "$BIN_DIR/tier-check.sh" T9 --cwd "$TMPDIR_TEST/t2/project" > /dev/null 2>&1; then
  fail "Should fail for invalid tier"
else
  pass "Missing tier config gives error"
fi

# ─── Test 6: Each real tier config has required fields ───────────────────────

echo "Test 6: Each real tier config has name and checklist"

all_good=true
for tier_file in "$REPO_ROOT/.superclaw/config/tiers/"*.yaml; do
  name=$(basename "$tier_file")
  if ! grep -q '^name:' "$tier_file" || ! grep -q '^checklist:' "$tier_file"; then
    fail "$name missing name or checklist"
    all_good=false
  fi
done

if $all_good; then
  pass "All tier configs have name and checklist"
fi

# ─── Test 7: T0 has most checks, T3 has fewest ──────────────────────────────

echo "Test 7: T0 has more checks than T3"

t0_count=$(grep -c '  - id:' "$REPO_ROOT/.superclaw/config/tiers/T0.yaml")
t3_count=$(grep -c '  - id:' "$REPO_ROOT/.superclaw/config/tiers/T3.yaml")

if [[ $t0_count -gt $t3_count ]]; then
  pass "T0 ($t0_count items) > T3 ($t3_count items)"
else
  fail "T0 should have more checks than T3"
fi

# ─── Results ────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
