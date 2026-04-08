# Unified Install & Version Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split install system (install.sh + setup.sh, mixed copy/symlink) with a single idempotent installer using all-symlink strategy, add version tracking via `installed.json`, and add `superclaw version` / `superclaw update` CLI commands.

**Architecture:** Merge two install scripts into one `scripts/install.sh` that symlinks everything (hooks, CLI, skills) instead of copying. Version is tracked in `~/.superclaw/installed.json` written at install time. `superclaw.mjs` gains `version` and `update` top-level commands plus a startup drift check.

**Tech Stack:** Bash (installer), Node.js ESM (CLI commands), jq (settings.json manipulation), git (version tracking)

**Spec:** `docs/superpowers/specs/2026-04-08-install-version-mgmt-design.md`

---

### File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `scripts/install.sh` | Rewrite | Unified idempotent installer: preflight, skills symlinks, hooks symlinks, CLI symlink, .env template, settings.json injection, write installed.json |
| `cli/scripts/setup.sh` | Delete | Logic merged into install.sh |
| `cli/superclaw.mjs` | Modify | Add `version` and `update` commands, `checkVersionDrift()`, parseArgs/dispatch changes |
| `tests/install/verify-install.sh` | Rewrite | Verify symlinks (not copies), check installed.json, check version command |
| `cli/SKILL.md` | Modify | Document version/update commands |
| `INSTALL.md` | Modify | Update install/update docs |

---

### Task 1: Rewrite `scripts/install.sh` — unified all-symlink installer

**Files:**
- Rewrite: `scripts/install.sh`
- Delete: `cli/scripts/setup.sh`

- [ ] **Step 1: Write the new `scripts/install.sh`**

