---
name: cc-delegate
description: |
  Delegate coding tasks to Claude Code via ACPX from OpenClaw. Runs Claude Code as root with
  IS_SANDBOX=1 bypass, full file-write permissions, Opus model support, and persistent named sessions.

  Use when:
  (1) The user asks to write, review, or refactor code in a project directory
  (2) The user wants a persistent coding session ("start a session", "continue working on X")
  (3) Multi-file code generation or editing is needed
  (4) The user says "use Claude Code", "code this", "write code for", "build", "implement"
  (5) Complex coding tasks that benefit from Claude Code's tool-use (file read/write/edit, terminal)

  Not for: simple one-line edits (use the edit tool directly), reading files (use read tool),
  non-coding tasks, or tasks that don't need file system access.
---

# cc-delegate

Delegate coding tasks to Claude Code via ACPX. The wrapper handles user switching, env injection,
session management, and Opus model pinning automatically.

## Setup

First-time setup required. Run as root:

```bash
bash <skill-dir>/scripts/setup.sh
```

Then edit `/root/cc-delegate/.env` with API credentials.
See `references/setup-guide.md` for details or manual setup.

## Configuration

The wrapper runs as root with `IS_SANDBOX=1` to bypass Claude Code's root restriction.
The wrapper script lives at `/root/cc-delegate/cc-delegate.mjs` by default.
Override the install path with `CC_DELEGATE_DIR` env var during setup.

## Commands

All commands run as root with IS_SANDBOX=1. Run via `exec`.

### One-shot task (exec)

```bash
node /root/cc-delegate/cc-delegate.mjs exec \
  --cwd /path/to/project \
  --prompt "your coding task description"
```

Default model is `opus`. Override with `--model sonnet`.

### Start a named session

```bash
node /root/cc-delegate/cc-delegate.mjs session start \
  --name my-session \
  --cwd /path/to/project \
  --prompt "initial task"
```

Creates a persistent ACPX session. The wrapper bootstraps `CLAUDE_CONFIG_DIR` to pin the model
and records the session in a local manifest for tracking.

### Continue a session

```bash
node /root/cc-delegate/cc-delegate.mjs session continue \
  --name my-session \
  --cwd /path/to/project \
  --prompt "next task"
```

Resumes the named session. For Opus sessions, the wrapper enforces a guardrail: only sessions
originally created through the wrapper can be continued (prevents model drift).

### List sessions

```bash
node /root/cc-delegate/cc-delegate.mjs session list
```

### Show session context

View the full conversation history of a session in Markdown format:

```bash
node /root/cc-delegate/cc-delegate.mjs session show \
  --name my-session \
  --cwd /path/to/project
```

Show only the last N turns:

```bash
node /root/cc-delegate/cc-delegate.mjs session show \
  --name my-session \
  --cwd /path/to/project \
  --last 5
```

### Check status

```bash
node /root/cc-delegate/cc-delegate.mjs status
```

## Workflow

1. **Identify** the task as a coding task requiring file operations
2. **Determine** if it's one-shot (`exec`) or part of ongoing work (`session start/continue`)
3. **Set `--cwd`** to the project directory (important — Claude Code operates relative to this)
4. **Write the prompt** describing the task clearly
5. **Run** the command via `exec` tool
6. **Report** the result back to the user

For session workflows:
- Use `session start` for new projects or new feature branches
- Use `session continue` for follow-up tasks in the same context
- Session names should be descriptive: `nexus-billing`, `pivot-api`, `frontend-refactor`

## Options Reference

| Flag | Default | Description |
|---|---|---|
| `--cwd <path>` | current dir | Working directory for Claude Code |
| `--model <id>` | `opus` | Model: `opus` or `sonnet` |
| `--format <fmt>` | `text` | Output: `text`, `json`, or `quiet` |
| `--max-turns <n>` | (none) | Limit conversation turns |
| `--timeout <sec>` | (none) | Timeout in seconds |
| `--name <name>` | (required for session) | Session name |
| `--file <path>` | (none) | Read prompt from file instead of `--prompt` |
| `--last <N>` | (all) | Show only last N turns (for `session show`) |

## Architecture

```
OpenClaw (root) → exec node cc-delegate.mjs ...
  → sets IS_SANDBOX=1 (bypasses Claude Code root restriction)
    → loads .env, injects ANTHROPIC_* vars
      → resolves acpx (local or npx fallback)
        → acpx --approve-all claude exec/session → Claude Code
```

