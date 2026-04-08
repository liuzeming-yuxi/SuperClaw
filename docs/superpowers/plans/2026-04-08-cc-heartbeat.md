# CC Heartbeat & Abnormal Exit Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send Feishu progress heartbeats every 5 minutes while CC runs, and classify/alert on abnormal exits.

**Architecture:** Modify two existing bash hooks (superclaw-progress.sh, superclaw-notify.sh) and add session tracking to superclaw.mjs. Hooks read per-session state files written by superclaw to identify which task is running. No new processes, no new dependencies.

**Tech Stack:** Bash (hooks), Node.js (superclaw), jq, openclaw CLI (Feishu send)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `cli/superclaw.mjs` | Modify | Write/remove `~/.superclaw/state/sessions/{name}.json` on start/stop |
| `hooks/superclaw-progress.sh` | Modify | Existing log + new heartbeat throttle + Feishu send |
| `hooks/superclaw-notify.sh` | Modify | Exit classification + Feishu alert + orphan scan + cleanup |
| `tests/hooks/test-progress-heartbeat.sh` | Create | Heartbeat throttle tests |
| `tests/hooks/test-notify-abnormal.sh` | Create | Exit classification + orphan tests |
| `tests/cli/test-unit.mjs` | Modify | Add writeActiveSession/removeActiveSession tests |

---

### Task 1: superclaw — writeActiveSession / removeActiveSession

**Files:**
- Modify: `cli/superclaw.mjs`
- Test: `tests/cli/test-unit.mjs`

- [ ] **Step 1: Write failing tests for writeActiveSession and removeActiveSession**

Add to `tests/cli/test-unit.mjs`:

```javascript
import { writeActiveSession, removeActiveSession } from "../cli/superclaw.mjs";
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

describe("writeActiveSession", () => {
  const testDir = resolve(tmpdir(), `superclaw-test-${Date.now()}`);
  const sessionsDir = resolve(testDir, "sessions");

  after(() => { rmSync(testDir, { recursive: true, force: true }); });

  it("creates session file with correct fields", () => {
    const filePath = writeActiveSession(
      { sessionName: "nexus-onboard", cwd: "/root/code/nexus", model: "opus" },
      12345,
      testDir,
    );
    assert.ok(existsSync(filePath));
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    assert.strictEqual(data.session_name, "nexus-onboard");
    assert.strictEqual(data.cwd, "/root/code/nexus");
    assert.strictEqual(data.model, "opus");
    assert.strictEqual(data.pid, 12345);
    assert.ok(data.start_time);
  });

  it("uses exec-{pid} for unnamed sessions", () => {
    const filePath = writeActiveSession(
      { sessionName: null, cwd: "/tmp", model: "sonnet" },
      99999,
      testDir,
    );
    assert.ok(filePath.includes("exec-99999.json"));
  });

  it("removeActiveSession deletes the file", () => {
    const filePath = writeActiveSession(
      { sessionName: "to-remove", cwd: "/tmp", model: "opus" },
      11111,
      testDir,
    );
    assert.ok(existsSync(filePath));
    removeActiveSession({ sessionName: "to-remove" }, 11111, testDir);
    assert.ok(!existsSync(filePath));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/cli/test-unit.mjs`
Expected: FAIL — `writeActiveSession` and `removeActiveSession` not exported

- [ ] **Step 3: Implement writeActiveSession and removeActiveSession in superclaw.mjs**

Add after the `pruneConfigOverrides` function (around line 296), before the Opus guardrail section:

```javascript
// ─── Active session tracking (for heartbeat hooks) ────────────────────────

const DEFAULT_SESSIONS_DIR = resolve(homedir(), ".superclaw", "state", "sessions");

function writeActiveSession(opts, childPid, sessionsDir = DEFAULT_SESSIONS_DIR) {
  mkdirSync(sessionsDir, { recursive: true });
  const name = opts.sessionName || `exec-${childPid}`;
  const filePath = resolve(sessionsDir, `${name}.json`);
  writeFileSync(filePath, JSON.stringify({
    session_name: name,
    cwd: resolve(opts.cwd || process.cwd()),
    model: opts.model || "opus",
    pid: childPid,
    start_time: new Date().toISOString(),
  }, null, 2) + "\n");
  return filePath;
}

function removeActiveSession(opts, childPid, sessionsDir = DEFAULT_SESSIONS_DIR) {
  const name = opts.sessionName || `exec-${childPid}`;
  const filePath = resolve(sessionsDir, `${name}.json`);
  try { rmSync(filePath); } catch { /* already removed */ }
  // Also remove heartbeat file
  try { rmSync(resolve(sessionsDir, `${name}.heartbeat`)); } catch { /* ok */ }
}
```

