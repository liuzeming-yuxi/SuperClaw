#!/usr/bin/env bash
# cc-delegate setup script
# Creates a non-root delegate user, installs the wrapper, and generates .env template.
# Run as root on the target machine.
set -euo pipefail

DELEGATE_USER="${CC_DELEGATE_USER:-ccdelegate}"
INSTALL_DIR="/home/${DELEGATE_USER}/cc-delegate"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

info()  { printf '\033[1;34m[cc-delegate]\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m[✓]\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m[!]\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m[✗]\033[0m %s\n' "$1"; exit 1; }

# ─── Pre-checks ──────────────────────────────────────────────────────────────

[[ $EUID -eq 0 ]] || fail "Run this script as root."
command -v node >/dev/null 2>&1 || fail "Node.js not found. Install Node.js 18+ first."

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
[[ $NODE_MAJOR -ge 18 ]] || fail "Node.js 18+ required (found $(node -v))."

info "Setting up cc-delegate for user: ${DELEGATE_USER}"

# ─── Create user ──────────────────────────────────────────────────────────────

if id "${DELEGATE_USER}" &>/dev/null; then
  ok "User ${DELEGATE_USER} already exists"
else
  useradd -m -s /bin/bash "${DELEGATE_USER}"
  ok "Created user ${DELEGATE_USER}"
fi

# ─── Ensure node/npm/npx are accessible ──────────────────────────────────────

NODE_BIN=$(dirname "$(which node)")
PROFILE="/home/${DELEGATE_USER}/.profile"

if ! su - "${DELEGATE_USER}" -c "which node" &>/dev/null; then
  # Add node to PATH in profile
  echo "export PATH=\"${NODE_BIN}:\$PATH\"" >> "${PROFILE}"
  ok "Added node to ${DELEGATE_USER}'s PATH"
else
  ok "Node.js accessible for ${DELEGATE_USER}"
fi

# ─── Install wrapper ─────────────────────────────────────────────────────────

mkdir -p "${INSTALL_DIR}/state"
cp "${SCRIPT_DIR}/cc-delegate.mjs" "${INSTALL_DIR}/cc-delegate.mjs"
chmod +x "${INSTALL_DIR}/cc-delegate.mjs"

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

# ─── Set permissions ─────────────────────────────────────────────────────────

chown -R "${DELEGATE_USER}:${DELEGATE_USER}" "${INSTALL_DIR}"
chmod 600 "${ENV_FILE}"

ok "Permissions set (${ENV_FILE} is 600)"

# ─── Install Claude Code if missing ──────────────────────────────────────────

if su - "${DELEGATE_USER}" -c "which claude" &>/dev/null; then
  CLAUDE_VERSION=$(su - "${DELEGATE_USER}" -c "claude --version 2>/dev/null" || echo "unknown")
  ok "Claude Code already installed (${CLAUDE_VERSION})"
else
  info "Installing Claude Code..."
  npm install -g @anthropic-ai/claude-code@latest
  ok "Claude Code installed"
fi

# ─── Verify ──────────────────────────────────────────────────────────────────

info ""
info "Setup complete! Summary:"
info "  User:     ${DELEGATE_USER}"
info "  Wrapper:  ${INSTALL_DIR}/cc-delegate.mjs"
info "  Config:   ${INSTALL_DIR}/.env"
info "  State:    ${INSTALL_DIR}/state/"
info ""
info "Next steps:"
info "  1. Edit ${ENV_FILE} with your API credentials"
info "  2. Test: node ${INSTALL_DIR}/cc-delegate.mjs status"
info "  3. Smoke test: node ${INSTALL_DIR}/cc-delegate.mjs exec --prompt 'Reply with OK'"
info ""
