#!/usr/bin/env bash
# Test agent-check.sh and persistent agent framework
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BIN_DIR="$REPO_ROOT/.superclaw/bin"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

echo "🧪 Testing agent-check.sh"
echo ""

# ─── Helper: create agent environment ────────────────────────────────────────

setup_agent_env() {
  local root="$1"
  mkdir -p "$root/.superclaw/config"
  mkdir -p "$root/.superclaw/agents"
  mkdir -p "$root/.superclaw/board/inbox"

  cat > "$root/.superclaw/config/agents.yaml" << 'EOF'
agents:
  - name: autodream
    skill: superclaw-autodream
    type: persistent
    enabled: true
  - name: doc-sync
    skill: superclaw-doc-sync
    type: event-driven
    enabled: false
  - name: ci-watch
    skill: superclaw-ci-watch
    type: scheduled
    enabled: false
EOF
}

# ─── Test 1: Session counter increments ──────────────────────────────────────

echo "Test 1: Session counter increments"

setup_agent_env "$TMPDIR_TEST/t1"
cat > "$TMPDIR_TEST/t1/.superclaw/agents/autodream-state.json" << 'EOF'
{
  "last_consolidation": "",
  "sessions_since_last": 0,
  "last_session_id": ""
}
EOF

SUPERCLAW_ROOT="$TMPDIR_TEST/t1/.superclaw" bash "$BIN_DIR/agent-check.sh" --session-id "sess1" > /dev/null 2>&1

count=$(grep -o '"sessions_since_last": *[0-9]*' "$TMPDIR_TEST/t1/.superclaw/agents/autodream-state.json" | sed 's/.*: *//')
if [[ "$count" == "1" ]]; then
  pass "Session counter incremented to 1"
else
  fail "Session counter should be 1 (got: $count)"
fi

# ─── Test 2: Counter increments across multiple calls ────────────────────────

echo "Test 2: Counter increments across multiple calls"

for i in 2 3 4; do
  SUPERCLAW_ROOT="$TMPDIR_TEST/t1/.superclaw" bash "$BIN_DIR/agent-check.sh" --session-id "sess$i" > /dev/null 2>&1
done

count=$(grep -o '"sessions_since_last": *[0-9]*' "$TMPDIR_TEST/t1/.superclaw/agents/autodream-state.json" | sed 's/.*: *//')
if [[ "$count" == "4" ]]; then
  pass "Session counter is 4 after 4 calls"
else
  fail "Session counter should be 4 (got: $count)"
fi

# ─── Test 3: Agent not triggered before 5 sessions ──────────────────────────

echo "Test 3: Agent not triggered with < 5 sessions"

output=$(SUPERCLAW_ROOT="$TMPDIR_TEST/t1/.superclaw" bash "$BIN_DIR/agent-check.sh" --session-id "sess5" 2>&1)
# After this call, counter = 5, but last_consolidation is empty → should trigger

# Re-test with exactly 4 sessions
setup_agent_env "$TMPDIR_TEST/t3"
cat > "$TMPDIR_TEST/t3/.superclaw/agents/autodream-state.json" << 'EOF'
{
  "last_consolidation": "",
  "sessions_since_last": 3,
  "last_session_id": ""
}
EOF

output=$(SUPERCLAW_ROOT="$TMPDIR_TEST/t3/.superclaw" bash "$BIN_DIR/agent-check.sh" --session-id "sess4" 2>&1)
if [[ -z "$output" ]]; then
  pass "Agent not triggered with 4 sessions"
else
  fail "Agent should not trigger with 4 sessions (got: $output)"
fi

# ─── Test 4: Agent triggered after 5 sessions (never run) ────────────────────

echo "Test 4: Agent triggered after 5 sessions (never run before)"

setup_agent_env "$TMPDIR_TEST/t4"
cat > "$TMPDIR_TEST/t4/.superclaw/agents/autodream-state.json" << 'EOF'
{
  "last_consolidation": "",
  "sessions_since_last": 4,
  "last_session_id": ""
}
EOF

output=$(SUPERCLAW_ROOT="$TMPDIR_TEST/t4/.superclaw" bash "$BIN_DIR/agent-check.sh" --session-id "sess5" 2>&1)
if [[ "$output" == "autodream" ]]; then
  pass "Agent triggered after 5 sessions (never run before)"
else
  fail "Agent should trigger (got: '$output')"
fi

# ─── Test 5: Agent not triggered if < 24 hours since last ───────────────────

echo "Test 5: Agent not triggered if < 24 hours since last run"