Update the exports line to include the new functions:

```javascript
export { parseArgs, ensureEnv, classifyPromptState, scopeKey, stripQuotes, validateEnvKey, validateEnvValue, prepareInvocationEnv, writeActiveSession, removeActiveSession };
```

- [ ] **Step 4: Wire writeActiveSession into cmdExec**

Replace `cmdExec`:

```javascript
async function cmdExec(opts, acpx) {
  if (!opts.prompt) fail("exec requires --prompt <text>");

  const env = prepareInvocationEnv(opts);
  const commonArgs = buildCommonArgs(opts);
  const runArgs = [
    ...acpx.args, ...commonArgs,
    "claude", "exec", opts.prompt,
  ];

  info(`exec | model=${opts.model} | cwd=${opts.cwd || process.cwd()}`);
  const result = await spawnObserved(acpx.command, runArgs, env);
  process.exit(result.code);
}
```

With:

```javascript
async function cmdExec(opts, acpx) {
  if (!opts.prompt) fail("exec requires --prompt <text>");

  const env = prepareInvocationEnv(opts);
  const commonArgs = buildCommonArgs(opts);
  const runArgs = [
    ...acpx.args, ...commonArgs,
    "claude", "exec", opts.prompt,
  ];

  info(`exec | model=${opts.model} | cwd=${opts.cwd || process.cwd()}`);
  // Track active session for heartbeat hooks
  const fakePid = process.pid; // Use our own PID as placeholder until child spawns
  const sessionFile = writeActiveSession(opts, fakePid);
  try {
    const result = await spawnObserved(acpx.command, runArgs, env);
    process.exit(result.code);
  } finally {
    removeActiveSession(opts, fakePid);
  }
}
```

- [ ] **Step 5: Wire writeActiveSession into cmdSessionStart**

In `cmdSessionStart`, after the `info(...)` log line and before `const result = await spawnObserved(...)`, add:

```javascript
  const sessionFile = writeActiveSession(opts, process.pid);
```

Before each `process.exit(...)` call in that function (there are two — the normal exit and the retry exit), add:

```javascript
    removeActiveSession(opts, process.pid);
```

- [ ] **Step 6: Wire writeActiveSession into cmdSessionContinue**

Same pattern as Step 5. After the `info(...)` line, add `writeActiveSession`. Before each `process.exit(...)`, add `removeActiveSession`.

- [ ] **Step 7: Run all tests**

Run: `node --test tests/cli/test-unit.mjs`
Expected: All pass (37 existing + 3 new = 40)

- [ ] **Step 8: Commit**

```bash
git add cli/superclaw.mjs tests/cli/test-unit.mjs
git commit -m "feat(superclaw): track active sessions for heartbeat hooks"
```

---

### Task 2: superclaw-progress.sh — heartbeat throttle + Feishu send

**Files:**
- Modify: `hooks/superclaw-progress.sh`
- Create: `tests/hooks/test-progress-heartbeat.sh`

- [ ] **Step 1: Write the heartbeat test script**

Create `tests/hooks/test-progress-heartbeat.sh`:

```bash
#!/usr/bin/env bash
# Test superclaw-progress.sh heartbeat feature
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/superclaw-progress.sh"

TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

echo "🧪 Testing superclaw-progress.sh heartbeat"
echo ""

# ─── Setup: create a session file ───
SESSIONS_DIR="$TEST_DIR/sessions"
mkdir -p "$SESSIONS_DIR"
cat > "$SESSIONS_DIR/test-session.json" << 'EOF'
{
  "session_name": "test-session",
  "cwd": "/root/code/nexus",
  "model": "opus",
  "pid": 999999,
  "start_time": "2026-04-08T00:00:00Z"
}
EOF

# Use a mock openclaw that just logs the call
MOCK_BIN="$TEST_DIR/bin"
mkdir -p "$MOCK_BIN"
cat > "$MOCK_BIN/openclaw" << 'MOCKEOF'
#!/bin/bash
echo "$@" >> "$SUPERCLAW_STATE_DIR/feishu_calls.log"
MOCKEOF
chmod +x "$MOCK_BIN/openclaw"

export SUPERCLAW_STATE_DIR="$TEST_DIR"
export SUPERCLAW_FEISHU_TARGET="ou_test_user"
export SUPERCLAW_FEISHU_ACCOUNT="default"
export SUPERCLAW_OPENCLAW_PATH="$MOCK_BIN/openclaw"
export SUPERCLAW_HEARTBEAT_INTERVAL="2"  # 2 seconds for testing

# ─── Test 1: First call should NOT send heartbeat (interval not elapsed from 0) ───
echo "Test 1: First tool call — no heartbeat yet (just starts the clock)"

echo '{"tool_name":"Read","session_id":"s1"}' | bash "$HOOK"

if [[ ! -f "$TEST_DIR/feishu_calls.log" ]]; then
  pass "First call does not send Feishu (clock starts)"
else
  fail "First call should not send Feishu yet"
fi

# Verify heartbeat timestamp was written
if [[ -f "$SESSIONS_DIR/test-session.heartbeat" ]]; then
  pass "Heartbeat timestamp file created"
else
  fail "Heartbeat timestamp file not created"
fi

# ─── Test 2: Immediate second call should skip (interval not elapsed) ───
echo "Test 2: Immediate second call — skips heartbeat"

echo '{"tool_name":"Edit","session_id":"s1"}' | bash "$HOOK"

if [[ ! -f "$TEST_DIR/feishu_calls.log" ]]; then
  pass "Second call skips Feishu (interval not elapsed)"
else
  fail "Should not have sent Feishu yet"
fi

# ─── Test 3: After interval, should send heartbeat ───
echo "Test 3: After interval elapsed — sends heartbeat"

sleep 3  # Wait > 2 second interval

echo '{"tool_name":"Bash","session_id":"s1"}' | bash "$HOOK"

if [[ -f "$TEST_DIR/feishu_calls.log" ]]; then
  if grep -q "CC 进度" "$TEST_DIR/feishu_calls.log"; then
    pass "Heartbeat sent after interval"
  else
    fail "Feishu called but message wrong: $(cat "$TEST_DIR/feishu_calls.log")"
  fi
else
  fail "No Feishu call after interval elapsed"
fi

# ─── Test 4: Message contains session name and cwd ───
echo "Test 4: Message contains session info"

if grep -q "test-session" "$TEST_DIR/feishu_calls.log" && grep -q "nexus" "$TEST_DIR/feishu_calls.log"; then
  pass "Message includes session name and cwd"
else
  fail "Message missing session info: $(cat "$TEST_DIR/feishu_calls.log")"
fi

# ─── Test 5: No FEISHU_TARGET → no send ───
echo "Test 5: No FEISHU_TARGET skips send"

rm -f "$TEST_DIR/feishu_calls.log"
rm -f "$SESSIONS_DIR/test-session.heartbeat"
export SUPERCLAW_FEISHU_TARGET=""

sleep 3
echo '{"tool_name":"Read","session_id":"s1"}' | bash "$HOOK"
sleep 3
echo '{"tool_name":"Read","session_id":"s1"}' | bash "$HOOK"

if [[ ! -f "$TEST_DIR/feishu_calls.log" ]]; then
  pass "No Feishu send when target is empty"
else
  fail "Should not send when FEISHU_TARGET is empty"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/hooks/test-progress-heartbeat.sh`
Expected: FAIL — heartbeat logic doesn't exist yet

- [ ] **Step 3: Implement heartbeat in superclaw-progress.sh**

Replace the entire `hooks/superclaw-progress.sh` with:

```bash
#!/bin/bash
# SuperClaw Progress — Claude Code PostToolUse hook → 进度日志 + 心跳通知
# 触发时机：每次工具调用完成后（hooks.PostToolUse）
#
# 环境变量：
#   SUPERCLAW_STATE_DIR            — 状态文件目录（默认 ~/.superclaw/state）
#   SUPERCLAW_FEISHU_TARGET        — 飞书通知目标 open_id（可选）
#   SUPERCLAW_FEISHU_ACCOUNT       — 飞书账号（默认 default）
#   SUPERCLAW_HEARTBEAT_INTERVAL   — 心跳间隔秒数（默认 300）
#   SUPERCLAW_OPENCLAW_PATH        — openclaw 路径（默认 openclaw）

set -euo pipefail

STATE_DIR="${SUPERCLAW_STATE_DIR:-$HOME/.superclaw/state}"
LOG_MAX_BYTES="${SUPERCLAW_LOG_MAX_BYTES:-10485760}"
FEISHU_TARGET="${SUPERCLAW_FEISHU_TARGET:-}"
FEISHU_ACCOUNT="${SUPERCLAW_FEISHU_ACCOUNT:-default}"
HEARTBEAT_INTERVAL="${SUPERCLAW_HEARTBEAT_INTERVAL:-300}"
OPENCLAW_PATH="${SUPERCLAW_OPENCLAW_PATH:-openclaw}"
SESSIONS_DIR="$STATE_DIR/sessions"

mkdir -p "$STATE_DIR"

# Read hook input from stdin
HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
NOW_EPOCH=$(date +%s)

# ─── Log tool call (existing behavior) ──────────────────────────────────────

LOG_FILE="$STATE_DIR/tool_log.jsonl"
if [[ -f "$LOG_FILE" ]] && [[ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt "$LOG_MAX_BYTES" ]]; then
  mv "$LOG_FILE" "${LOG_FILE}.1"
fi

echo "{\"tool\":\"$TOOL_NAME\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
  >> "$LOG_FILE"

# ─── Heartbeat (new) ────────────────────────────────────────────────────────

# Match session: find session file by scanning sessions/*.json for this session_id
SESSION_FILE=""
SESSION_NAME=""
if [[ -d "$SESSIONS_DIR" ]]; then
  for f in "$SESSIONS_DIR"/*.json 2>/dev/null; do
    [[ -f "$f" ]] || continue
    if grep -q "\"pid\": *$$" "$f" 2>/dev/null || grep -q "$SESSION_ID" "$f" 2>/dev/null; then
      # Verify pid is alive (best-effort match)
      FILE_PID=$(jq -r '.pid // 0' "$f" 2>/dev/null)
      if kill -0 "$FILE_PID" 2>/dev/null; then
        SESSION_FILE="$f"
        SESSION_NAME=$(jq -r '.session_name // "unknown"' "$f" 2>/dev/null)
        break
      fi
    fi
  done
fi

# No matching session → skip heartbeat
if [[ -z "$SESSION_FILE" ]]; then
  exit 0
fi

# Read session metadata
SESSION_CWD=$(jq -r '.cwd // "unknown"' "$SESSION_FILE" 2>/dev/null)
SESSION_CWD_BASE=$(basename "$SESSION_CWD")
SESSION_START=$(jq -r '.start_time // ""' "$SESSION_FILE" 2>/dev/null)

# Throttle check
HEARTBEAT_FILE="$SESSIONS_DIR/${SESSION_NAME}.heartbeat"
LAST_SEND=0
if [[ -f "$HEARTBEAT_FILE" ]]; then
  LAST_SEND=$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
fi

ELAPSED_SINCE_SEND=$((NOW_EPOCH - LAST_SEND))

if [[ "$ELAPSED_SINCE_SEND" -lt "$HEARTBEAT_INTERVAL" ]]; then
  exit 0
fi

# Write heartbeat timestamp (even if Feishu send is skipped)
echo "$NOW_EPOCH" > "$HEARTBEAT_FILE"

# Skip Feishu if no target
if [[ -z "$FEISHU_TARGET" ]]; then
  exit 0
fi

# Build message
TOOL_COUNT=0
RECENT_TOOLS=""
if [[ -f "$LOG_FILE" ]]; then
  TOOL_COUNT=$(grep -c "\"session_id\":\"$SESSION_ID\"" "$LOG_FILE" 2>/dev/null || echo 0)
  RECENT_TOOLS=$(grep "\"session_id\":\"$SESSION_ID\"" "$LOG_FILE" 2>/dev/null | tail -5 | jq -r '.tool' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
fi

# Calculate elapsed minutes
ELAPSED_MIN="?"
if [[ -n "$SESSION_START" ]]; then
  START_EPOCH=$(date -d "$SESSION_START" +%s 2>/dev/null || echo 0)
  if [[ "$START_EPOCH" -gt 0 ]]; then
    ELAPSED_MIN=$(( (NOW_EPOCH - START_EPOCH) / 60 ))
  fi
fi

MESSAGE="📡 CC 进度 | ${SESSION_NAME} | ${SESSION_CWD_BASE}\n⏱ 已运行 ${ELAPSED_MIN}m | 工具调用 ${TOOL_COUNT} 次\n🔧 最近: ${RECENT_TOOLS}"

"$OPENCLAW_PATH" message send \
  --channel feishu \
  --account "$FEISHU_ACCOUNT" \
  --target "$FEISHU_TARGET" \
  --message "$MESSAGE" 2>/dev/null || true

exit 0
```