```bash
#!/usr/bin/env bash
# SuperClaw unified installer
# Usage: bash scripts/install.sh [options]
#
# First run = install. Re-run = update. Idempotent.
#
# Options:
#   --repo-dir DIR       SuperClaw repo location (default: auto-detect)
#   --skip-hooks         Skip Claude Code hook configuration
#   --dry-run            Print what would be done without doing it
#   --help               Show this help

set -euo pipefail

# ─── Defaults ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="/root/.openclaw/workspace/bin"
SKILL_DIR="${HOME}/.openclaw/workspace/skills/superclaw"
CLI_SKILL_DIR="${HOME}/.openclaw/workspace/skills/superclaw-cli"
HOOKS_DIR="${HOME}/.superclaw/hooks"
STATE_DIR="${HOME}/.superclaw/state"
INSTALLED_JSON="${HOME}/.superclaw/installed.json"
SKIP_HOOKS=false
DRY_RUN=false

# ─── Colors ───────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34m[superclaw]\033[0m %s\n' "$1"; }
ok()    { printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
warn()  { printf '  \033[1;33m⚠️\033[0m  %s\n' "$1"; }
fail()  { printf '  \033[1;31m❌\033[0m %s\n' "$1"; }
step()  { printf '\n\033[1m## %s\033[0m\n\n' "$1"; }

# ─── Args ─────────────────���───────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir)  REPO_DIR="$2"; shift 2 ;;
    --skip-hooks) SKIP_HOOKS=true; shift ;;
    --dry-run)   DRY_RUN=true; shift ;;
    --help)
      head -20 "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

run() {
  if $DRY_RUN; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

cleanup() {
  local settings="${HOME}/.claude/settings.json.tmp"
  [[ -f "$settings" ]] && rm -f "$settings"
}
trap cleanup EXIT

# ─── Preflight ────────────────────────────────────────────────────────────────

step "Preflight checks"

ERRORS=0

if ! command -v node &>/dev/null; then
  fail "Node.js not found in PATH"
  ((ERRORS++)) || true
else
  NODE_VER=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
  if [[ $NODE_MAJOR -ge 18 ]]; then
    ok "Node.js: $NODE_VER"
  else
    fail "Node.js $NODE_VER too old (>= 18 required)"
    ((ERRORS++)) || true
  fi
fi

if ! command -v jq &>/dev/null; then
  fail "jq not found (required by hooks)"
  ((ERRORS++)) || true
else
  ok "jq: $(jq --version 2>/dev/null)"
fi

if ! command -v git &>/dev/null; then
  fail "git not found"
  ((ERRORS++)) || true
else
  ok "git: $(git --version 2>/dev/null | head -1)"
fi

if [[ ! -f "$REPO_DIR/package.json" ]]; then
  fail "SuperClaw repo not found at $REPO_DIR"
  ((ERRORS++)) || true
else
  VERSION=$(jq -r '.version' "$REPO_DIR/package.json")
  COMMIT=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  ok "SuperClaw repo: $REPO_DIR (v$VERSION @ $COMMIT)"
fi

command -v openclaw &>/dev/null && ok "OpenClaw: $(openclaw --version 2>/dev/null || echo 'installed')" || warn "OpenClaw not found (optional for standalone CLI usage)"

if [[ $ERRORS -gt 0 ]]; then
  echo ""
  fail "Preflight failed with $ERRORS error(s). Fix the above issues and re-run."
  exit 1
fi

# ─── Part 1: OpenClaw Skills ─────────────────────────────────────────────────

step "Part 1: OpenClaw Skills"

run mkdir -p "$SKILL_DIR/references"

# Symlink main SKILL.md
if [[ -f "$REPO_DIR/skills/superclaw/SKILL.md" ]]; then
  run ln -sfn "$REPO_DIR/skills/superclaw/SKILL.md" "$SKILL_DIR/SKILL.md"
  ok "Linked: SKILL.md"
else
  # Fallback: generate inline if the file doesn't exist yet
  warn "skills/superclaw/SKILL.md not found — you may need to create it"
fi

# Symlink phase skills
for phase in align plan execute verify deliver; do
  SRC="$REPO_DIR/skills/$phase/SKILL.md"
  DST="$SKILL_DIR/references/$phase.md"
  if [[ -f "$SRC" ]]; then
    run ln -sfn "$SRC" "$DST"
    ok "Linked: $phase"
  else
    warn "Phase skill not found: $SRC"
  fi
done

# Symlink using-superclaw
SRC="$REPO_DIR/skills/using-superclaw/SKILL.md"
DST="$SKILL_DIR/references/using-superclaw.md"
if [[ -f "$SRC" ]]; then
  run ln -sfn "$SRC" "$DST"
  ok "Linked: using-superclaw"
fi

# ─── Part 1b: CLI Skill ──────────────────────────────────────────────────────

run mkdir -p "$CLI_SKILL_DIR/references"

run ln -sfn "$REPO_DIR/cli/SKILL.md" "$CLI_SKILL_DIR/SKILL.md"
ok "Linked: superclaw-cli/SKILL.md"

if [[ -f "$REPO_DIR/cli/references/setup-guide.md" ]]; then
  run ln -sfn "$REPO_DIR/cli/references/setup-guide.md" "$CLI_SKILL_DIR/references/setup-guide.md"
  ok "Linked: superclaw-cli/references/setup-guide.md"
fi

# ─── Part 2: Hooks ───────────────────────────────────────────────────────────

if $SKIP_HOOKS; then
  info "Skipping hooks (--skip-hooks)"
else
  step "Part 2: Claude Code Hooks"

  run mkdir -p "$HOOKS_DIR"
  run mkdir -p "$STATE_DIR"

  for hook in superclaw-notify.sh superclaw-progress.sh; do
    SRC="$REPO_DIR/hooks/$hook"
    DST="$HOOKS_DIR/$hook"
    if [[ -f "$SRC" ]]; then
      run ln -sfn "$SRC" "$DST"
      ok "Linked hook: $hook"
    else
      fail "Hook source not found: $SRC"
    fi
  done

  # Configure Claude Code settings.json
  CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

  if [[ -f "$CLAUDE_SETTINGS" ]]; then
    if ! $DRY_RUN; then
      STOP_EXISTS=$(jq -r '[.hooks.Stop[]?.hooks[]?.command // empty] | map(select(contains("superclaw"))) | length' "$CLAUDE_SETTINGS" 2>/dev/null)
      PTU_EXISTS=$(jq -r '[.hooks.PostToolUse[]?.hooks[]?.command // empty] | map(select(contains("superclaw"))) | length' "$CLAUDE_SETTINGS" 2>/dev/null)
      if [[ "${STOP_EXISTS:-0}" -gt 0 ]] && [[ "${PTU_EXISTS:-0}" -gt 0 ]]; then
        ok "Hooks already configured in settings.json"
      else
        run cp "$CLAUDE_SETTINGS" "${CLAUDE_SETTINGS}.bak.$(date +%s)"
        jq --arg notify "$HOOKS_DIR/superclaw-notify.sh" \
           --arg progress "$HOOKS_DIR/superclaw-progress.sh" \
           '.hooks = (.hooks // {}) |
            .hooks.Stop = ((.hooks.Stop // []) + [{
              "matcher": "",
              "hooks": [{"type": "command", "command": $notify, "timeout": 30}]
            }]) |
            .hooks.PostToolUse = ((.hooks.PostToolUse // []) + [{
              "matcher": "",
              "hooks": [{"type": "command", "command": $progress, "timeout": 10}]
            }])' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp" && \
          mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"
        ok "Configured hooks in settings.json"
      fi
    fi
  else
    warn "Claude Code settings.json not found at $CLAUDE_SETTINGS"
    warn "Run Claude Code once, then re-run this installer"
  fi
fi

# ─── Part 3: CLI ─────────────────────────────────────────────────────────────

step "Part 3: superclaw CLI"

run mkdir -p "$BIN_DIR/state"

# Symlink superclaw.mjs
run ln -sfn "$REPO_DIR/cli/superclaw.mjs" "$BIN_DIR/superclaw.mjs"
ok "Linked: $BIN_DIR/superclaw.mjs → repo/cli/superclaw.mjs"

# Create /usr/local/bin/superclaw wrapper (only regular file — stable entry point)
WRAPPER="/usr/local/bin/superclaw"
if ! $DRY_RUN; then
  cat > "$WRAPPER" << WRAPEOF
#!/bin/bash
exec node "$BIN_DIR/superclaw.mjs" "\$@"
WRAPEOF
  chmod +x "$WRAPPER"
fi
ok "Wrapper: $WRAPPER"

# Generate .env template (never overwrite existing)
ENV_FILE="$BIN_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  ok ".env already exists — not overwriting"
else
  if [[ -f "$REPO_DIR/cli/.env.example" ]]; then
    run cp "$REPO_DIR/cli/.env.example" "$ENV_FILE"
  else
    if ! $DRY_RUN; then
      cat > "$ENV_FILE" << 'ENVEOF'
# Claude Code environment variables — fill in your values

# API endpoint (your proxy or https://api.anthropic.com)
ANTHROPIC_BASE_URL=https://api.anthropic.com

# API key or auth token
ANTHROPIC_AUTH_TOKEN=sk-your-token-here

# Disable non-essential traffic (recommended for proxied setups)
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
ENVEOF
    fi
  fi
  ok "Created .env template at $ENV_FILE"
  warn "Edit $ENV_FILE and fill in your ANTHROPIC_AUTH_TOKEN"
fi
run chmod 600 "$ENV_FILE"

# Install Claude Code if missing
if command -v claude &>/dev/null; then
  ok "Claude Code: $(claude --version 2>/dev/null || echo 'installed')"
else
  warn "Claude Code not found — install from https://claude.ai/install.sh"
fi

# ─── Part 4: Version stamp ───────────────────────────────────────────────────

step "Part 4: Version stamp"

if ! $DRY_RUN; then
  COMMIT_FULL=$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
  COMMIT_SHORT=$(echo "$COMMIT_FULL" | cut -c1-7)
  cat > "$INSTALLED_JSON" << VJEOF
{
  "version": "$VERSION",
  "commit": "$COMMIT_SHORT",
  "commitFull": "$COMMIT_FULL",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "repoPath": "$REPO_DIR",
  "installer": "scripts/install.sh"
}
VJEOF
  ok "Version stamp: v$VERSION ($COMMIT_SHORT)"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

step "Installation complete — superclaw v$VERSION"

echo "  Skills:       $SKILL_DIR"
echo "  CLI Skill:    $CLI_SKILL_DIR"
echo "  CLI Binary:   $BIN_DIR/superclaw.mjs (symlink)"
echo "  Hooks:        $HOOKS_DIR (symlinks)"
echo "  State:        $STATE_DIR"
echo "  Version:      $INSTALLED_JSON"
echo ""

info "Verify: superclaw version"
info "Test:   bash tests/install/verify-install.sh"
echo ""
```

