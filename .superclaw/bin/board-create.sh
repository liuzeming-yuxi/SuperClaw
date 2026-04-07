#!/usr/bin/env bash
# board-create.sh — Create a new task in the inbox
#
# Usage: board-create.sh --title "My task" [--type feature]
#        [--tier T2] [--description "..."] [--assignee human]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

# ─── Parse arguments ─────────────────────────────────────────────────────────

TITLE=""
TYPE="feature"
TIER=""
DESCRIPTION=""
ASSIGNEE="human"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)      TITLE="$2"; shift 2 ;;
    --type)       TYPE="$2"; shift 2 ;;
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
if [[ -z "$TIER" ]]; then
  TIER="$(get_yaml_value "$BOARD_YAML" "default_tier")"
fi

# Generate slug: lowercase, spaces to hyphens, strip non-alphanumeric except hyphens
SLUG="$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')"

# Timestamp
TS="$(timestamp)"

# Description fallback
if [[ -z "$DESCRIPTION" ]]; then
  DESCRIPTION="暂无描述。"
fi

# ─── Create task file (under flock to prevent ID race) ───────────────────────

mkdir -p "$INBOX_DIR"
LOCK_FILE="${BOARD_YAML}.lock"

# Use flock to serialize ID allocation across concurrent processes.
# The subshell writes the created file path to a temp file so we can read it back.
RESULT_FILE="$(mktemp)"
trap 'rm -f "$RESULT_FILE"' EXIT

(
  flock -w 10 9 || { sc_fail "Failed to acquire board lock"; exit 1; }

  # Read and format ID inside lock
  NEXT_ID="$(get_yaml_value "$BOARD_YAML" "next_id")"
  ID="$(format_id "$NEXT_ID")"
  TASK_FILE="$INBOX_DIR/${ID}-${SLUG}.md"

  if [[ -f "$TASK_FILE" ]]; then
    sc_fail "Task file already exists: $TASK_FILE"
    exit 1
  fi

  cat > "$TASK_FILE" << EOF
---
id: "${ID}"
slug: ${SLUG}
created: ${TS}
updated: ${TS}
assignee: ${ASSIGNEE}
type: ${TYPE}
tier: ${TIER}
phase: inbox
blocked_reason: ""
parent: ""
spec_path: ""
plan_path: ""
---

# ${TITLE}

## 描述

${DESCRIPTION}

## 验收标准

- [ ] （待对齐阶段定义）

## 历史

| Time | Phase | Actor | Note |
|------|-------|-------|------|
| ${TS} | inbox | ${ASSIGNEE} | 创建任务 |
EOF

  # Increment next_id inside lock
  NEW_ID=$((NEXT_ID + 1))
  set_yaml_value "$BOARD_YAML" "next_id" "$NEW_ID"

  # Pass ID and file path back to parent
  printf '%s\n%s' "$ID" "$TASK_FILE" > "$RESULT_FILE"

) 9>"$LOCK_FILE"

# ─── Output ──────────────────────────────────────────────────────────────────

ID="$(sed -n '1p' "$RESULT_FILE")"
TASK_FILE="$(sed -n '2p' "$RESULT_FILE")"

sc_ok "Created task ${ID}: ${TITLE}"
echo "$TASK_FILE"