- [ ] **Step 4: Run heartbeat tests**

Run: `bash tests/hooks/test-progress-heartbeat.sh`
Expected: All 6 pass

- [ ] **Step 5: Run existing progress tests (regression check)**

Run: `bash tests/hooks/test-progress.sh`
Expected: All 3 pass (existing behavior preserved)

- [ ] **Step 6: Commit**

```bash
git add hooks/superclaw-progress.sh tests/hooks/test-progress-heartbeat.sh
git commit -m "feat(hooks): add heartbeat throttle + Feishu progress notification"
```

---

### Task 3: superclaw-notify.sh — exit classification + orphan scan

**Files:**
- Modify: `hooks/superclaw-notify.sh`
- Create: `tests/hooks/test-notify-abnormal.sh`

- [ ] **Step 1: Write the abnormal exit test script**

Create `tests/hooks/test-notify-abnormal.sh`:

```bash
#!/usr/bin/env bash
# Test superclaw-notify.sh exit classification + orphan scan
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/superclaw-notify.sh"

TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

# Mock openclaw
MOCK_BIN="$TEST_DIR/bin"
mkdir -p "$MOCK_BIN"
cat > "$MOCK_BIN/openclaw" << 'MOCKEOF'
#!/bin/bash
echo "$@" >> "$SUPERCLAW_STATE_DIR/feishu_calls.log"
MOCKEOF
chmod +x "$MOCK_BIN/openclaw"

SESSIONS_DIR="$TEST_DIR/sessions"
mkdir -p "$SESSIONS_DIR"

export SUPERCLAW_STATE_DIR="$TEST_DIR"
export SUPERCLAW_FEISHU_TARGET="ou_test"
export SUPERCLAW_FEISHU_ACCOUNT="default"
export SUPERCLAW_OPENCLAW_PATH="$MOCK_BIN/openclaw"

echo "🧪 Testing superclaw-notify.sh abnormal exit detection"
echo ""

# ─── Test 1: Normal exit (end_turn) → ✅ ───
echo "Test 1: Normal exit"

cat > "$SESSIONS_DIR/normal-task.json" << EOF
{"session_name":"normal-task","cwd":"/root/code/proj","model":"opus","pid":$$,"start_time":"2026-04-08T00:00:00Z"}
EOF
echo "$SESSIONS_DIR/normal-task.heartbeat" && echo "0" > "$SESSIONS_DIR/normal-task.heartbeat"

rm -f "$TEST_DIR/feishu_calls.log"
echo '{"tool_name":"Stop","session_id":"s1","stop_reason":"end_turn"}' | bash "$HOOK"

if grep -q "CC 完成" "$TEST_DIR/feishu_calls.log" 2>/dev/null; then
  pass "Normal exit → ✅ CC 完成"
else
  fail "Expected ✅ message, got: $(cat "$TEST_DIR/feishu_calls.log" 2>/dev/null)"
fi

# Verify cleanup
if [[ ! -f "$SESSIONS_DIR/normal-task.json" ]] && [[ ! -f "$SESSIONS_DIR/normal-task.heartbeat" ]]; then
  pass "Session files cleaned up after normal exit"
else
  fail "Session files not cleaned up"
fi

# ─── Test 2: Warning exit (max_turns) → ⚠️ ───
echo "Test 2: Warning exit"

cat > "$SESSIONS_DIR/warn-task.json" << EOF
{"session_name":"warn-task","cwd":"/root/code/proj","model":"opus","pid":$$,"start_time":"2026-04-08T00:00:00Z"}
EOF

rm -f "$TEST_DIR/feishu_calls.log"
echo '{"tool_name":"Stop","session_id":"s2","stop_reason":"max_turns"}' | bash "$HOOK"

if grep -q "CC 异常结束" "$TEST_DIR/feishu_calls.log" 2>/dev/null; then
  pass "Warning exit → ⚠️ CC 异常结束"
else
  fail "Expected ⚠️ message, got: $(cat "$TEST_DIR/feishu_calls.log" 2>/dev/null)"
fi

# ─── Test 3: Alert exit (missing stop_reason) → 🚨 ───
echo "Test 3: Alert exit (no stop_reason)"

cat > "$SESSIONS_DIR/alert-task.json" << EOF
{"session_name":"alert-task","cwd":"/root/code/proj","model":"opus","pid":$$,"start_time":"2026-04-08T00:00:00Z"}
EOF

rm -f "$TEST_DIR/feishu_calls.log"
echo '{"tool_name":"Stop","session_id":"s3"}' | bash "$HOOK"

if grep -q "CC 被中断" "$TEST_DIR/feishu_calls.log" 2>/dev/null; then
  pass "Missing stop_reason → 🚨 CC 被中断"
else
  fail "Expected 🚨 message, got: $(cat "$TEST_DIR/feishu_calls.log" 2>/dev/null)"
fi

# ─── Test 4: Orphan detection (dead pid) ───
echo "Test 4: Orphan detection"

cat > "$SESSIONS_DIR/orphan-task.json" << EOF
{"session_name":"orphan-task","cwd":"/root/code/proj","model":"opus","pid":9999999,"start_time":"2026-04-08T00:00:00Z"}
EOF

rm -f "$TEST_DIR/feishu_calls.log"
# Trigger a Stop for a different session — orphan scan runs after
echo '{"tool_name":"Stop","session_id":"s-other","stop_reason":"end_turn"}' | bash "$HOOK"

if grep -q "orphan-task" "$TEST_DIR/feishu_calls.log" 2>/dev/null; then
  pass "Orphan with dead pid detected and reported"
else
  fail "Orphan not detected: $(cat "$TEST_DIR/feishu_calls.log" 2>/dev/null)"
fi

if [[ ! -f "$SESSIONS_DIR/orphan-task.json" ]]; then
  pass "Orphan session file cleaned up"
else
  fail "Orphan session file not cleaned up"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/hooks/test-notify-abnormal.sh`
