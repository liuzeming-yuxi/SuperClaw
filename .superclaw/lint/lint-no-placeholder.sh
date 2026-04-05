#!/usr/bin/env bash
# lint-no-placeholder.sh — Detect TBD/TODO/FIXME/XXX/待定 placeholders in spec files
# Usage: bash lint-no-placeholder.sh file1.md [file2.md ...]
# Placeholders inside code blocks (```) are ignored.
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: lint-no-placeholder.sh <file> [file ...]" >&2
  exit 1
fi

errors=0

for file in "$@"; do
  [[ -f "$file" ]] || continue

  in_code_block=false
  line_num=0

  while IFS= read -r line; do
    ((line_num++)) || true
    # Toggle code block state
    if [[ "$line" =~ ^\`\`\` ]]; then
      if $in_code_block; then
        in_code_block=false
      else
        in_code_block=true
      fi
      continue
    fi

    $in_code_block && continue

    if echo "$line" | grep -qiE '\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b|待定'; then
      echo "$file:$line_num: placeholder found: $line" >&2
      ((errors++)) || true
    fi
  done < "$file"
done

if [[ $errors -gt 0 ]]; then
  exit 1
fi
