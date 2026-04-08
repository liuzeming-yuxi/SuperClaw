# Release v0.1.0 Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 2 security blockers and add 6 missing P0 files to prepare superclaw for its first public release (v0.1.0).

**Architecture:** All changes are independent config/metadata edits. No runtime logic changes except the Go backend credential fix. Each task produces one commit.

**Tech Stack:** Go (board-server), Markdown (SECURITY.md, README badges), JSON (package.json), INI (.editorconfig), plaintext (.nvmrc)

**Spec:** `docs/superpowers/specs/2026-04-08-release-readiness-design.md`

---

### File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `board-server/cmd/server/main.go` | Modify | Remove hardcoded token/IP, read from env vars |
| `SECURITY.md` | Create | Security policy and vulnerability reporting |
| `README.md` | Modify | Add license/version/node badges after title |
| `package.json` | Modify | Add engines, homepage, bugs, scripts fields |
| `.editorconfig` | Create | Editor consistency settings |
| `.nvmrc` | Create | Node.js version pin |

---

### Task 1: Fix hardcoded credentials in board-server

**Files:**
- Modify: `board-server/cmd/server/main.go:3-7,34-38,44-45`

- [ ] **Step 1: Add `strings` to imports**

In `board-server/cmd/server/main.go`, add `"strings"` to the import block (line 3-8). Current imports:

```go
import (
	"log"
	"net/http"
	"os"
	"path/filepath"
```

Change to:

```go
import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
```

- [ ] **Step 2: Add `envOr` helper function**

Add before the `startWatcher` function (before line 87):

```go
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 3: Replace hardcoded ChatConfig**

Replace lines 34-38:

```go
		ChatConfig: chat.Config{
			OpenClawBaseURL: "http://127.0.0.1:18789",
			OpenClawToken:   "130b9e35e8c7e52b3992253f54047d4726ec60c4d23c5ab1",
			SuperclawPath:  "/root/.openclaw/workspace/bin/superclaw.mjs",
		},
```

With:

```go
		ChatConfig: chat.Config{
			OpenClawBaseURL: envOr("OPENCLAW_BASE_URL", "http://127.0.0.1:18789"),
			OpenClawToken:   os.Getenv("OPENCLAW_TOKEN"),
			SuperclawPath:  envOr("SUPERCLAW_PATH", "/root/.openclaw/workspace/bin/superclaw.mjs"),
		},
```

- [ ] **Step 4: Replace hardcoded AllowedOrigins**

Replace line 45:

```go
		AllowedOrigins:   []string{"http://192.168.16.30:*", "http://localhost:*", "http://127.0.0.1:*"},
```

With:

```go
		AllowedOrigins:   strings.Split(envOr("BOARD_ALLOWED_ORIGINS", "http://localhost:*,http://127.0.0.1:*"), ","),
```

- [ ] **Step 5: Verify no hardcoded secrets remain**

Run:

```bash
grep -n "130b9e35\|192.168.16.30" board-server/cmd/server/main.go
```

Expected: no output.

- [ ] **Step 6: Verify Go syntax**

Run:

```bash
cd board-server && go vet ./cmd/server/ 2>&1; echo "exit: $?"
```

Expected: exit 0 (or if Go modules not set up locally, at least no syntax errors in the file).

- [ ] **Step 7: Commit**

```bash
git add board-server/cmd/server/main.go
git commit -m "$(cat <<'EOF'
security(board-server): remove hardcoded token and IP from main.go

- OpenClawToken read from OPENCLAW_TOKEN env var (was hardcoded)
- AllowedOrigins read from BOARD_ALLOWED_ORIGINS env var (removes 192.168.16.30)
- SuperclawPath read from SUPERCLAW_PATH env var with fallback
- Add envOr() helper for env-with-default pattern

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create SECURITY.md

**Files:**
- Create: `SECURITY.md`

- [ ] **Step 1: Create SECURITY.md**