Expected: FAIL — exit classification logic doesn't exist yet

- [ ] **Step 3: Implement exit classification in superclaw-notify.sh**

Replace the entire `hooks/superclaw-notify.sh` with:

```bash
#!/bin/bash
# SuperClaw Notify — Claude Code Stop hook → 飞书通知 + 状态文件
# 触发时机：Claude Code session 结束（hooks.Stop）
#
# 环境变量：
#   SUPERCLAW_FEISHU_TARGET   — 飞书通知目标 open_id（必填，否则跳过飞书通知）
#   SUPERCLAW_FEISHU_ACCOUNT  — 飞书账号（默认 default）
#   SUPERCLAW_OPENCLAW_PATH   — openclaw 路径（默认 openclaw）
#   SUPERCLAW_STATE_DIR       — 状态文件目录（默认 ~/.superclaw/state）

set -euo pipefail

FEISHU_ACCOUNT="${SUPERCLAW_FEISHU_ACCOUNT:-default}"
FEISHU_TARGET="${SUPERCLAW_FEISHU_TARGET:-}"
OPENCLAW_PATH="${SUPERCLAW_OPENCLAW_PATH:-openclaw}"
STATE_DIR="${SUPERCLAW_STATE_DIR:-$HOME/.superclaw/state}"
LOG_MAX_BYTES="${SUPERCLAW_LOG_MAX_BYTES:-10485760}"
SESSIONS_DIR="$STATE_DIR/sessions"

mkdir -p "$STATE_DIR"

# Rotate log if it exceeds size limit
rotate_log() {
  local logfile="$1"
  if [[ -f "$logfile" ]] && [[ "$(stat -c%s "$logfile" 2>/dev/null || echo 0)" -gt "$LOG_MAX_BYTES" ]]; then
    mv "$logfile" "${logfile}.1"
  fi
}

# Send a Feishu message (no-op if target is empty)
send_feishu() {
  local message="$1"
  if [[ -z "$FEISHU_TARGET" ]]; then return 0; fi
  "$OPENCLAW_PATH" message send \
    --channel feishu \
    --account "$FEISHU_ACCOUNT" \
    --target "$FEISHU_TARGET" \
    --message "$message" 2>/dev/null || true
}

# Find session file matching a session_id (best-effort)
find_session_file() {
  local sid="$1"
  if [[ ! -d "$SESSIONS_DIR" ]]; then return; fi
  for f in "$SESSIONS_DIR"/*.json 2>/dev/null; do
    [[ -f "$f" ]] || continue
    if grep -q "$sid" "$f" 2>/dev/null; then
      echo "$f"
      return
    fi
  done
  # Fallback: match by alive pid
  for f in "$SESSIONS_DIR"/*.json 2>/dev/null; do
    [[ -f "$f" ]] || continue
    local fpid
    fpid=$(jq -r '.pid // 0' "$f" 2>/dev/null)
    if kill -0 "$fpid" 2>/dev/null; then
      echo "$f"
      return
    fi
  done
}

# Cleanup a session's state files
cleanup_session() {
  local name="$1"
  rm -f "$SESSIONS_DIR/${name}.json" "$SESSIONS_DIR/${name}.heartbeat" 2>/dev/null || true
}

# Read hook input from stdin
HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"')
STOP_REASON=$(echo "$HOOK_INPUT" | jq -r '.stop_reason // ""')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
NOW_EPOCH=$(date +%s)

case "$TOOL_NAME" in
  "Stop")
    # ─── Find session context ───
    SESSION_FILE=$(find_session_file "$SESSION_ID")
    SESSION_NAME="unknown"
    SESSION_CWD_BASE="?"
    ELAPSED_MIN="?"
    TOTAL_TOOLS=0

    if [[ -n "$SESSION_FILE" ]] && [[ -f "$SESSION_FILE" ]]; then
      SESSION_NAME=$(jq -r '.session_name // "unknown"' "$SESSION_FILE")
      SESSION_CWD=$(jq -r '.cwd // "unknown"' "$SESSION_FILE")
      SESSION_CWD_BASE=$(basename "$SESSION_CWD")
      SESSION_START=$(jq -r '.start_time // ""' "$SESSION_FILE")

      if [[ -n "$SESSION_START" ]]; then
        START_EPOCH=$(date -d "$SESSION_START" +%s 2>/dev/null || echo 0)
        if [[ "$START_EPOCH" -gt 0 ]]; then
          ELAPSED_MIN=$(( (NOW_EPOCH - START_EPOCH) / 60 ))
        fi
      fi
    fi

    # Count total tool calls for this session
    LOG_FILE="$STATE_DIR/tool_log.jsonl"
    if [[ -f "$LOG_FILE" ]]; then
      TOTAL_TOOLS=$(grep -c "\"session_id\":\"$SESSION_ID\"" "$LOG_FILE" 2>/dev/null || echo 0)
    fi

    # ─── Classify exit and send notification ───
    case "$STOP_REASON" in
      end_turn)
        send_feishu "✅ CC 完成 | ${SESSION_NAME} | ${SESSION_CWD_BASE}\n⏱ 耗时 ${ELAPSED_MIN}m | 工具调用 ${TOTAL_TOOLS} 次"
        ;;
      tool_error|max_turns)
        send_feishu "⚠️ CC 异常结束 | ${SESSION_NAME} | ${SESSION_CWD_BASE}\n原因: ${STOP_REASON} | ⏱ 耗时 ${ELAPSED_MIN}m"
        ;;
      *)
        send_feishu "🚨 CC 被中断 | ${SESSION_NAME} | ${SESSION_CWD_BASE}\n可能原因: SIGTERM/SIGKILL/Gateway 崩溃\n⏱ 已运行 ${ELAPSED_MIN}m | 工具调用 ${TOTAL_TOOLS} 次"
        ;;
    esac

    # Write state file for OpenClaw to pick up
    echo "{\"event\":\"execute_done\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\",\"stop_reason\":\"$STOP_REASON\"}" \
      > "$STATE_DIR/last_event.json"

    # Cleanup this session
    if [[ -n "$SESSION_NAME" ]] && [[ "$SESSION_NAME" != "unknown" ]]; then
      cleanup_session "$SESSION_NAME"
    fi

    # ─── Orphan scan: find dead sessions ───
    if [[ -d "$SESSIONS_DIR" ]]; then
      for f in "$SESSIONS_DIR"/*.json 2>/dev/null; do
        [[ -f "$f" ]] || continue
        local_name=$(jq -r '.session_name // ""' "$f" 2>/dev/null)
        local_pid=$(jq -r '.pid // 0' "$f" 2>/dev/null)
        local_cwd=$(jq -r '.cwd // "?"' "$f" 2>/dev/null)
        local_start=$(jq -r '.start_time // ""' "$f" 2>/dev/null)

        # Check if pid is still alive
        if ! kill -0 "$local_pid" 2>/dev/null; then
          local_elapsed="?"
          if [[ -n "$local_start" ]]; then
            local_se=$(date -d "$local_start" +%s 2>/dev/null || echo 0)
            if [[ "$local_se" -gt 0 ]]; then
              local_elapsed=$(( (NOW_EPOCH - local_se) / 60 ))
            fi
          fi
          send_feishu "🚨 CC 孤儿进程 | ${local_name} | $(basename "$local_cwd")\nPID ${local_pid} 已不存在 | 已运行 ${local_elapsed}m"
          cleanup_session "$local_name"
        fi
      done
    fi
    ;;
  *)
    # Non-Stop events: log only
    rotate_log "$STATE_DIR/tool_log.jsonl"
    echo "{\"tool\":\"$TOOL_NAME\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
      >> "$STATE_DIR/tool_log.jsonl"
    ;;
esac

exit 0
```