- [ ] **Step 2: Delete `cli/scripts/setup.sh`**

```bash
git rm cli/scripts/setup.sh
```

Keep `cli/scripts/` directory if other files exist there, otherwise remove it too.

- [ ] **Step 3: Run the new installer**

```bash
bash scripts/install.sh
```

Expected: All steps pass, files are symlinks, installed.json is written.

- [ ] **Step 4: Verify symlinks**

```bash
ls -la ~/.superclaw/hooks/superclaw-notify.sh
# → /root/.openclaw/workspace/repos/superclaw/hooks/superclaw-notify.sh

ls -la /root/.openclaw/workspace/bin/superclaw.mjs
# → /root/.openclaw/workspace/repos/superclaw/cli/superclaw.mjs

ls -la ~/.openclaw/workspace/skills/superclaw-cli/SKILL.md
# → /root/.openclaw/workspace/repos/superclaw/cli/SKILL.md

cat ~/.superclaw/installed.json
# { "version": "0.1.0", "commit": "...", ... }
```

- [ ] **Step 5: Verify idempotency — run again**

```bash
bash scripts/install.sh
```

Expected: Same output, no errors, no duplicated hooks in settings.json.

- [ ] **Step 6: Commit**

```bash
git add scripts/install.sh
git rm cli/scripts/setup.sh
git commit -m "refactor(install): unified all-symlink installer with version stamp

Merge install.sh + cli/scripts/setup.sh into single idempotent installer.
All installed files are now symlinks to repo (except /usr/local/bin/superclaw
wrapper and .env). Writes ~/.superclaw/installed.json with version/commit."
```