```markdown
# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in SuperClaw, please report it responsibly:

1. **Do NOT open a public issue.**
2. Use [GitHub Security Advisories](https://github.com/liuzeming-yuxi/SuperClaw/security/advisories/new) to report the vulnerability privately.
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- **72 hours**: We will acknowledge receipt of your report.
- **7 days**: We will provide an initial assessment.
- **30 days**: We aim to release a fix for confirmed vulnerabilities.

## Scope

This policy applies to the SuperClaw repository and its components:
- `cli/superclaw.mjs` (CLI bridge)
- `board-server/` (Go backend)
- `hooks/` (Claude Code hooks)
- `scripts/install.sh` (installer)

## Security Considerations

- **API credentials**: SuperClaw reads API tokens from `.env` files (not hardcoded). Never commit `.env` files.
- **IS_SANDBOX=1**: The CLI runs as root with sandbox bypass. Only run in trusted environments.
- **Hook scripts**: Hooks execute shell commands. Review hook content before installation.

## Contact

For security concerns, use [GitHub Security Advisories](https://github.com/liuzeming-yuxi/SuperClaw/security/advisories/new).
```

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "$(cat <<'EOF'
docs: add SECURITY.md with vulnerability reporting policy

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add README badges + package.json + .editorconfig + .nvmrc

**Files:**
- Modify: `README.md:1-2`
- Modify: `package.json`
- Create: `.editorconfig`
- Create: `.nvmrc`

- [ ] **Step 1: Add badges to README.md**

Replace line 1 of `README.md`:

```markdown
# SuperClaw
```

With:

```markdown
# SuperClaw

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)](CHANGELOG.md)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
```

- [ ] **Step 2: Update package.json**

Replace the full content of `package.json` with:

```json
{
  "name": "superclaw",
  "version": "0.1.0",
  "description": "OpenClaw + Claude Code 的超级编码体。人管方向，OpenClaw 管对齐和验收，Claude Code 管执行。",
  "type": "module",
  "license": "MIT",
  "author": {
    "name": "Noumena"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/liuzeming-yuxi/SuperClaw.git"
  },
  "homepage": "https://github.com/liuzeming-yuxi/SuperClaw",
  "bugs": {
    "url": "https://github.com/liuzeming-yuxi/SuperClaw/issues"
  },
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "bash tests/run-all.sh"
  },
  "keywords": [
    "openclaw",
    "claude-code",
    "superpowers",
    "harness-engineering",
    "agent-team",
    "skills"
  ]
}
```

- [ ] **Step 3: Create .editorconfig**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.go]
indent_style = tab

[Makefile]
indent_style = tab
```

- [ ] **Step 4: Create .nvmrc**

```
22
```

- [ ] **Step 5: Verify**

```bash
head -5 README.md        # Should show badges
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.engines, p.homepage, p.scripts)"
cat .editorconfig | head -3
cat .nvmrc
```

- [ ] **Step 6: Commit**

```bash
git add README.md package.json .editorconfig .nvmrc
git commit -m "$(cat <<'EOF'
chore: add badges, complete package.json, add .editorconfig and .nvmrc

- README: license, version, node badges
- package.json: engines>=18, homepage, bugs url, npm test script
- .editorconfig: indent/encoding/line-ending standards
- .nvmrc: pin Node 22

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Tag v0.1.0

- [ ] **Step 1: Commit spec and plan**

```bash
git add docs/superpowers/specs/2026-04-08-release-readiness-design.md docs/superpowers/plans/2026-04-08-release-readiness.md
git commit -m "docs: release readiness spec and plan"
```

- [ ] **Step 2: Verify clean state**

```bash
git status
# Should be clean (nothing to commit)

grep -rn "130b9e35\|192.168.16.30\|sk-fe7d" --include="*.go" --include="*.mjs" --include="*.sh" --include="*.json" . | grep -v .git | grep -v node_modules
# Should be empty — no hardcoded secrets
```

- [ ] **Step 3: Tag release**

```bash
git tag -a v0.1.0 -m "Release v0.1.0 — initial public release

Features:
- 5-phase workflow (align → plan → execute → verify → deliver)
- superclaw CLI with session management (start/continue/ps/stop/clean)
- Version management (superclaw version/update)
- Unified all-symlink installer
- Claude Code hooks (progress + stop notifications)
- Board server + UI dashboard
"
```

- [ ] **Step 4: Verify tag**

```bash
git tag -l v0.1.0
superclaw version
```

Expected: tag exists, `superclaw version` shows `v0.1.0` and "up to date".
