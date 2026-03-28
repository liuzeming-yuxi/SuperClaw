# cc-delegate Setup Guide

## Prerequisites

- Linux server with root access
- Node.js 18+
- Claude Code CLI (`curl -fsSL https://claude.ai/install.sh | bash`)
- An Anthropic API key or compatible proxy

## Quick Setup (Automated)

```bash
# As root:
sudo bash skills/cc-delegate/scripts/setup.sh
```

This creates a `ccdelegate` user, installs the wrapper, and generates a `.env` template.

Then edit the `.env`:
```bash
sudo nano /home/ccdelegate/cc-delegate/.env
```

Fill in:
- `ANTHROPIC_BASE_URL` — your API endpoint
- `ANTHROPIC_AUTH_TOKEN` — your API key

## Custom User Name

```bash
CC_DELEGATE_USER=myagent sudo bash skills/cc-delegate/scripts/setup.sh
```

## Manual Setup

1. Create a non-root user:
   ```bash
   useradd -m -s /bin/bash ccdelegate
   ```

2. Ensure `node`, `npm`, `npx`, and `claude` are in the user's PATH.

3. Copy `scripts/cc-delegate.mjs` to `/home/ccdelegate/cc-delegate/`:
   ```bash
   mkdir -p /home/ccdelegate/cc-delegate/state
   cp scripts/cc-delegate.mjs /home/ccdelegate/cc-delegate/
   chmod +x /home/ccdelegate/cc-delegate/cc-delegate.mjs
   ```

4. Create `/home/ccdelegate/cc-delegate/.env`:
   ```
   ANTHROPIC_BASE_URL=https://api.anthropic.com
   ANTHROPIC_AUTH_TOKEN=sk-your-token-here
   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
   ```

5. Set permissions:
   ```bash
   chown -R ccdelegate:ccdelegate /home/ccdelegate/cc-delegate
   chmod 600 /home/ccdelegate/cc-delegate/.env
   ```

## Why a Separate User?

Claude Code refuses `--permission-mode bypassPermissions` when running as root (security restriction). A non-root delegate user solves this while keeping the main agent (OpenClaw) running as root.

The wrapper automatically detects root and re-execs as the delegate user via `su`.

## Verifying

```bash
# Should auto-switch to delegate user and show status:
node /home/ccdelegate/cc-delegate/cc-delegate.mjs status

# Smoke test (should create a file):
mkdir -p /home/ccdelegate/test && chown ccdelegate:ccdelegate /home/ccdelegate/test
node /home/ccdelegate/cc-delegate/cc-delegate.mjs exec --cwd /home/ccdelegate/test --prompt "Create hello.txt with content: it works"
cat /home/ccdelegate/test/hello.txt
```

## Proxy / Custom Endpoint

If using a proxy (like alphacat), set `ANTHROPIC_BASE_URL` to your proxy URL.

If your Claude Code binary needs a startup-check patch (for proxied setups where `api.anthropic.com` is unreachable), see the Claude Code community docs for binary patching guidance.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Not logged in" | `.env` not loaded | Check `.env` exists and has correct token |
| "Authentication required" | Token invalid | Verify `ANTHROPIC_AUTH_TOKEN` value |
| "Neither acpx nor npx" | Node.js not in PATH | Add node to delegate user's PATH |
| Root auto-switch fails | `su` not available | Install `su` or run directly as delegate user |
