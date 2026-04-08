# CC Heartbeat & Abnormal Exit Detection

## Problem

When OpenClaw delegates long-running tasks to Claude Code (CC), users have no visibility into whether CC is still working or has crashed. The only notification comes when CC finishes — but if it's killed (by Gateway crash, SIGTERM, OOM, etc.), no notification fires at all.

## Solution

Two features, both implemented by modifying existing Claude Code hooks:

1. **Progress heartbeat**: Every 5 minutes, send a Feishu message summarizing CC's activity
2. **Abnormal exit detection**: When CC stops, determine if it was normal or abnormal, and send appropriate notification

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Channel | Feishu only | User preference; Web UI not needed |
| Mechanism | Reuse PostToolUse hook + throttle | Zero new processes; lightest change |
| Frequency | Every 5 minutes | Not too noisy, timely enough |
| Message content | Statistics, no model summarization | Fast, free, no API dependency |
| Multi-instance | Supported from day one | Multiple CC instances will run concurrently |

## Architecture

```
CC instance 1 ──PostToolUse──> superclaw-progress.sh ──(throttled)──> Feishu
CC instance 2 ──PostToolUse──> superclaw-progress.sh ──(throttled)──> Feishu
CC instance 1 ──Stop──────────> superclaw-notify.sh ──(always)──────> Feishu
```

### Data flow

```
superclaw starts CC
  └─ writes ~/.superclaw/state/sessions/{name}.json
       { session_name, cwd, model, pid, start_time, session_id }

Every tool call:
  └─ PostToolUse hook fires superclaw-progress.sh
       ├─ appends to tool_log.jsonl (existing)
       ├─ reads sessions/{name}.json to identify task
       ├─ checks sessions/{name}.heartbeat for last send time
       └─ if >= 300s since last send → send Feishu + update heartbeat file

CC stops:
  └─ Stop hook fires superclaw-notify.sh
       ├─ reads stop_reason from stdin JSON
       ├─ reads sessions/{name}.json for context
       ├─ sends Feishu with status (success/warning/alert)
       ├─ deletes sessions/{name}.json and sessions/{name}.heartbeat
       └─ scans sessions/ for orphaned files (pid dead but file exists)
```

## Component 1: Progress Heartbeat (superclaw-progress.sh)

### Changes to existing script

Add after the existing log-append logic:

1. **Match session**: Use `session_id` from hook stdin. Iterate `~/.superclaw/state/sessions/*.json`, grep for matching `session_id` field. Cache the matched filename in a shell variable for subsequent steps. If no match, skip heartbeat (short-lived or untracked task).

2. **Throttle check**: Read `sessions/{name}.heartbeat` file. If it doesn't exist or its content (Unix timestamp) is >= 300 seconds old, proceed. Otherwise skip.

3. **Build message**: Count lines in `tool_log.jsonl` for this session_id since the heartbeat timestamp. Extract last 5 tool names.

4. **Send Feishu**: Call `openclaw message send` with formatted message. If `SUPERCLAW_FEISHU_TARGET` is unset, skip.

5. **Update heartbeat**: Write current Unix timestamp to `sessions/{name}.heartbeat`.

### Message format

```
📡 CC 进度 | {session_name} | {cwd_basename}
⏱ 已运行 {elapsed}m | 本轮工具调用 {count} 次
🔧 最近: Read, Edit, Bash, Grep, Read
```

### Throttle file

`~/.superclaw/state/sessions/{name}.heartbeat` — contains a single Unix timestamp. Each session has its own file, so multiple CC instances throttle independently.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `SUPERCLAW_FEISHU_TARGET` | (none) | Feishu open_id. If unset, skip Feishu send |
| `SUPERCLAW_FEISHU_ACCOUNT` | `default` | Feishu account name |
| `SUPERCLAW_HEARTBEAT_INTERVAL` | `300` | Seconds between heartbeat sends |
| `SUPERCLAW_OPENCLAW_PATH` | `openclaw` | Path to openclaw CLI |

## Component 2: Abnormal Exit Detection (superclaw-notify.sh)

### Changes to existing script

Replace the current simple Stop handler with:

1. **Read stop context**: Parse `stop_reason` from hook stdin JSON.

2. **Match session**: Find `sessions/{name}.json` by session_id. Read cwd, session_name, start_time.

3. **Classify exit**:

| stop_reason | Classification | Emoji |
|---|---|---|
| `end_turn` | Normal completion | ✅ |
| `tool_error` / `max_turns` | Warning | ⚠️ |
| Missing / `unknown` | Likely killed | 🚨 |

4. **Compute summary**: Count total tool calls for this session_id in tool_log.jsonl. Calculate elapsed time from start_time.

5. **Send Feishu**:

Normal:
```
✅ CC 完成 | {session_name} | {cwd_basename}
⏱ 耗时 {elapsed}m | 工具调用 {total} 次
```

Warning:
```
⚠️ CC 异常结束 | {session_name} | {cwd_basename}
原因: {stop_reason} | ⏱ 耗时 {elapsed}m
```

Alert:
```
🚨 CC 被中断 | {session_name} | {cwd_basename}
可能原因: SIGTERM/SIGKILL/Gateway 崩溃
⏱ 已运行 {elapsed}m | 工具调用 {total} 次
```

6. **Cleanup**: Delete `sessions/{name}.json` and `sessions/{name}.heartbeat`.

7. **Orphan scan**: After handling current session, scan `sessions/` directory. For each remaining `.json` file, check if pid is alive (`kill -0 $pid`). If dead, send alert and clean up.

## Component 3: superclaw active session tracking

### Changes to superclaw.mjs

Add a `writeActiveSession(opts, childPid)` function:

```javascript
function writeActiveSession(opts, childPid) {
  const sessionsDir = resolve(homedir(), ".superclaw", "state", "sessions");
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
```

Add a `removeActiveSession(opts, childPid)` function to delete the file on exit.

**Call sites:**
- `cmdExec`: after `spawnObserved`, write with child.pid. Remove in finally block.
- `cmdSessionStart`: after spawn, write. Remove after process.exit.
- `cmdSessionContinue`: same pattern.

## Testing

### Unit tests (bash)

- `tests/hooks/test-progress-heartbeat.sh`:
  - Verify heartbeat skips when interval not elapsed
  - Verify heartbeat sends when interval elapsed
  - Verify per-session independent throttling
  - Verify message format includes session_name and cwd

- `tests/hooks/test-notify-abnormal.sh`:
  - Verify normal exit produces ✅ message
  - Verify abnormal stop_reason produces ⚠️ message
  - Verify missing stop_reason produces 🚨 message
  - Verify orphan detection finds dead pids

### Integration test

- `tests/e2e/test-heartbeat-e2e.sh`:
  - Start superclaw with a short task
  - Verify active_session.json created
  - Verify tool_log.jsonl populated
  - Kill CC, verify orphan detected

## Files changed

| File | Change |
|---|---|
| `hooks/superclaw-progress.sh` | Add heartbeat throttle + Feishu send |
| `hooks/superclaw-notify.sh` | Add exit classification + orphan scan |
| `cli/superclaw.mjs` | Add writeActiveSession/removeActiveSession |
| `scripts/install.sh` | Fix hook dedup detection (already done) |

## Not in scope

- Web UI progress display
- Model-generated summaries
- Custom heartbeat intervals per session
- Historical heartbeat data persistence (beyond tool_log.jsonl)
