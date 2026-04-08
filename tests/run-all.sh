#!/bin/bash
# Run all SuperClaw tests
#
# Usage: bash tests/run-all.sh
#
# Runs: install verification, hook tests, superclaw tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

TOTAL_PASS=0
TOTAL_FAIL=0
SUITES=0
FAILED_SUITES=""

run_suite() {
  local name="$1"
  local script="$2"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  ((SUITES++)) || true

  if bash "$script"; then
    echo ""
    echo "  Suite PASSED ✅"
  else
    echo ""
    echo "  Suite FAILED ❌"
    FAILED_SUITES="$FAILED_SUITES $name"
    ((TOTAL_FAIL++)) || true
  fi
}

echo "🦞 SuperClaw Test Suite"
echo "======================"

# Hook tests (always runnable, no external deps)
run_suite "Hook: notify" "$SCRIPT_DIR/hooks/test-notify.sh"
run_suite "Hook: progress" "$SCRIPT_DIR/hooks/test-progress.sh"

# Install verification (checks actual installation state)
run_suite "Install verification" "$SCRIPT_DIR/install/verify-install.sh"

# superclaw tests (requires superclaw installed)
if [ -f "/root/.openclaw/workspace/bin/superclaw.mjs" ]; then
  run_suite "superclaw: status" "$SCRIPT_DIR/superclaw/test-status.sh"
else
  echo ""
  echo "⏭️  Skipping superclaw tests (not installed)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FINAL RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Suites run: $SUITES"

if [ -n "$FAILED_SUITES" ]; then
  echo "  Failed suites:$FAILED_SUITES"
  echo ""
  echo "  ❌ Some tests failed"
  exit 1
else
  echo "  All suites passed"
  echo ""
  echo "  ✅ SuperClaw is healthy!"
  exit 0
fi
