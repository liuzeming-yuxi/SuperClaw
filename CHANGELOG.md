# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-04-08
## [0.1.3] - 2026-04-09

### Added

- **`superclaw claude`**: Pure pass-through to claude with `.env` loading + `IS_SANDBOX=1`. Replaces complex session resume logic
- **`superclaw rm` supports multiple names**: `superclaw rm foo bar baz`

### Changed

- **Flat command structure**: Removed `session` subcommand layer entirely
  - `exec` → `run`, `session start` → `start`, `session continue` → `send`
  - `session show` → `show`, `session list/ps` → `ps`, `session stop` → `stop`
  - `session delete` → `rm`, `session clean` → `clean`
  - `--name` replaced by positional argument
- **Removed `CLAUDE_CONFIG_DIR` override**: Sessions now write to native `~/.claude/`, making `claude --resume` work natively
- **Model pinning via `--model` flag** instead of custom config directory

### Removed

- `session resume` command (use `superclaw claude --resume`)
- `session list` command (merged into `ps`)
- `CLAUDE_CONFIG_DIR` bootstrap / `pruneConfigOverrides` / Opus guardrail
- `buildConfigOverride` and related hashing logic


### Added

- **`superclaw doctor`**: 34-item health check across 5 categories with `--fix` auto-repair and `--verbose` output

### Fixed

- **Dual state directory bug**: setsid re-exec resolved symlink to repo source, creating rogue `cli/state/` alongside `bin/state/`. Fixed by preserving original `process.argv[1]` path
- **isPidOurs false stale detection**: Widened tolerance from 2s symmetric to 120s directional — process always starts before `writeActiveSession` records `start_time`
- **`ensureEnv` blocking doctor/version**: These commands now skip `.env` validation so they can run diagnostically even when `.env` is misconfigured

## [0.1.1] - 2026-04-08

- **`superclaw doctor`**: 34-item health check across 5 categories (prerequisites, installation, configuration, runtime, connectivity) with `--fix` auto-repair and `--verbose` detailed output
- **`superclaw version`**: Show installed vs repo version with drift detection
- **`superclaw update [--check]`**: Pull latest repo changes and reinstall
- **`superclaw session ps`**: Real-time process status table for all sessions
- **`superclaw session stop`**: Stop running sessions by name with PID identity verification
- **`superclaw session clean`**: Clean stale session tracking files
- **SECURITY.md**: Vulnerability reporting policy via GitHub Security Advisories
- **.editorconfig** and **.nvmrc**: Editor consistency and Node version pinning

### Changed

- **Unified installer**: Merged `install.sh` + `setup.sh` into single idempotent all-symlink installer
- **Renamed `cc-delegate` → `superclaw`**: CLI command, directory (`cc-delegate/` → `cli/`), all 30 files updated
- **Version management**: `~/.superclaw/installed.json` tracks installed version/commit
- **README restructured**: Quick Start points agents to INSTALL.md, humans to OpenClaw
- **INSTALL.md rewritten**: Pure agent-facing operational guide

### Fixed

- **Symlink .env resolution**: `SCRIPT_DIR` now uses install path (not repo source) for .env and state/
- **PID reuse safety**: `isPidOurs()` verifies process start time via `/proc/<pid>/stat`
- **Hardcoded credentials removed**: board-server token and IP moved to environment variables

### Security

- Removed hardcoded `OpenClawToken` from `board-server/cmd/server/main.go`
- Removed hardcoded internal IP `192.168.16.30` from CORS AllowedOrigins

## [0.1.0] - 2026-03-28

### Added

- **DESIGN.md**: Complete design document (10 chapters, 42KB) covering architecture, workflow, skill design, hook design, and borrowing sources
- **5 OpenClaw Skills**: align (product alignment), plan (technical alignment), execute (Claude Code orchestration), verify (independent acceptance), deliver (human handoff)
- **superclaw**: Bridge layer for OpenClaw → Claude Code communication (679-line Node.js wrapper with user switching, env injection, session management)
- **Hook system**: Claude Code native hooks for automatic notifications (Stop → Feishu notify, PostToolUse → progress logging)
- **INSTALL.md**: Agent-readable installation guide (5 parts, verification steps, troubleshooting)
- **Superpowers integration**: Claude Code side directly uses Superpowers plugin (11 skills, 3 prompt templates, 1 agent, 1 hook)
- **Three-level acceptance**: L1 Claude Code self-review → L2 OpenClaw independent verify → L3 Human final approval