setup_agent_env "$TMPDIR_TEST/t5"
recent_time=$(date -u -d "2 hours ago" '+%Y-%m-%dT%H:%M:%SZ')
cat > "$TMPDIR_TEST/t5/.superclaw/agents/autodream-state.json" << EOF
{
  "last_consolidation": "$recent_time",
  "sessions_since_last": 9,
  "last_session_id": ""
}
EOF

output=$(SUPERCLAW_ROOT="$TMPDIR_TEST/t5/.superclaw" bash "$BIN_DIR/agent-check.sh" --session-id "sess10" 2>&1)
if [[ -z "$output" ]]; then
  pass "Agent not triggered (< 24h since last run)"
else
  fail "Agent should not trigger (got: '$output')"
fi

# ─── Test 6: Agent triggered if >= 24 hours since last ──────────────────────

echo "Test 6: Agent triggered if >= 24 hours since last run"

setup_agent_env "$TMPDIR_TEST/t6"
old_time=$(date -u -d "25 hours ago" '+%Y-%m-%dT%H:%M:%SZ')
cat > "$TMPDIR_TEST/t6/.superclaw/agents/autodream-state.json" << EOF
{
  "last_consolidation": "$old_time",
  "sessions_since_last": 9,
  "last_session_id": ""
}
EOF

output=$(SUPERCLAW_ROOT="$TMPDIR_TEST/t6/.superclaw" bash "$BIN_DIR/agent-check.sh" --session-id "sess10" 2>&1)
if [[ "$output" == "autodream" ]]; then
  pass "Agent triggered (>= 24h + >= 5 sessions)"
else
  fail "Agent should trigger (got: '$output')"
fi

# ─── Test 7: Disabled agents are skipped ─────────────────────────────────────

echo "Test 7: Disabled agents are skipped"

# doc-sync and ci-watch are disabled in our config, only autodream is enabled
# If agent-check outputs anything, it should only be autodream
setup_agent_env "$TMPDIR_TEST/t7"
cat > "$TMPDIR_TEST/t7/.superclaw/agents/autodream-state.json" << 'EOF'
{
  "last_consolidation": "",
  "sessions_since_last": 4,
  "last_session_id": ""
}
EOF

output=$(SUPERCLAW_ROOT="$TMPDIR_TEST/t7/.superclaw" bash "$BIN_DIR/agent-check.sh" --session-id "sess5" 2>&1)
# Should only output "autodream", not doc-sync or ci-watch
if echo "$output" | grep -qv "doc-sync\|ci-watch"; then
  pass "Disabled agents are skipped"
else
  fail "Disabled agents should be skipped (got: '$output')"
fi

# ─── Test 8: Session ID is recorded ─────────────────────────────────────────

echo "Test 8: Session ID is recorded in state file"

session_id=$(grep -o '"last_session_id": *"[^"]*"' "$TMPDIR_TEST/t7/.superclaw/agents/autodream-state.json" | sed 's/.*: *"\(.*\)"/\1/')
if [[ "$session_id" == "sess5" ]]; then
  pass "Session ID recorded"
else
  fail "Session ID not recorded (got: $session_id)"
fi

# ─── Test 9: Agent registry exists with correct structure ────────────────────

echo "Test 9: Agent registry has correct structure"

if grep -q 'agents:' "$REPO_ROOT/.superclaw/config/agents.yaml" && \
   grep -q 'name: autodream' "$REPO_ROOT/.superclaw/config/agents.yaml"; then
  pass "Agent registry has correct structure"
else
  fail "Agent registry structure incorrect"
fi

# ─── Test 10: Agent task file exists ─────────────────────────────────────────

echo "Test 10: AutoDream agent task file exists"

if [[ -f "$REPO_ROOT/.superclaw/agents/autodream.md" ]] && \
   grep -q 'agent: autodream' "$REPO_ROOT/.superclaw/agents/autodream.md"; then
  pass "AutoDream agent task file exists"
else
  fail "AutoDream agent task file missing"
fi

# ─── Test 11: No agents config → exit cleanly ───────────────────────────────

echo "Test 11: Missing agents.yaml exits cleanly"

mkdir -p "$TMPDIR_TEST/t11/.superclaw/config"

output=$(SUPERCLAW_ROOT="$TMPDIR_TEST/t11/.superclaw" bash "$BIN_DIR/agent-check.sh" 2>&1)
if [[ $? -eq 0 ]]; then
  pass "Missing agents.yaml exits cleanly"
else
  fail "Should exit cleanly without agents.yaml"
fi

# ─── Results ────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
