#!/usr/bin/env bash
# agent-check.sh — Check all enabled agents for trigger conditions
#
# Usage: agent-check.sh [--session-id <id>]
# Called at session start to:
#   1. Increment session counter for condition-based agents
#   2. Check if any agent's trigger conditions are met
#   3. Output names of triggered agents (one per line)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

SC_ROOT="$(resolve_superclaw_root)"
AGENTS_YAML="$SC_ROOT/config/agents.yaml"
AGENTS_DIR="$SC_ROOT/agents"

SESSION_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --session-id) SESSION_ID="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ ! -f "$AGENTS_YAML" ]]; then
  exit 0
fi

# ─── Parse agents from registry ───────────────────────────────────────────────

# Simple YAML parser: extract agent entries
current_name=""
current_type=""
current_enabled=""

check_agent() {
  if [[ -z "$current_name" ]] || [[ "$current_enabled" != "true" ]]; then
    return
  fi

  local state_file="$AGENTS_DIR/${current_name}-state.json"
  local agent_file="$AGENTS_DIR/${current_name}.md"

  case "$current_type" in
    persistent)
      check_condition_agent "$current_name" "$state_file" "$agent_file"
      ;;
    event-driven)
      # Event-driven agents are triggered externally, skip in periodic check
      ;;
    scheduled)
      # Scheduled agents need external cron, skip in periodic check
      ;;
  esac
}

check_condition_agent() {
  local name="$1"
  local state_file="$2"
  local agent_file="$3"

  if [[ ! -f "$state_file" ]]; then
    return
  fi

  # Read state
  local last_consolidation sessions_since_last

  # Parse JSON manually (no jq dependency)
  last_consolidation=$(grep -o '"last_consolidation": *"[^"]*"' "$state_file" | sed 's/.*: *"\(.*\)"/\1/')
  sessions_since_last=$(grep -o '"sessions_since_last": *[0-9]*' "$state_file" | sed 's/.*: *//')

  # Increment session counter
  sessions_since_last=$((sessions_since_last + 1))

  # Update state file
  local tmpfile
  tmpfile=$(mktemp)
  cat > "$tmpfile" << EOF
{
  "last_consolidation": "$last_consolidation",
  "sessions_since_last": $sessions_since_last,
  "last_session_id": "$SESSION_ID"
}
EOF
  mv "$tmpfile" "$state_file"

  # Check trigger conditions: >= 5 sessions AND >= 24 hours since last
  if [[ $sessions_since_last -lt 5 ]]; then
    return
  fi

  if [[ -z "$last_consolidation" ]]; then
    # Never run before → trigger
    echo "$name"
    return
  fi

  # Calculate hours since last consolidation
  local last_epoch now_epoch hours_diff
  last_epoch=$(date -d "$last_consolidation" +%s 2>/dev/null || echo 0)
  now_epoch=$(date -u +%s)
  hours_diff=$(( (now_epoch - last_epoch) / 3600 ))

  if [[ $hours_diff -ge 24 ]]; then
    echo "$name"
  fi
}

# ─── Parse agent registry ────────────────────────────────────────────────────

in_agents=false

while IFS= read -r line; do
  if [[ "$line" == "agents:" ]]; then
    in_agents=true
    continue
  fi

  if ! $in_agents; then
    continue
  fi

  # New top-level key
  if [[ "$line" =~ ^[a-zA-Z] ]]; then
    check_agent
    break
  fi

  # New agent entry
  if [[ "$line" =~ ^[[:space:]]*-[[:space:]] ]]; then
    check_agent
    current_name=""
    current_type=""
    current_enabled=""

    if [[ "$line" =~ -[[:space:]]+name:[[:space:]]*(.*) ]]; then
      current_name="${BASH_REMATCH[1]}"
    fi
  elif [[ "$line" =~ ^[[:space:]]+name:[[:space:]]*(.*) ]]; then
    current_name="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ ^[[:space:]]+type:[[:space:]]*(.*) ]]; then
    current_type="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ ^[[:space:]]+enabled:[[:space:]]*(.*) ]]; then
    current_enabled="${BASH_REMATCH[1]}"
  fi
done < "$AGENTS_YAML"

# Check last agent
check_agent