- [ ] **Step 4: Run abnormal exit tests**

Run: `bash tests/hooks/test-notify-abnormal.sh`
Expected: All 6 pass

- [ ] **Step 5: Run existing notify tests (regression check)**

Run: `bash tests/hooks/test-notify.sh`
Expected: All 3 pass (existing behavior preserved)

- [ ] **Step 6: Commit**

```bash
git add hooks/superclaw-notify.sh tests/hooks/test-notify-abnormal.sh
git commit -m "feat(hooks): exit classification, orphan scan, Feishu alerts"
```

---

### Task 4: Install + update OpenClaw + full test run

**Files:**
- Modify: (none — just run existing installer + tests)

- [ ] **Step 1: Run the full test suite**

```bash
bash tests/run-all.sh
```

Expected: All test suites pass

- [ ] **Step 2: Reinstall hooks to the live system**

```bash
bash scripts/install.sh --skip-superclaw
```

Expected: Skills + hooks updated, no duplicate hook entries

- [ ] **Step 3: Verify no duplicate hooks in settings.json**

```bash
jq '.hooks.Stop | length' ~/.claude/settings.json
jq '.hooks.PostToolUse | length' ~/.claude/settings.json
```

Expected: Both return `1`

- [ ] **Step 4: Commit everything and push**

```bash
git push origin main
```

- [ ] **Step 5: Smoke test — trigger a real CC exec and watch for heartbeat**

```bash
# Set Feishu target if not already set
export SUPERCLAW_FEISHU_TARGET="ou_your_open_id"

# Run a short CC task
node /root/.openclaw/workspace/bin/superclaw.mjs exec \
  --cwd /root/.openclaw/workspace/repos/superclaw \
  --model sonnet --timeout 60 \
  --prompt "Read the README.md and reply with a one-sentence summary"

# Check that session file was created then cleaned up
ls ~/.superclaw/state/sessions/

# Check last_event.json
cat ~/.superclaw/state/last_event.json
```

Expected: Session file created during execution, cleaned up after. `last_event.json` has `stop_reason` field. If FEISHU_TARGET is set, Feishu notification received.