---

### Task 2: Add `version` and `update` commands to `cli/superclaw.mjs`

**Files:**
- Modify: `cli/superclaw.mjs`

- [ ] **Step 1: Add constants for version management**

At `cli/superclaw.mjs` line 16 (after the existing imports), add:

```js
import { execSync } from "node:child_process";
```

After the existing constants block (after line 29 `BUFFER_MAX_BYTES`), add:

```js
const INSTALLED_JSON_PATH = resolve(homedir(), ".superclaw", "installed.json");
```

Note: `execSync` is already available from `node:child_process` — but the current import only pulls `spawn` and `spawnSync`. Add `execSync` to the existing import.

- [ ] **Step 2: Add `checkVersionDrift()` function**

After the `autoCleanStaleSessions()` function (around line 1000), add:

```js
/** Best-effort version drift check — warns if installed commit differs from repo HEAD. */
let _driftChecked = false;
function checkVersionDrift() {
  if (_driftChecked) return;
  _driftChecked = true;
  try {
    const installed = JSON.parse(readFileSync(INSTALLED_JSON_PATH, "utf8"));
    if (!installed.repoPath || !installed.commitFull) return;
    const head = execSync("git rev-parse HEAD", {
      cwd: installed.repoPath, encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (head !== installed.commitFull) {
      info(`warning: installed (${installed.commit}) != repo (${head.slice(0,7)}). Run 'superclaw update'.`);
    }
  } catch { /* best-effort */ }
}
```

