#!/usr/bin/env bash
# lint-tier-config.sh — Validate tier config YAML files have required structure
# Usage: SUPERCLAW_ROOT=/path/.superclaw bash lint-tier-config.sh
# Each tier file must have: name, checklist (with items having id + name)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../bin/_helpers.sh"

SC_ROOT="$(resolve_superclaw_root)"
TIERS_DIR="$SC_ROOT/config/tiers"

if [[ ! -d "$TIERS_DIR" ]]; then
  exit 0
fi

errors=0

for tier_file in "$TIERS_DIR"/*.yaml; do
  [[ -f "$tier_file" ]] || continue

  # Check 'name' field exists
  name_val=$(get_yaml_value "$tier_file" "name")
  if [[ -z "$name_val" ]]; then
    sc_fail "$tier_file: missing 'name' field"
    ((errors++))
  fi

  # Check 'checklist' section exists
  if ! grep -q '^checklist:' "$tier_file"; then
    sc_fail "$tier_file: missing 'checklist' section"
    ((errors++))
    continue
  fi

  # Validate each checklist item has 'id' and 'name'
  in_checklist=false
  item_index=0
  current_id=""
  current_name=""

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
      break
    fi

    # New checklist item (starts with "  - ")
    if [[ "$line" =~ ^[[:space:]]*-[[:space:]] ]]; then
      # Validate previous item (if any)
      if [[ $item_index -gt 0 ]]; then
        if [[ -z "$current_id" ]]; then
          sc_fail "$tier_file: checklist item #$item_index missing 'id'"
          ((errors++))
        fi
        if [[ -z "$current_name" ]]; then
          sc_fail "$tier_file: checklist item #$item_index missing 'name'"
          ((errors++))
        fi
      fi
      ((item_index++)) || true
      current_id=""
      current_name=""

      # Extract inline key-value if present (e.g., "  - id: foo")
      if [[ "$line" =~ -[[:space:]]+id:[[:space:]]*(.*) ]]; then
        current_id="${BASH_REMATCH[1]}"
      elif [[ "$line" =~ -[[:space:]]+name:[[:space:]]*(.*) ]]; then
        current_name="${BASH_REMATCH[1]}"
      fi
    elif [[ "$line" =~ ^[[:space:]]+id:[[:space:]]*(.*) ]]; then
      current_id="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ ^[[:space:]]+name:[[:space:]]*(.*) ]]; then
      current_name="${BASH_REMATCH[1]}"
    fi
  done < "$tier_file"

  # Validate last item
  if [[ $item_index -gt 0 ]]; then
    if [[ -z "$current_id" ]]; then
      sc_fail "$tier_file: checklist item #$item_index missing 'id'"
      ((errors++))
    fi
    if [[ -z "$current_name" ]]; then
      sc_fail "$tier_file: checklist item #$item_index missing 'name'"
      ((errors++))
    fi
  fi
done

if [[ $errors -gt 0 ]]; then
  exit 1
fi
