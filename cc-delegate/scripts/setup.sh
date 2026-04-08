#!/usr/bin/env bash
# cc-delegate setup script
# Installs the wrapper and generates .env template.
# Runs as root — cc-delegate uses IS_SANDBOX=1 for yolo mode (no user switching needed).
set -euo pipefail

INSTALL_DIR="${CC_DELEGATE_DIR:-/root/.openclaw/workspace/bin}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

info()  { printf '\033[1;34m[cc-delegate]\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m[✓]\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m[!]\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m[✗]\033[0m %s\n' "$1"; exit 1; }

# ─── Pre-checks ──────────────────────────────────────────────────────────────

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install Node.js 18+ first."

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
[[ $NODE_MAJOR -ge 18 ]] || fail "Node.js 18+ required (found $(node -v))."

info "Setting up cc-delegate at ${INSTALL_DIR}"

# ─── Install wrapper ─────────────────────────────────────────────────────────

mkdir -p "${INSTALL_DIR}/state"
cp "${SCRIPT_DIR}/../cc-delegate.mjs" "${INSTALL_DIR}/cc-delegate.mjs"
chmod +x "${INSTALL_DIR}/cc-delegate.mjs"

# Create wrapper script for short command name
WRAPPER="/usr/local/bin/cc-delegate"
cat > "$WRAPPER" << WRAPEOF
#!/bin/bash
exec node "${INSTALL_DIR}/cc-delegate.mjs" "\$@"
WRAPEOF
chmod +x "$WRAPPER"
ok "Created wrapper: cc-delegate → ${INSTALL_DIR}/cc-delegate.mjs"

# ─── Generate .env template ──────────────────────────────────────────────────

ENV_FILE="${INSTALL_DIR}/.env"
if [[ -f "${ENV_FILE}" ]]; then
  warn ".env already exists at ${ENV_FILE} — not overwriting"
else
  cat > "${ENV_FILE}" << 'ENVEOF'
# Claude Code environment variables
# Fill in your values and save.

# API endpoint (your proxy or https://api.anthropic.com)
ANTHROPIC_BASE_URL=https://api.anthropic.com

# API key or auth token
ANTHROPIC_AUTH_TOKEN=sk-your-token-here

# Disable non-essential traffic (recommended for proxied setups)
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
ENVEOF
  ok "Created .env template at ${ENV_FILE}"
  warn "⚠️  Edit ${ENV_FILE} and fill in your ANTHROPIC_AUTH_TOKEN before use!"
fi

chmod 600 "${ENV_FILE}"
ok "Permissions set (${ENV_FILE} is 600)"

# ─── Install Claude Code if missing ──────────────────────────────────────────

if command -v claude &>/dev/null; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
  ok "Claude Code already installed (${CLAUDE_VERSION})"
else
  info "Installing Claude Code..."
  INSTALLER="$(mktemp)"
  trap 'rm -f "$INSTALLER"' EXIT
  HTTP_CODE=$(curl -fsSL -w '%{http_code}' -o "$INSTALLER" https://claude.ai/install.sh)
  if [[ "$HTTP_CODE" != "200" ]] || [[ ! -s "$INSTALLER" ]]; then
    rm -f "$INSTALLER"
    fail "Failed to download Claude Code installer (HTTP ${HTTP_CODE})"
  fi
  # Sanity check: installer should be a shell script
  if ! head -1 "$INSTALLER" | grep -qE '^#!/'; then
    rm -f "$INSTALLER"
    fail "Downloaded installer does not look like a shell script — aborting"
  fi
  bash "$INSTALLER"
  rm -f "$INSTALLER"
  ok "Claude Code installed"
fi

# ─── Verify ──────────────────────────────────────────────────────────────────

info ""
info "Setup complete! Summary:"
info "  Wrapper:  ${INSTALL_DIR}/cc-delegate.mjs"
info "  Config:   ${INSTALL_DIR}/.env"
info "  State:    ${INSTALL_DIR}/state/"
info ""
info "Next steps:"
info "  1. Edit ${ENV_FILE} with your API credentials"
info "  2. Test: node ${INSTALL_DIR}/cc-delegate.mjs status"
info "  3. Smoke test: node ${INSTALL_DIR}/cc-delegate.mjs exec --prompt 'Reply with OK'"
info ""