- [ ] **Step 3: Call `checkVersionDrift()` in exec/start/continue**

Add `checkVersionDrift();` call right after each existing `autoCleanStaleSessions();` call in:
- `cmdExec` (around line 1005)
- `cmdSessionStart` (around line 1030)
- `cmdSessionContinue` (around line 1083)

Example for cmdExec:
```js
async function cmdExec(opts, acpx) {
  if (!opts.prompt) fail("exec requires --prompt <text>");
  autoCleanStaleSessions();
  checkVersionDrift();
  // ...
```

- [ ] **Step 4: Add `cmdVersion()` function**

After `cmdSessionClean` (around line 845), add:

```js
async function cmdVersion() {
  // Read installed state
  let installed = null;
  try {
    installed = JSON.parse(readFileSync(INSTALLED_JSON_PATH, "utf8"));
  } catch { /* not installed via installer */ }

  if (installed) {
    const installedDate = installed.installedAt ? installed.installedAt.slice(0, 10) : "unknown";
    console.log(`superclaw v${installed.version} (${installed.commit}, installed ${installedDate})`);
  } else {
    console.log("superclaw (version unknown — not installed via installer)");
  }

  // Read repo state
  try {
    const repoPath = installed?.repoPath || dirname(SCRIPT_DIR);
    const pkgPath = resolve(repoPath, "package.json");
    const repoVersion = JSON.parse(readFileSync(pkgPath, "utf8")).version;
    const repoCommit = execSync("git rev-parse --short HEAD", {
      cwd: repoPath, encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (installed && installed.commitFull) {
      const headFull = execSync("git rev-parse HEAD", {
        cwd: repoPath, encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (headFull === installed.commitFull) {
        console.log(`repo:      v${repoVersion} (${repoCommit}) — up to date`);
      } else {
        const ahead = execSync(`git rev-list ${installed.commitFull}..HEAD --count`, {
          cwd: repoPath, encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        console.log(`repo:      v${repoVersion} (${repoCommit}) — ${ahead} commit(s) ahead, run 'superclaw update'`);
      }
    } else {
      console.log(`repo:      v${repoVersion} (${repoCommit})`);
    }
  } catch {
    console.log("repo:      (not accessible)");
  }
}
```

- [ ] **Step 5: Add `cmdUpdate()` function**

After `cmdVersion`, add:

```js
async function cmdUpdate(opts) {
  // Read installed state
  let installed;
  try {
    installed = JSON.parse(readFileSync(INSTALLED_JSON_PATH, "utf8"));
  } catch {
    fail("Cannot read ~/.superclaw/installed.json. Run 'bash scripts/install.sh' first.");
  }

  const repoPath = installed.repoPath;
  if (!repoPath || !existsSync(resolve(repoPath, "package.json"))) {
    fail(`Repo not found at ${repoPath}. Re-run installer with --repo-dir.`);
  }

  // Fetch remote
  info("Fetching updates...");
  try {
    execSync("git fetch origin main", {
      cwd: repoPath, encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    fail(`git fetch failed: ${e.message}`);
  }

  // Compare
  const localHead = execSync("git rev-parse HEAD", {
    cwd: repoPath, encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  let remoteHead;
  try {
    remoteHead = execSync("git rev-parse origin/main", {
      cwd: repoPath, encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    remoteHead = localHead; // no remote tracking
  }

  if (localHead === remoteHead) {
    const version = JSON.parse(readFileSync(resolve(repoPath, "package.json"), "utf8")).version;
    console.log(`superclaw v${version} (${localHead.slice(0,7)}) — already up to date.`);
    return;
  }

  const ahead = execSync(`git rev-list ${localHead}..${remoteHead} --count`, {
    cwd: repoPath, encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const repoVersion = execSync(`git show ${remoteHead}:package.json`, {
    cwd: repoPath, encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
  });
  const remoteVer = JSON.parse(repoVersion).version;

  if (opts.checkOnly) {
    console.log(`superclaw v${installed.version} (${installed.commit})`);
    console.log(`remote:   v${remoteVer} (${remoteHead.slice(0,7)}) — ${ahead} commit(s) ahead`);
    console.log("");
    // Show recent commits
    const log = execSync(`git log --oneline ${localHead}..${remoteHead} -10`, {
      cwd: repoPath, encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (log) {
      console.log("Recent changes:");
      for (const line of log.split("\n")) console.log(`  ${line}`);
    }
    console.log("\nRun 'superclaw update' to apply.");
    return;
  }

  // Pull and reinstall
  info(`Updating: v${installed.version} → v${remoteVer} (${ahead} commits)...`);
  execSync("git pull origin main", {
    cwd: repoPath, timeout: 60000, stdio: "inherit",
  });

  info("Re-running installer...");
  const installScript = resolve(repoPath, "scripts/install.sh");
  const { status } = spawnSync("bash", [installScript, "--repo-dir", repoPath], { stdio: "inherit" });
  process.exit(status ?? 0);
}
```

