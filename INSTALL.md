# SuperClaw Installation Guide

> This document is for **Agents** (OpenClaw, Claude Code, or any automated installer).
> Follow the steps in order. Every command is copy-pasteable.

## Prerequisites

| Dependency | Min Version | Check |
|---|---|---|
| Node.js | 18+ | `node --version` |
| jq | any | `jq --version` |
| git | any | `git --version` |
| Claude Code | 2.x+ | `claude --version` |
| OpenClaw | any | `openclaw --version` |

Missing something?
- jq: `apt install jq` / `brew install jq`
- Claude Code: `curl -fsSL https://claude.ai/install.sh | bash`

## Install

```bash
git clone https://github.com/liuzeming-yuxi/SuperClaw.git
cd SuperClaw
sudo bash scripts/install.sh
```

The installer is idempotent — re-running it is safe and acts as an update.

What it does:
1. Symlinks OpenClaw skills (align, plan, execute, verify, deliver)
2. Symlinks Claude Code hooks (progress + stop notifications)
3. Symlinks `superclaw` CLI to PATH
4. Generates `.env` template (if not exists)
5. Writes version stamp to `~/.superclaw/installed.json`

### Options

```bash
bash scripts/install.sh --skip-hooks   # Skip Claude Code hook configuration
bash scripts/install.sh --dry-run      # Preview only, no changes
bash scripts/install.sh --repo-dir /custom/path  # Non-standard repo location
```

## Configure

### 1. API credentials (required)

Edit `/root/.openclaw/workspace/bin/.env`:

```ini
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_AUTH_TOKEN=sk-your-token-here
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

All three variables are required.

### 2. Feishu notifications (optional)

```bash
export SUPERCLAW_FEISHU_TARGET="ou_your_open_id"
```

### 3. Superpowers plugin (required)

```bash
claude /plugin install superpowers@claude-plugins-official
```

## Verify

```bash
# Full test suite
bash tests/run-all.sh

# Or quick check
superclaw version
superclaw status
bash tests/install/verify-install.sh
```

## Update

```bash
superclaw update --check   # Preview available updates
superclaw update           # Pull latest + reinstall
```

Or manually:

```bash
cd /path/to/SuperClaw
git pull origin main
sudo bash scripts/install.sh
```

## Troubleshoot

| Symptom | Check |
|---|---|
| OpenClaw doesn't recognize superclaw skill | `ls ~/.openclaw/workspace/skills/superclaw/SKILL.md` |
| Broken symlinks | `bash tests/install/verify-install.sh` |
| Hooks not firing | `jq '.hooks' ~/.claude/settings.json` |
| No Feishu notifications | `echo $SUPERCLAW_FEISHU_TARGET` — must be set |
| superclaw command not found | `which superclaw` — should be `/usr/local/bin/superclaw` |
| superclaw fails to run | `superclaw version` — shows installed vs repo version |
| Claude Code permission error | Confirm `IS_SANDBOX=1` is set (installer handles this) |
| Version mismatch | `superclaw update` to sync |

## Uninstall

```bash
# Remove skills
rm -rf ~/.openclaw/workspace/skills/superclaw
rm -rf ~/.openclaw/workspace/skills/superclaw-cli

# Remove hooks and state
rm -rf ~/.superclaw

# Remove CLI
rm -f /usr/local/bin/superclaw
rm -f /root/.openclaw/workspace/bin/superclaw.mjs

# Remove hook config from Claude Code (manual edit)
# jq 'del(.hooks.Stop[] | select(.hooks[].command | contains("superclaw")))' ~/.claude/settings.json
```
