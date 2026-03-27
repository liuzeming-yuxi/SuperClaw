---
name: cc-delegate
description: |
  Delegate coding tasks to Claude Code via ACPX from OpenClaw. Runs Claude Code as a non-root
  user with full file-write permissions, Opus model support, and persistent named sessions.

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

Then edit `/home/ccdelegate/cc-delegate/.env` with API credentials.
See `references/setup-guide.md` for details or manual setup.

## Configuration

The delegate user name defaults to `ccdelegate`. Override with `CC_DELEGATE_USER` env var during setup.

The wrapper script lives at `/home/<user>/cc-delegate/cc-delegate.mjs`.
Adjust the path below if your delegate user differs.

## Commands

All commands auto-switch from root to the delegate user. Run via `exec`.

### One-shot task (exec)

```bash
node /home/<user>/cc-delegate/cc-delegate.mjs exec \
  --cwd /path/to/project \
  --prompt "your coding task description"
```

Default model is `opus`. Override with `--model sonnet`.

### Start a named session

```bash
node /home/<user>/cc-delegate/cc-delegate.mjs session start \
  --name my-session \
  --cwd /path/to/project \
  --prompt "initial task"
```

Creates a persistent ACPX session. The wrapper bootstraps `CLAUDE_CONFIG_DIR` to pin the model
and records the session in a local manifest for tracking.

### Continue a session

```bash
node /home/<user>/cc-delegate/cc-delegate.mjs session continue \
  --name my-session \
  --cwd /path/to/project \
  --prompt "next task"
```

Resumes the named session. For Opus sessions, the wrapper enforces a guardrail: only sessions
originally created through the wrapper can be continued (prevents model drift).

### List sessions

```bash
node /home/<user>/cc-delegate/cc-delegate.mjs session list
```

### Check status

```bash
node /home/<user>/cc-delegate/cc-delegate.mjs status
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

## Architecture

```
OpenClaw (root) → exec node cc-delegate.mjs ...
  → detects root, re-execs as delegate user via su
    → loads .env, injects ANTHROPIC_* vars
      → resolves acpx (local or npx fallback)
        → acpx claude exec/session → Claude Code
```

Key behaviors:
- **Auto user-switch**: Detects root and re-execs as the delegate user
- **Env injection**: Reads `.env` file, exports vars into the subprocess
- **Model pinning**: For sessions, creates a per-scope `CLAUDE_CONFIG_DIR` with `settings.json`
- **Session tracking**: Maintains `state/sessions.json` manifest mapping session names to ACPX IDs
- **Opus guardrail**: Prevents session continue on non-wrapper-tracked sessions (avoids model drift)
- **Auto-retry**: If Claude session reports reconnect, retries the prompt once
- **`--approve-all`**: All tool calls are auto-approved (no interactive prompts)