- [ ] **Step 6: Update `parseArgs` — add `version` and `update` commands**

In `parseArgs` function, add after the `status` command recognition (around line 614):

```js
    if (arg === "version") {
      opts.command = "version";
      continue;
    }
    if (arg === "update") {
      opts.command = "update";
      continue;
    }
```

Add to opts initialization (around line 586):

```js
    checkOnly: false,     // --check (for update)
```

Add to flag parsing (around line 613):

```js
    if (arg === "--check") { opts.checkOnly = true; continue; }
```

- [ ] **Step 7: Update `printUsage` — add version/update to help text**

After the `superclaw status` line (line 559), add:

```js
    "  superclaw version",
    "  superclaw update [--check]",
```

- [ ] **Step 8: Update `main()` dispatch**

In the `switch (opts.command)` block (around line 1164), add before the `default:` case:

```js
    case "version":
      await cmdVersion();
      break;

    case "update":
      await cmdUpdate(opts);
      break;
```

- [ ] **Step 9: Update `isShortSubcommand`**

Add `"version"` and `"update"` to the short subcommand list (line 1219):

```js
  const isShortSubcommand = process.argv.some(
    (a) => a === "status" || a === "list" || a === "show" || a === "ps" || a === "stop" || a === "clean" || a === "delete" || a === "version" || a === "update"
  );
```

- [ ] **Step 10: Sync to bin and test**

```bash
cp cli/superclaw.mjs /root/.openclaw/workspace/bin/superclaw.mjs
# Wait — after install.sh rewrite, bin/superclaw.mjs is a symlink.
# So just test directly:

superclaw version
superclaw --help
superclaw update --check
```

Expected `superclaw version` output:
```
superclaw v0.1.0 (9c3ec80, installed 2026-04-08)
repo:      v0.1.0 (9c3ec80) — up to date
```

- [ ] **Step 11: Commit**

```bash
git add cli/superclaw.mjs
git commit -m "feat(cli): add version and update commands with drift detection

- 'superclaw version' shows installed vs repo version/commit
- 'superclaw update [--check]' fetches + pulls + re-installs
- Startup drift warning on exec/start/continue when commit mismatch"
```

---

### Task 3: Rewrite `tests/install/verify-install.sh`

**Files:**
- Rewrite: `tests/install/verify-install.sh`

- [ ] **Step 1: Write updated verification script**

