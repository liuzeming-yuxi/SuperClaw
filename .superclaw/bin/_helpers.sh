#!/usr/bin/env bash
# SuperClaw shared helpers library
# Source this file from other scripts: source "$(dirname "$0")/_helpers.sh"

set -euo pipefail

# ──�� Constants ───────────────────────────────────────────────────────────────

BOARD_PHASES="inbox aligning planned executing reviewing done blocked"
VALID_PRIORITIES="low medium high critical"
VALID_TYPES="feature bug chore refactor spike"
VALID_TIERS="T0 T1 T2 T3"

# ─── Output helpers ──────────────────────────────────────────────────────────

sc_info()  { printf '\033[1;34m[superclaw]\033[0m %s\n' "$1"; }
sc_ok()    { printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
sc_warn()  { printf '  \033[1;33m⚠️\033[0m  %s\n' "$1"; }
sc_fail()  { printf '  \033[1;31m❌\033[0m %s\n' "$1"; }
sc_step()  { printf '\n\033[1m## %s\033[0m\n\n' "$1"; }

# ─── Frontmatter helpers ────────────────────────────────────────────────────
# Frontmatter = YAML block between --- delimiters at top of .md files

# get_frontmatter(file, key) — extract value from YAML frontmatter, strip quotes
get_frontmatter() {
  local file="$1" key="$2"
  local in_frontmatter=false
  local value=""

  while IFS= read -r line; do
    if [[ "$line" == "---" ]]; then
      if $in_frontmatter; then
        break
      else
        in_frontmatter=true
        continue
      fi
    fi
    if $in_frontmatter; then
      if [[ "$line" =~ ^${key}:\ *(.*) ]]; then
        value="${BASH_REMATCH[1]}"
        # Strip surrounding quotes
        value="${value#\"}"
        value="${value%\"}"
        value="${value#\'}"
        value="${value%\'}"
        break
      fi
    fi
  done < "$file"

  printf '%s' "$value"
}

# set_frontmatter(file, key, value) — update or insert value in frontmatter
set_frontmatter() {
  local file="$1" key="$2" value="$3"
  local tmpfile
  tmpfile=$(mktemp)

  local in_frontmatter=false
  local found=false

  while IFS= read -r line; do
    if [[ "$line" == "---" ]]; then
      if $in_frontmatter; then
        # Closing delimiter — insert key here if not found yet
        if ! $found; then
          echo "${key}: ${value}" >> "$tmpfile"
          found=true
        fi
        in_frontmatter=false
        echo "$line" >> "$tmpfile"
        continue
      else
        in_frontmatter=true
        echo "$line" >> "$tmpfile"
        continue
      fi
    fi
    if $in_frontmatter && [[ "$line" =~ ^${key}: ]]; then
      echo "${key}: ${value}" >> "$tmpfile"
      found=true
    else
      echo "$line" >> "$tmpfile"
    fi
  done < "$file"

  mv "$tmpfile" "$file"
}

# ─── YAML helpers ───────────────────────────────────────────────────────────
# Plain YAML files (no frontmatter delimiters)

# get_yaml_value(file, key) — extract value from plain YAML file
get_yaml_value() {
  local file="$1" key="$2"
  local value=""

  while IFS= read -r line; do
    if [[ "$line" =~ ^${key}:\ *(.*) ]]; then
      value="${BASH_REMATCH[1]}"
      # Strip surrounding quotes
      value="${value#\"}"
      value="${value%\"}"
      value="${value#\'}"
      value="${value%\'}"
      break
    fi
  done < "$file"

  printf '%s' "$value"
}

# set_yaml_value(file, key, value) — update value in plain YAML file
# Uses line-by-line rewrite instead of sed to avoid delimiter/regex issues.
set_yaml_value() {
  local file="$1" key="$2" value="$3"
  local tmpfile found=false
  tmpfile=$(mktemp)

  while IFS= read -r line; do
    if [[ "$line" =~ ^${key}: ]]; then
      echo "${key}: ${value}" >> "$tmpfile"
      found=true
    else
      echo "$line" >> "$tmpfile"
    fi
  done < "$file"

  if ! $found; then
    echo "${key}: ${value}" >> "$tmpfile"
  fi

  mv "$tmpfile" "$file"
}

# ─── Utility helpers ────────────────────────────────────────────────────────

# format_id(number) — zero-pad to 3 digits minimum
format_id() {
  printf '%03d' "$1"
}

# timestamp() — UTC ISO 8601 format
timestamp() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

# resolve_superclaw_root([start_dir]) — find .superclaw/ directory
# Supports SUPERCLAW_ROOT env override
resolve_superclaw_root() {
  # Check env override first
  if [[ -n "${SUPERCLAW_ROOT:-}" ]]; then
    printf '%s' "$SUPERCLAW_ROOT"
    return 0
  fi

  local dir="${1:-$(pwd)}"

  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/.superclaw" ]]; then
      printf '%s' "$dir/.superclaw"
      return 0
    fi
    dir="$(dirname "$dir")"
  done

  # Check root
  if [[ -d "/.superclaw" ]]; then
    printf '%s' "/.superclaw"
    return 0
  fi

  return 1
}
