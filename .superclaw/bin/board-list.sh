#!/usr/bin/env bash
# board-list.sh — List tasks in a specific phase or all phases
#
# Usage: board-list.sh <phase>        # List tasks in one phase
#        board-list.sh --all          # List tasks in all phases

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

# ─── Helpers ──────────────────────────────────────────────────────────────────

# Extract title from first # heading in file (after frontmatter)
get_title() {
  local file="$1"
  local in_frontmatter=false
  local past_frontmatter=false

  while IFS= read -r line; do
    if [[ "$line" == "---" ]]; then
      if $in_frontmatter; then
        past_frontmatter=true
        continue
      else
        in_frontmatter=true
        continue
      fi
    fi
    if $past_frontmatter && [[ "$line" =~ ^#\ (.*) ]]; then
      printf '%s' "${BASH_REMATCH[1]}"
      return
    fi
  done < "$file"

  printf '%s' "(untitled)"
}

# List tasks in a single phase directory
list_phase() {
  local phase="$1"
  local phase_dir="$SC_ROOT/board/$phase"
  local count=0

  if [[ ! -d "$phase_dir" ]]; then
    echo "(no tasks)"
    return
  fi

  local files=()
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(find "$phase_dir" -maxdepth 1 -name '*.md' -print0 2>/dev/null | sort -z)

  if [[ ${#files[@]} -eq 0 ]]; then
    echo "(no tasks)"
    return
  fi

  for file in "${files[@]}"; do
    local filename
    filename="$(basename "$file")"
    local tier priority type title
    tier="$(get_frontmatter "$file" "tier")"
    priority="$(get_frontmatter "$file" "priority")"
    type="$(get_frontmatter "$file" "type")"
    title="$(get_title "$file")"

    printf '  %-25s  %-4s  %-8s  %-8s  %s\n' "$filename" "$tier" "$priority" "$type" "$title"
    ((count++)) || true
  done
}

# ─── Main ─────────────────────────────────────────────────────────────────────

SC_ROOT="$(resolve_superclaw_root)"

if [[ $# -lt 1 ]]; then
  sc_fail "Usage: board-list.sh <phase> | --all"
  exit 1
fi

if [[ "$1" == "--all" ]]; then
  for phase in $BOARD_PHASES; do
    phase_dir="$SC_ROOT/board/$phase"
    count=0
    if [[ -d "$phase_dir" ]]; then
      count=$(find "$phase_dir" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l)
    fi
    printf '\n\033[1m%s\033[0m (%d)\n' "$phase" "$count"
    list_phase "$phase"
  done
else
  PHASE="$1"
  # Validate phase
  valid=false
  for p in $BOARD_PHASES; do
    if [[ "$p" == "$PHASE" ]]; then
      valid=true
      break
    fi
  done

  if ! $valid; then
    sc_fail "Invalid phase: $PHASE"
    sc_fail "Valid phases: $BOARD_PHASES"
    exit 1
  fi

  printf '\033[1m%s\033[0m\n' "$PHASE"
  list_phase "$PHASE"
fi
