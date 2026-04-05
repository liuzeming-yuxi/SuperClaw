#!/usr/bin/env bash
# lint-task-file.sh — Validate task file frontmatter has all required fields
# Usage: SUPERCLAW_ROOT=/path/.superclaw bash lint-task-file.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../bin/_helpers.sh"

SC_ROOT="$(resolve_superclaw_root)"
BOARD_DIR="$SC_ROOT/board"
REQUIRED_FIELDS="id slug created updated assignee priority type tier phase"

errors=0

for phase_dir in "$BOARD_DIR"/*/; do
  [[ -d "$phase_dir" ]] || continue
  for task_file in "$phase_dir"*.md; do
    [[ -f "$task_file" ]] || continue

    # Check frontmatter exists (starts with ---)
    first_line=$(head -n1 "$task_file")
    if [[ "$first_line" != "---" ]]; then
      sc_fail "$task_file: missing frontmatter"
      ((errors++))
      continue
    fi

    for field in $REQUIRED_FIELDS; do
      value=$(get_frontmatter "$task_file" "$field")
      if [[ -z "$value" ]]; then
        sc_fail "$task_file: missing required field '$field'"
        ((errors++))
      fi
    done
  done
done

if [[ $errors -gt 0 ]]; then
  exit 1
fi
