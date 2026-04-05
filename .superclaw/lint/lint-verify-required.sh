#!/usr/bin/env bash
# lint-verify-required.sh — Ensure tasks in non-exempt phases have a non-empty ## Verify section
# Usage: SUPERCLAW_ROOT=/path/.superclaw bash lint-verify-required.sh
# Exempt phases: inbox, aligning, planned, blocked
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../bin/_helpers.sh"

SC_ROOT="$(resolve_superclaw_root)"
BOARD_DIR="$SC_ROOT/board"
EXEMPT_PHASES="inbox aligning planned blocked"

errors=0

for phase_dir in "$BOARD_DIR"/*/; do
  [[ -d "$phase_dir" ]] || continue
  phase_name=$(basename "$phase_dir")

  # Skip exempt phases
  skip=false
  for exempt in $EXEMPT_PHASES; do
    [[ "$phase_name" == "$exempt" ]] && skip=true && break
  done
  $skip && continue

  for task_file in "$phase_dir"*.md; do
    [[ -f "$task_file" ]] || continue

    # Check for ## Verify heading
    if ! grep -q '^## Verify' "$task_file"; then
      sc_fail "$task_file: missing ## Verify section (required for phase '$phase_name')"
      ((errors++))
      continue
    fi

    # Check that ## Verify has content (non-empty between ## Verify and next ## or EOF)
    verify_content=$(sed -n '/^## Verify/,/^## /{ /^## /d; p; }' "$task_file" | sed '/^[[:space:]]*$/d')
    if [[ -z "$verify_content" ]]; then
      sc_fail "$task_file: ## Verify section is empty (required for phase '$phase_name')"
      ((errors++))
    fi
  done
done

if [[ $errors -gt 0 ]]; then
  exit 1
fi
