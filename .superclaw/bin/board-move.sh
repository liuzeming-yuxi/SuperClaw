#!/usr/bin/env bash
# board-move.sh — Move a task file between phase directories
#
# Usage: board-move.sh <task-file> <from-phase> <to-phase> <note>
# Example: board-move.sh 001-add-dark-mode.md inbox aligning "开始对齐"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

# ─── Validate arguments ─────────────────────────────────────────────────────

if [[ $# -lt 4 ]]; then
  sc_fail "Usage: board-move.sh <task-file> <from-phase> <to-phase> <note>"
  exit 1
fi

TASK_FILE="$1"
FROM_PHASE="$2"
TO_PHASE="$3"
NOTE="$4"

# Validate phases
validate_phase() {
  local phase="$1"
  for p in $BOARD_PHASES; do
    [[ "$p" == "$phase" ]] && return 0
  done
  return 1
}

if ! validate_phase "$FROM_PHASE"; then
  sc_fail "Invalid from-phase: $FROM_PHASE (valid: $BOARD_PHASES)"
  exit 1
fi

if ! validate_phase "$TO_PHASE"; then
  sc_fail "Invalid to-phase: $TO_PHASE (valid: $BOARD_PHASES)"
  exit 1
fi

# Resolve root
SC_ROOT="$(resolve_superclaw_root)"

SRC="$SC_ROOT/board/$FROM_PHASE/$TASK_FILE"
DST_DIR="$SC_ROOT/board/$TO_PHASE"
DST="$DST_DIR/$TASK_FILE"

# Check source file exists
if [[ ! -f "$SRC" ]]; then
  sc_fail "Task file not found: $SRC"
  exit 1
fi

# ─── Move file ───────────────────────────────────────────────────────────────

mkdir -p "$DST_DIR"
mv "$SRC" "$DST"

# ─── Update frontmatter ─────────────────────────────────────────────────────

TS="$(timestamp)"

set_frontmatter "$DST" "phase" "$TO_PHASE"
set_frontmatter "$DST" "updated" "$TS"

# Handle blocked_reason
if [[ "$TO_PHASE" == "blocked" ]]; then
  set_frontmatter "$DST" "blocked_reason" "\"$NOTE\""
elif [[ "$FROM_PHASE" == "blocked" ]]; then
  set_frontmatter "$DST" "blocked_reason" "\"\""
fi

# ─── Append history row ─────────────────────────────────────────────────────

echo "| ${TS} | ${TO_PHASE} | system | ${NOTE} |" >> "$DST"

# ─── Output ──────────────────────────────────────────────────────────────────

sc_ok "Moved $TASK_FILE: $FROM_PHASE → $TO_PHASE"
