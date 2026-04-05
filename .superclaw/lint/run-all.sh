#!/usr/bin/env bash
# run-all.sh — Run all SuperClaw lint scripts
# Usage: SUPERCLAW_ROOT=/path/.superclaw bash run-all.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../bin/_helpers.sh"

SC_ROOT="$(resolve_superclaw_root)"
errors=0

sc_step "Running SuperClaw lints"

# Board-wide lints (take SUPERCLAW_ROOT, no file args)
BOARD_LINTS="lint-task-file.sh lint-board-consistency.sh lint-verify-required.sh lint-tier-config.sh"

for name in $BOARD_LINTS; do
  lint_script="$SCRIPT_DIR/$name"
  [[ -f "$lint_script" ]] || continue
  if SUPERCLAW_ROOT="$SC_ROOT" bash "$lint_script" 2>&1; then
    sc_ok "$name"
  else
    sc_fail "$name"
    ((errors++)) || true
  fi
done

echo ""
if [[ $errors -gt 0 ]]; then
  sc_fail "$errors lint(s) failed"
  exit 1
else
  sc_ok "All lints passed"
fi