```bash
#!/bin/bash
# SuperClaw Installation Verification
# Run after installation to verify everything is set up correctly.
#
# Usage: bash tests/install/verify-install.sh

set -euo pipefail

PASS=0
FAIL=0
WARN=0

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }
warn() { echo "  ⚠️  $1"; ((WARN++)) || true; }

echo "🦞 SuperClaw Installation Verification"
echo "======================================="
echo ""

# ─── Part 1: Prerequisites ───

echo "## Prerequisites"

command -v node &>/dev/null && pass "Node.js: $(node --version)" || fail "Node.js not found"
command -v jq &>/dev/null && pass "jq installed" || fail "jq not found"
command -v git &>/dev/null && pass "git installed" || fail "git not found"
command -v claude &>/dev/null && pass "Claude Code: $(claude --version 2>/dev/null || echo 'installed')" || warn "Claude Code not found"
command -v openclaw &>/dev/null && pass "OpenClaw installed" || warn "OpenClaw not found"

echo ""

# ─── Part 2: Version stamp ───

echo "## Version"

INSTALLED_JSON="${HOME}/.superclaw/installed.json"
if [ -f "$INSTALLED_JSON" ]; then
  VER=$(jq -r '.version' "$INSTALLED_JSON")
  COMMIT=$(jq -r '.commit' "$INSTALLED_JSON")
  pass "installed.json: v$VER ($COMMIT)"
else
  fail "installed.json not found at $INSTALLED_JSON"
fi

echo ""

# ─── Part 3: Symlinks ───

echo "## Symlinks (all installed files should be symlinks)"

check_symlink() {
  local path="$1" label="$2"
  if [ -L "$path" ] && [ -e "$path" ]; then
    pass "$label (symlink OK)"
  elif [ -L "$path" ]; then
    fail "$label (broken symlink)"
  elif [ -f "$path" ]; then
    warn "$label (regular file, should be symlink)"
  else
    fail "$label not found"
  fi
}

# CLI
check_symlink "/root/.openclaw/workspace/bin/superclaw.mjs" "bin/superclaw.mjs"

# Skills
SKILL_DIR="${HOME}/.openclaw/workspace/skills/superclaw"
check_symlink "$SKILL_DIR/SKILL.md" "superclaw/SKILL.md"
for phase in align plan execute verify deliver; do
  check_symlink "$SKILL_DIR/references/${phase}.md" "superclaw/references/${phase}.md"
done

CLI_SKILL_DIR="${HOME}/.openclaw/workspace/skills/superclaw-cli"
check_symlink "$CLI_SKILL_DIR/SKILL.md" "superclaw-cli/SKILL.md"

# Hooks
HOOKS_DIR="${HOME}/.superclaw/hooks"
check_symlink "$HOOKS_DIR/superclaw-notify.sh" "hooks/superclaw-notify.sh"
check_symlink "$HOOKS_DIR/superclaw-progress.sh" "hooks/superclaw-progress.sh"

echo ""

# ─── Part 4: CLI ───

echo "## CLI"

if command -v superclaw &>/dev/null; then
  pass "superclaw command in PATH"
else
  fail "superclaw not found in PATH"
fi

CC_ENV="/root/.openclaw/workspace/bin/.env"
if [ -f "$CC_ENV" ]; then
  PERMS=$(stat -c %a "$CC_ENV" 2>/dev/null || stat -f %Lp "$CC_ENV" 2>/dev/null)
  if [ "$PERMS" = "600" ]; then
    pass ".env (permissions: 600)"
  else
    warn ".env permissions are $PERMS (should be 600)"
  fi
else
  fail ".env not found"
fi

echo ""

# ─── Part 5: Hooks config ───

echo "## Hooks Configuration"

CLAUDE_SETTINGS="${HOME}/.claude/settings.json"
if [ -f "$CLAUDE_SETTINGS" ]; then
  if jq -e '.hooks.Stop' "$CLAUDE_SETTINGS" &>/dev/null; then
    pass "hooks.Stop configured"
  else
    fail "hooks.Stop not configured"
  fi
  if jq -e '.hooks.PostToolUse' "$CLAUDE_SETTINGS" &>/dev/null; then
    pass "hooks.PostToolUse configured"
  else
    fail "hooks.PostToolUse not configured"
  fi
else
  fail "settings.json not found"
fi

echo ""

# ─── Part 6: Version command ───

echo "## Version Command"

OUTPUT=$(superclaw version 2>&1) || true
if echo "$OUTPUT" | grep -q "superclaw v"; then
  pass "superclaw version works"
else
  fail "superclaw version failed: $OUTPUT"
fi

echo ""

# ─── Summary ───

echo "======================================="
echo "Results: ✅ $PASS passed | ❌ $FAIL failed | ⚠️  $WARN warnings"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "❌ Installation incomplete."
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "⚠️  Installation OK with warnings."
else
  echo "✅ All checks passed!"
fi
```

