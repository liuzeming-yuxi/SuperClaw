#!/usr/bin/env bash
# tier-check.sh — Run automatable checklist items for a given tier
#
# Usage: tier-check.sh <tier> [--cwd <project-dir>]
# Example: tier-check.sh T2 --cwd /path/to/project
#
# Reads the tier config from .superclaw/config/tiers/{tier}.yaml,
# runs each checklist item that has a verify command,
# reports results.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

# ─── Parse arguments ─────────────────────────────────────────────────────────

TIER=""
PROJECT_DIR="$(pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cwd) PROJECT_DIR="$2"; shift 2 ;;
    T[0-3]) TIER="$1"; shift ;;
    *)
      sc_fail "Unknown argument: $1"
      echo "Usage: tier-check.sh <tier> [--cwd <project-dir>]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TIER" ]]; then
  sc_fail "Missing tier argument (T0, T1, T2, or T3)"
  exit 1
fi

# ─── Resolve tier config ─────────────────────────────────────────────────────

SC_ROOT="$(resolve_superclaw_root)"
TIER_FILE="$SC_ROOT/config/tiers/${TIER}.yaml"

if [[ ! -f "$TIER_FILE" ]]; then
  sc_fail "Tier config not found: $TIER_FILE"
  exit 1
fi

tier_name=$(get_yaml_value "$TIER_FILE" "name")
sc_step "Tier Check: $tier_name"

# ─── Parse and run checklist ──────────────────────────────────────────────────

passed=0
failed=0
skipped=0
total=0

in_checklist=false
current_id=""
current_name=""
current_verify=""
current_required=""

run_check() {
  if [[ -z "$current_id" ]]; then
    return
  fi

  ((total++)) || true

  if [[ -z "$current_verify" ]] || [[ "$current_verify" == "null" ]]; then
    sc_warn "$current_name — manual check (skipped)"
    ((skipped++)) || true
    return
  fi

  if (cd "$PROJECT_DIR" && eval "$current_verify") > /dev/null 2>&1; then
    sc_ok "$current_name"
    ((passed++)) || true
  else
    sc_fail "$current_name"
    ((failed++)) || true
  fi
}

while IFS= read -r line; do
  if [[ "$line" == "checklist:" ]]; then
    in_checklist=true
    continue
  fi

  if ! $in_checklist; then
    continue
  fi

  # New top-level key means checklist section ended
  if [[ "$line" =~ ^[a-zA-Z] ]]; then
    run_check
    break
  fi

  # New checklist item
  if [[ "$line" =~ ^[[:space:]]*-[[:space:]] ]]; then
    run_check
    current_id=""
    current_name=""
    current_verify=""
    current_required=""

    if [[ "$line" =~ -[[:space:]]+id:[[:space:]]*(.*) ]]; then
      current_id="${BASH_REMATCH[1]}"
    fi
  elif [[ "$line" =~ ^[[:space:]]+id:[[:space:]]*(.*) ]]; then
    current_id="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ ^[[:space:]]+name:[[:space:]]*(.*) ]]; then
    current_name="${BASH_REMATCH[1]}"
    # Strip quotes
    current_name="${current_name#\"}"
    current_name="${current_name%\"}"
  elif [[ "$line" =~ ^[[:space:]]+verify:[[:space:]]*(.*) ]]; then
    current_verify="${BASH_REMATCH[1]}"
    current_verify="${current_verify#\"}"
    current_verify="${current_verify%\"}"
  elif [[ "$line" =~ ^[[:space:]]+required:[[:space:]]*(.*) ]]; then
    current_required="${BASH_REMATCH[1]}"
  fi
done < "$TIER_FILE"

# Run last item
run_check

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
sc_info "Results: $passed passed, $failed failed, $skipped manual ($total total)"

if [[ $failed -gt 0 ]]; then
  exit 1
fi