Key behaviors:
- **Root + IS_SANDBOX=1**: Runs as root, bypasses Claude Code's root restriction via IS_SANDBOX=1
- **Env injection**: Reads `.env` file, exports vars into the subprocess
- **Model pinning**: For sessions, creates a per-scope `CLAUDE_CONFIG_DIR` with `settings.json`
- **Session tracking**: Maintains `state/sessions.json` manifest mapping session names to ACPX IDs
- **Opus guardrail**: Prevents session continue on non-wrapper-tracked sessions (avoids model drift)
- **Auto-retry**: If Claude session reports reconnect, retries the prompt once
- **`--approve-all`**: All tool calls are auto-approved (no interactive prompts)
- **Process isolation**: Automatically re-execs under `setsid` for exec/session commands, creating an independent session group that survives Gateway restarts
- **Signal forwarding**: On SIGTERM/SIGINT, forwards signal to child process groups for graceful shutdown

## Long-Running Task Guidelines

CC tasks (especially Opus with large codebases) can run 10-40 minutes. Follow these rules to prevent process death:

### CRITICAL: exec timeout

When calling cc-delegate via the `exec` tool, you **MUST** set a sufficient timeout:

```bash
# BAD — default 5s timeout will kill cc-delegate immediately
exec: node /root/cc-delegate/cc-delegate.mjs exec --prompt "..."

# GOOD — set exec timeout to match --timeout
exec timeout=2400: node /root/cc-delegate/cc-delegate.mjs exec --timeout 2400 --prompt "..."
```

The `exec` tool timeout and cc-delegate's `--timeout` are DIFFERENT things:
- `exec timeout=N` — how long OpenClaw waits for the command to finish
- `--timeout N` — how long CC is allowed to run

**Both must be set, and exec timeout should be >= --timeout.**

### Recommended exec patterns

**Short tasks (< 5 min):**
```bash
exec timeout=300: node /root/cc-delegate/cc-delegate.mjs exec \
  --cwd /path/to/project --model sonnet --timeout 300 \
  --prompt "simple task"
```

**Long tasks (5-40 min):**
```bash
exec timeout=2400: node /root/cc-delegate/cc-delegate.mjs exec \
  --cwd /path/to/project --model opus --timeout 2400 \
  --prompt "complex task"
```

**Very long tasks (> 40 min) — fire and forget:**
```bash
exec timeout=10: setsid node /root/cc-delegate/cc-delegate.mjs exec \
  --cwd /path/to/project --model opus --timeout 7200 \
  --file /tmp/prompt.md > /tmp/cc-output.log 2>&1 &
echo "CC started, PID=$!"
```
Then poll the output periodically:
```bash
exec timeout=5: tail -20 /tmp/cc-output.log
```

### Monitoring running CC tasks

Check if CC is still alive:
```bash
exec timeout=5: pgrep -fa "cc-delegate\|acpx\|claude" | head -10
```

Check recent tool activity:
```bash
exec timeout=5: tail -5 ~/.superclaw/state/tool_log.jsonl
```

View session context after completion:
```bash
exec timeout=30: node /root/cc-delegate/cc-delegate.mjs session show \
  --name my-session --cwd /path/to/project --last 5
```

## Known Issue: Gateway crash on /stop during CC execution

**Symptom**: When the user runs `/stop` or `/new` while cc-delegate is executing, the Gateway crashes with:

```
Unhandled promise rejection: Error: Agent listener invoked outside active run
    at Agent.processEvents (pi-agent-core/src/agent.ts:533:10)
```

**Root cause**: OpenClaw's exec supervisor does not detach the stdout listener when the agent run is aborted. When cc-delegate continues to output to stdout after the run ends, the stale listener triggers `processEvents` which throws because the run is no longer active. This unhandled rejection crashes the Gateway, and systemd sends SIGTERM to the entire cgroup.

**Mitigation (cc-delegate side)**:
- cc-delegate auto-re-execs under `setsid`, creating an independent session group
- Child processes spawned with `detached: true`
- These prevent Gateway's SIGTERM from killing the CC process tree

**Root fix needed (OpenClaw side)**:
- `exec-defaults`: detach stdout/stderr listener when agent run is aborted
- Or: `Agent.processEvents` should guard against calls outside active run (ignore instead of throw)
- Reference: `pi-agent-core/src/agent.ts:533`
