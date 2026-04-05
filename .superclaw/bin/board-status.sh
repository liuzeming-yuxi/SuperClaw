#!/usr/bin/env bash
# board-status.sh — Show count summary of all board phases
#
# Usage: board-status.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

# ─── Main ─────────────────────────────────────────────────────────────────────

SC_ROOT="$(resolve_superclaw_root)"

TOTAL=0

# Bold
B='\033[1m'
# Dim
D='\033[2m'
# Reset
R='\033[0m'

printf "${B}%-15s  %s${R}\n" "Phase" "Count"
printf '─────────────   ─────\n'

for phase in $BOARD_PHASES; do
  phase_dir="$SC_ROOT/board/$phase"
  count=0
  if [[ -d "$phase_dir" ]]; then
    count=$(find "$phase_dir" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l)
  fi
  TOTAL=$((TOTAL + count))

  if [[ "$count" -eq 0 ]]; then
    printf "${D}%-15s  %d${R}\n" "$phase" "$count"
  else
    printf "%-15s  %d\n" "$phase" "$count"
  fi
done

printf '─────────────   ─────\n'
printf "${B}%-15s  %d${R}\n" "Total" "$TOTAL"
