#!/usr/bin/env bash
# lint-board-consistency.sh — Verify task frontmatter 'phase' matches its directory
# Usage: SUPERCLAW_ROOT=/path/.superclaw bash lint-board-consistency.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../bin/_helpers.sh"

SC_ROOT="$(resolve_superclaw_root)"
BOARD_DIR="$SC_ROOT/board"

errors=0

for phase_dir in "$BOARD_DIR"/*/; do
  [[ -d "$phase_dir" ]] || continue
  dir_phase=$(basename "$phase_dir")

  for task_file in "$phase_dir"*.md; do
    [[ -f "$task_file" ]] || continue

    file_phase=$(get_frontmatter "$task_file" "phase")
    if [[ -z "$file_phase" ]]; then
      sc_fail "$task_file: missing 'phase' field in frontmatter"
      ((errors++))
    elif [[ "$file_phase" != "$dir_phase" ]]; then
      sc_fail "$task_file: phase='$file_phase' but file is in '$dir_phase/' directory"
      ((errors++))
    fi
  done
done

if [[ $errors -gt 0 ]]; then
  exit 1
fi
