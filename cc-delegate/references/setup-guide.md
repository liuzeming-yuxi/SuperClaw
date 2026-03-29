# cc-delegate Setup Guide

## Prerequisites

- Linux server with root access
- Node.js 18+
- Claude Code CLI (`curl -fsSL https://claude.ai/install.sh | bash`)
- An Anthropic API key or compatible proxy

## How It Works

cc-delegate runs as **root** with `IS_SANDBOX=1` environment variable set. This bypasses Claude Code's
built-in root restriction. The wrapper uses `--approve-all --auth-policy fail --non-interactive-permissions fail`
flags with acpx to auto-approve all tool calls without interactive prompts.

## Quick Setup (Automated)

```bash
# As root:
bash skills/cc-delegate/scripts/setup.sh
```

This installs the wrapper to `/root/cc-delegate/` and generates a `.env` template.

Then edit the `.env`:
```bash
nano /root/cc-delegate/.env
```

Fill in:
- `ANTHROPIC_BASE_URL` — your API endpoint
- `ANTHROPIC_AUTH_TOKEN` — your API key

## Custom Install Path

```bash
CC_DELEGATE_DIR=/opt/cc-delegate bash skills/cc-delegate/scripts/setup.sh
```

## Manual Setup

1. Create the install directory:
   ```bash
   mkdir -p /root/cc-delegate/state
   ```

2. Copy `cc-delegate.mjs` to `/root/cc-delegate/`:
   ```bash
   cp cc-delegate/cc-delegate.mjs /root/cc-delegate/
   chmod +x /root/cc-delegate/cc-delegate.mjs
   ```

3. Create `/root/cc-delegate/.env`:
   ```
   ANTHROPIC_BASE_URL=https://api.anthropic.com
   ANTHROPIC_AUTH_TOKEN=sk-your-token-here
   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
   ```

4. Set permissions:
   ```bash
   chmod 600 /root/cc-delegate/.env
   ```

## Why IS_SANDBOX=1?

Claude Code refuses to run as root by default (security restriction). Setting `IS_SANDBOX=1`
tells Claude Code it's running inside a sandboxed environment where root is expected and safe.
The wrapper sets this automatically via `prepareInvocationEnv()`.

This is simpler than the previous approach of creating a separate non-root user and switching
via `su`, and avoids permission issues with project directories.

## Verifying

```bash
# Should show status:
node /root/cc-delegate/cc-delegate.mjs status

# Smoke test (should create a file):
mkdir -p /tmp/cc-test
node /root/cc-delegate/cc-delegate.mjs exec --cwd /tmp/cc-test --prompt "Create hello.txt with content: it works"
cat /tmp/cc-test/hello.txt
```

## Proxy / Custom Endpoint

If using a proxy (like alphacat), set `ANTHROPIC_BASE_URL` to your proxy URL.

If your Claude Code binary needs a startup-check patch (for proxied setups where `api.anthropic.com` is unreachable), see the Claude Code community docs for binary patching guidance.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Not logged in" | `.env` not loaded | Check `.env` exists and has correct token |
| "Authentication required" | Token invalid | Verify `ANTHROPIC_AUTH_TOKEN` value |
| "Neither acpx nor npx" | Node.js not in PATH | Ensure node is installed and in PATH |
| Claude Code refuses root | IS_SANDBOX not set | The wrapper sets this automatically; check `prepareInvocationEnv()` |