- [ ] **Step 2: Run verification**

```bash
bash tests/install/verify-install.sh
```

Expected: All checks pass with symlinks verified.

- [ ] **Step 3: Commit**

```bash
git add tests/install/verify-install.sh
git commit -m "test(install): update verify script for symlink + version checks"
```

---

### Task 4: Update documentation

**Files:**
- Modify: `cli/SKILL.md`
- Modify: `INSTALL.md`

- [ ] **Step 1: Add version/update commands to `cli/SKILL.md`**

After the `### Check status` section, add:

```markdown
### Check version

```bash
superclaw version
```

Shows installed version, commit, and whether repo has newer commits.

### Update

```bash
superclaw update [--check]
```

Pulls latest code from repo and re-runs the installer. Use `--check` to preview without applying.
```

Add to the Options Reference table:

```markdown
| `--check` | false | Preview only (for `update`) |
```

- [ ] **Step 2: Update `INSTALL.md`**

Replace installation instructions to reflect the single `scripts/install.sh` entry point. Remove references to `cli/scripts/setup.sh` and `--skip-superclaw`. Add update instructions:

```markdown
## Updating

```bash
superclaw update          # pull + reinstall
superclaw update --check  # preview only
```

Or manually:
```bash
cd /path/to/superclaw-repo
git pull origin main
bash scripts/install.sh
```
```

- [ ] **Step 3: Commit**

```bash
git add cli/SKILL.md INSTALL.md
git commit -m "docs: add version/update commands, update install instructions"
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Clean install test**

```bash
# Remove old installed state (keep .env with real credentials)
rm -f ~/.superclaw/installed.json
rm -f /root/.openclaw/workspace/bin/superclaw.mjs
rm -rf ~/.openclaw/workspace/skills/superclaw
rm -rf ~/.openclaw/workspace/skills/superclaw-cli

# Fresh install
bash scripts/install.sh
```

- [ ] **Step 2: Verify all commands**

```bash
superclaw version
superclaw status
superclaw session ps
superclaw session list
superclaw update --check
superclaw --help
```

- [ ] **Step 3: Verify symlinks**

```bash
# All should be symlinks
ls -la /root/.openclaw/workspace/bin/superclaw.mjs
ls -la ~/.superclaw/hooks/superclaw-notify.sh
ls -la ~/.openclaw/workspace/skills/superclaw/SKILL.md
ls -la ~/.openclaw/workspace/skills/superclaw-cli/SKILL.md
```

- [ ] **Step 4: Verify idempotency**

```bash
bash scripts/install.sh
# Should succeed without errors or duplicate hooks
jq '.hooks.Stop | length' ~/.claude/settings.json
# Should be 1 (not 2+)
```

- [ ] **Step 5: Run verification script**

```bash
bash tests/install/verify-install.sh
```

Expected: All checks pass.

- [ ] **Step 6: Verify repo edit propagation**

```bash
# Edit a symlinked file in repo and verify it's immediately visible
echo "# test" >> cli/SKILL.md
superclaw --help 2>&1 | head -1
# Should still work — symlink means bin reads repo directly
git checkout cli/SKILL.md  # revert
```

- [ ] **Step 7: Commit all remaining changes**

```bash
git add -A
git status
# Only commit if there are meaningful changes not yet committed
```
