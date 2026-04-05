#!/usr/bin/env bash
# board-create.sh — Create a new task in the inbox
#
# Usage: board-create.sh --title "My task" [--type feature] [--priority medium]
#        [--tier T2] [--description "..."] [--assignee human]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

# ─── Parse arguments ─────────────────────────────────────────────────────────

TITLE=""
TYPE="feature"
PRIORITY=""
TIER=""
DESCRIPTION=""
ASSIGNEE="human"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)      TITLE="$2"; shift 2 ;;
    --type)       TYPE="$2"; shift 2 ;;
    --priority)   PRIORITY="$2"; shift 2 ;;
    --tier)       TIER="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --assignee)   ASSIGNEE="$2"; shift 2 ;;
    *)
      sc_fail "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# ─── Validate ────────────────────────────────────────────────────────────────

if [[ -z "$TITLE" ]]; then
  sc_fail "Missing required --title argument"
  exit 1
fi

# Resolve root
SC_ROOT="$(resolve_superclaw_root)"
BOARD_YAML="$SC_ROOT/config/board.yaml"
INBOX_DIR="$SC_ROOT/board/inbox"

# Read defaults from board.yaml
if [[ -z "$PRIORITY" ]]; then
  PRIORITY="$(get_yaml_value "$BOARD_YAML" "default_priority")"
fi
if [[ -z "$TIER" ]]; then
  TIER="$(get_yaml_value "$BOARD_YAML" "default_tier")"
fi

# Read and format ID
NEXT_ID="$(get_yaml_value "$BOARD_YAML" "next_id")"
ID="$(format_id "$NEXT_ID")"

# Generate slug: lowercase, spaces to hyphens, strip non-alphanumeric except hyphens
SLUG="$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')"

# Timestamp
TS="$(timestamp)"

# Description fallback
if [[ -z "$DESCRIPTION" ]]; then
  DESCRIPTION="No description provided."
fi

# ─── Create task file ────────────────────────────────────────────────────────

mkdir -p "$INBOX_DIR"

TASK_FILE="$INBOX_DIR/${ID}-${SLUG}.md"

cat > "$TASK_FILE" << EOF
---
id: "${ID}"
slug: ${SLUG}
created: ${TS}
updated: ${TS}
assignee: ${ASSIGNEE}
priority: ${PRIORITY}
type: ${TYPE}
tier: ${TIER}
phase: inbox
blocked_reason: ""
parent: ""
spec_path: ""
plan_path: ""
---

# ${TITLE}

## Description

${DESCRIPTION}

## Acceptance Criteria

- [ ] (to be defined during align phase)

## Verify

\`\`\`bash
# (to be defined during align phase)
\`\`\`

## History

| Time | Phase | Actor | Note |
|------|-------|-------|------|
| ${TS} | inbox | ${ASSIGNEE} | Created |
EOF

# ─── Increment next_id ──────────────────────────────────────────────────────

NEW_ID=$((NEXT_ID + 1))
set_yaml_value "$BOARD_YAML" "next_id" "$NEW_ID"

# ─── Output ──────────────────────────────────────────────────────────────────

sc_ok "Created task ${ID}: ${TITLE}"
echo "$TASK_FILE"
