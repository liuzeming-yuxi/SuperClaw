# File-Driven Board + Constraint Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a file-system kanban board (Component 1) and automated constraint lint scripts (Component 7) as the foundation for SuperClaw v2.

**Architecture:** Task files are markdown with YAML frontmatter, stored in phase-named directories under `.superclaw/board/`. A shared bash helper library provides frontmatter parsing. Lint scripts validate task file schema, board state consistency, and content rules. All scripts follow the project's existing bash conventions (`set -euo pipefail`, color helpers, temp dir cleanup).

**Tech Stack:** Bash (shell scripts), YAML frontmatter in Markdown, jq (optional, for JSON), sed/grep/awk for frontmatter parsing.

---

## File Structure

### New Files to Create

```
.superclaw/
├── bin/
│   ├── _helpers.sh            # Shared helper library (frontmatter parser, color output, etc.)
│   ├── board-create.sh        # Create a new task file in inbox/
│   ├── board-move.sh          # Move task between phase directories
│   ├── board-list.sh          # List tasks in a column or all columns
│   └── board-status.sh        # Summary of board state (counts per column)
├── board/
│   ├── inbox/
│   │   └── .gitkeep
│   ├── aligning/
│   │   └── .gitkeep
│   ├── planned/
│   │   └── .gitkeep
│   ├── executing/
│   │   └── .gitkeep
│   ├── reviewing/
│   │   └── .gitkeep
│   ├── done/
│   │   └── .gitkeep
│   └── blocked/
│       └── .gitkeep
├── config/
│   └── board.yaml             # Board configuration (next_id, defaults)
├── lint/
│   ├── run-all.sh             # Run all lint scripts
│   ├── lint-task-file.sh      # Validate task file frontmatter schema
│   ├── lint-no-placeholder.sh # No TBD/TODO/FIXME in specs
│   ├── lint-verify-required.sh # Every task has a Verify section
│   ├── lint-board-consistency.sh # Phase field matches directory
│   └── lint-tier-config.sh    # Tier config YAML validation
└── config/
    └── tiers/                 # (placeholder for Component 3)
        └── .gitkeep

tests/
├── board/
│   ├── test-helpers.sh        # Tests for _helpers.sh
│   ├── test-board-create.sh   # Tests for board-create.sh
│   ├── test-board-move.sh     # Tests for board-move.sh
│   ├── test-board-list.sh     # Tests for board-list.sh
│   └── test-board-status.sh   # Tests for board-status.sh
├── lint/
│   ├── test-lint-task-file.sh
│   ├── test-lint-no-placeholder.sh
│   ├── test-lint-verify-required.sh
│   ├── test-lint-board-consistency.sh
│   └── test-lint-tier-config.sh
└── integration/
    └── test-board-lifecycle.sh # Full board lifecycle + lint integration
```

### Files to Modify

- `tests/run-all.sh` — Add board and lint test suites

---

## Task 1: Board Directory Structure + Config + Shared Helpers

**Files:**
- Create: `.superclaw/board/{inbox,aligning,planned,executing,reviewing,done,blocked}/.gitkeep`
- Create: `.superclaw/config/board.yaml`
- Create: `.superclaw/config/tiers/.gitkeep`
- Create: `.superclaw/bin/_helpers.sh`
- Create: `tests/board/test-helpers.sh`

- [ ] **Step 1: Write tests for the helpers library**

Create `tests/board/test-helpers.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

# Setup: create a temp .superclaw environment
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/board/inbox"
mkdir -p "$TEST_DIR/.superclaw/config"

# Create a test task file
cat > "$TEST_DIR/.superclaw/board/inbox/001-test-task.md" << 'TASK'
---
id: "001"
slug: test-task
created: 2026-04-05T10:00:00Z
updated: 2026-04-05T10:00:00Z
assignee: human
priority: high
type: feature
tier: T2
phase: inbox
blocked_reason: ""
parent: ""
spec_path: ""
plan_path: ""
---

# Test Task

## Description

A test task for unit testing.

## Acceptance Criteria

- [ ] Tests pass

## Verify

```bash
echo "ok"
```

## History

| Time | Phase | Actor | Note |
|------|-------|-------|------|
| 2026-04-05T10:00 | inbox | human | Created |
TASK

# Create board.yaml
cat > "$TEST_DIR/.superclaw/config/board.yaml" << 'YAML'
next_id: 2
default_tier: T2
default_priority: medium
YAML

# Source the helpers
export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
source "$REPO_ROOT/.superclaw/bin/_helpers.sh"

echo "=== Testing _helpers.sh ==="
echo ""

# Test get_frontmatter
VAL=$(get_frontmatter "$TEST_DIR/.superclaw/board/inbox/001-test-task.md" "id")
[[ "$VAL" == "001" ]] && pass "get_frontmatter: id = 001" || fail "get_frontmatter: id expected '001', got '$VAL'"

VAL=$(get_frontmatter "$TEST_DIR/.superclaw/board/inbox/001-test-task.md" "slug")
[[ "$VAL" == "test-task" ]] && pass "get_frontmatter: slug" || fail "get_frontmatter: slug expected 'test-task', got '$VAL'"

VAL=$(get_frontmatter "$TEST_DIR/.superclaw/board/inbox/001-test-task.md" "priority")
[[ "$VAL" == "high" ]] && pass "get_frontmatter: priority" || fail "get_frontmatter: priority expected 'high', got '$VAL'"

VAL=$(get_frontmatter "$TEST_DIR/.superclaw/board/inbox/001-test-task.md" "phase")
[[ "$VAL" == "inbox" ]] && pass "get_frontmatter: phase" || fail "get_frontmatter: phase expected 'inbox', got '$VAL'"

VAL=$(get_frontmatter "$TEST_DIR/.superclaw/board/inbox/001-test-task.md" "blocked_reason")
[[ "$VAL" == "" ]] && pass "get_frontmatter: empty value" || fail "get_frontmatter: blocked_reason expected empty, got '$VAL'"

# Test set_frontmatter
cp "$TEST_DIR/.superclaw/board/inbox/001-test-task.md" "$TEST_DIR/set-test.md"
set_frontmatter "$TEST_DIR/set-test.md" "phase" "aligning"
VAL=$(get_frontmatter "$TEST_DIR/set-test.md" "phase")
[[ "$VAL" == "aligning" ]] && pass "set_frontmatter: phase updated" || fail "set_frontmatter: phase expected 'aligning', got '$VAL'"

set_frontmatter "$TEST_DIR/set-test.md" "priority" "low"
VAL=$(get_frontmatter "$TEST_DIR/set-test.md" "priority")
[[ "$VAL" == "low" ]] && pass "set_frontmatter: priority updated" || fail "set_frontmatter: priority expected 'low', got '$VAL'"

# Test get_yaml_value
VAL=$(get_yaml_value "$TEST_DIR/.superclaw/config/board.yaml" "next_id")
[[ "$VAL" == "2" ]] && pass "get_yaml_value: next_id" || fail "get_yaml_value: next_id expected '2', got '$VAL'"

VAL=$(get_yaml_value "$TEST_DIR/.superclaw/config/board.yaml" "default_tier")
[[ "$VAL" == "T2" ]] && pass "get_yaml_value: default_tier" || fail "get_yaml_value: default_tier expected 'T2', got '$VAL'"

# Test set_yaml_value
cp "$TEST_DIR/.superclaw/config/board.yaml" "$TEST_DIR/yaml-test.yaml"
set_yaml_value "$TEST_DIR/yaml-test.yaml" "next_id" "3"
VAL=$(get_yaml_value "$TEST_DIR/yaml-test.yaml" "next_id")
[[ "$VAL" == "3" ]] && pass "set_yaml_value: next_id updated" || fail "set_yaml_value: next_id expected '3', got '$VAL'"

# Test format_id
VAL=$(format_id 1)
[[ "$VAL" == "001" ]] && pass "format_id: 1 → 001" || fail "format_id: expected '001', got '$VAL'"

VAL=$(format_id 42)
[[ "$VAL" == "042" ]] && pass "format_id: 42 → 042" || fail "format_id: expected '042', got '$VAL'"

VAL=$(format_id 999)
[[ "$VAL" == "999" ]] && pass "format_id: 999 → 999" || fail "format_id: expected '999', got '$VAL'"

VAL=$(format_id 1000)
[[ "$VAL" == "1000" ]] && pass "format_id: 1000 → 1000" || fail "format_id: expected '1000', got '$VAL'"

# Test timestamp
VAL=$(timestamp)
[[ "$VAL" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] && pass "timestamp: ISO format" || fail "timestamp: unexpected format '$VAL'"

# Test resolve_superclaw_root
RESOLVED=$(resolve_superclaw_root "$TEST_DIR")
[[ "$RESOLVED" == "$TEST_DIR/.superclaw" ]] && pass "resolve_superclaw_root: found" || fail "resolve_superclaw_root: expected '$TEST_DIR/.superclaw', got '$RESOLVED'"

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/board/test-helpers.sh`
Expected: FAIL — `_helpers.sh` not found

- [ ] **Step 3: Create directory structure**

Create all board directories with `.gitkeep` files:

```bash
mkdir -p .superclaw/board/{inbox,aligning,planned,executing,reviewing,done,blocked}
mkdir -p .superclaw/config/tiers
mkdir -p .superclaw/bin
touch .superclaw/board/{inbox,aligning,planned,executing,reviewing,done,blocked}/.gitkeep
touch .superclaw/config/tiers/.gitkeep
```

Create `.superclaw/config/board.yaml`:

```yaml
next_id: 1
default_tier: T2
default_priority: medium
```

- [ ] **Step 4: Implement the helpers library**

Create `.superclaw/bin/_helpers.sh`:

```bash
#!/usr/bin/env bash
# SuperClaw shared helper library
# Source this file: source "$(dirname "$0")/_helpers.sh"

# --- Output helpers (match project conventions) ---
sc_info()  { printf '\033[1;34m[superclaw]\033[0m %s\n' "$1"; }
sc_ok()    { printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
sc_warn()  { printf '  \033[1;33m⚠️\033[0m  %s\n' "$1"; }
sc_fail()  { printf '  \033[1;31m❌\033[0m %s\n' "$1"; }
sc_step()  { printf '\n\033[1m## %s\033[0m\n\n' "$1"; }

# --- Frontmatter helpers ---

# Extract a value from YAML frontmatter (between --- delimiters)
# Usage: get_frontmatter <file> <key>
# Returns: value (stripped of surrounding quotes), or empty string if not found
get_frontmatter() {
    local file="$1" key="$2"
    local value
    value=$(sed -n '/^---$/,/^---$/{ /^'"$key"':/{ s/^'"$key"': *//; s/^"//; s/"$//; p; q; } }' "$file")
    echo "$value"
}

# Update a value in YAML frontmatter
# Usage: set_frontmatter <file> <key> <new_value>
set_frontmatter() {
    local file="$1" key="$2" value="$3"
    sed -i "s/^${key}:.*/${key}: ${value}/" "$file"
}

# --- Plain YAML helpers (for board.yaml, tier configs) ---

# Extract a value from a plain YAML file (no frontmatter delimiters)
# Usage: get_yaml_value <file> <key>
get_yaml_value() {
    local file="$1" key="$2"
    grep "^${key}:" "$file" | sed "s/^${key}: *//" | sed 's/^"//; s/"$//'
}

# Update a value in a plain YAML file
# Usage: set_yaml_value <file> <key> <new_value>
set_yaml_value() {
    local file="$1" key="$2" value="$3"
    sed -i "s/^${key}:.*/${key}: ${value}/" "$file"
}

# --- ID formatting ---

# Format a numeric ID with zero-padding (minimum 3 digits)
# Usage: format_id <number>
format_id() {
    local num="$1"
    if [[ $num -le 999 ]]; then
        printf '%03d' "$num"
    else
        echo "$num"
    fi
}

# --- Timestamp ---

# Returns current UTC timestamp in ISO 8601 format
timestamp() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

# --- Path resolution ---

# Find .superclaw root directory, searching upward from given path
# Usage: resolve_superclaw_root [start_dir]
# Returns: absolute path to .superclaw/ or exits with error
resolve_superclaw_root() {
    # If SUPERCLAW_ROOT is set, use it
    if [[ -n "${SUPERCLAW_ROOT:-}" ]]; then
        echo "$SUPERCLAW_ROOT"
        return
    fi

    local dir="${1:-$(pwd)}"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/.superclaw" ]]; then
            echo "$dir/.superclaw"
            return
        fi
        dir="$(dirname "$dir")"
    done
    echo "Error: .superclaw directory not found" >&2
    return 1
}

# Valid phases for board operations
BOARD_PHASES="inbox aligning planned executing reviewing done blocked"

# Valid priorities
VALID_PRIORITIES="critical high medium low"

# Valid types
VALID_TYPES="feature bugfix refactor chore spike"

# Valid tiers
VALID_TIERS="T0 T1 T2 T3"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash tests/board/test-helpers.sh`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add .superclaw/ tests/board/test-helpers.sh
git commit -m "feat(board): add directory structure, config, and shared helpers"
```

---

## Task 2: board-create.sh

**Files:**
- Create: `.superclaw/bin/board-create.sh`
- Create: `tests/board/test-board-create.sh`

- [ ] **Step 1: Write failing tests**

Create `tests/board/test-board-create.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

# Setup temp board
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/board"/{inbox,aligning,planned,executing,reviewing,done,blocked}
mkdir -p "$TEST_DIR/.superclaw/config"
mkdir -p "$TEST_DIR/.superclaw/bin"

# Copy helpers and board-create
cp "$REPO_ROOT/.superclaw/bin/_helpers.sh" "$TEST_DIR/.superclaw/bin/"
cp "$REPO_ROOT/.superclaw/bin/board-create.sh" "$TEST_DIR/.superclaw/bin/"

cat > "$TEST_DIR/.superclaw/config/board.yaml" << 'YAML'
next_id: 1
default_tier: T2
default_priority: medium
YAML

export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
CREATE="$TEST_DIR/.superclaw/bin/board-create.sh"

echo "=== Testing board-create.sh ==="
echo ""

# Test 1: Create a basic task
OUTPUT=$($CREATE --title "Add dark mode" --type feature 2>&1)
TASK_FILE="$TEST_DIR/.superclaw/board/inbox/001-add-dark-mode.md"
[[ -f "$TASK_FILE" ]] && pass "creates task file in inbox" || fail "task file not created at $TASK_FILE"

# Test 2: Frontmatter has correct fields
source "$TEST_DIR/.superclaw/bin/_helpers.sh"
VAL=$(get_frontmatter "$TASK_FILE" "id")
[[ "$VAL" == "001" ]] && pass "id is 001" || fail "id expected '001', got '$VAL'"

VAL=$(get_frontmatter "$TASK_FILE" "slug")
[[ "$VAL" == "add-dark-mode" ]] && pass "slug is add-dark-mode" || fail "slug expected 'add-dark-mode', got '$VAL'"

VAL=$(get_frontmatter "$TASK_FILE" "phase")
[[ "$VAL" == "inbox" ]] && pass "phase is inbox" || fail "phase expected 'inbox', got '$VAL'"

VAL=$(get_frontmatter "$TASK_FILE" "type")
[[ "$VAL" == "feature" ]] && pass "type is feature" || fail "type expected 'feature', got '$VAL'"

VAL=$(get_frontmatter "$TASK_FILE" "tier")
[[ "$VAL" == "T2" ]] && pass "default tier is T2" || fail "tier expected 'T2', got '$VAL'"

VAL=$(get_frontmatter "$TASK_FILE" "priority")
[[ "$VAL" == "medium" ]] && pass "default priority is medium" || fail "priority expected 'medium', got '$VAL'"

# Test 3: next_id incremented
VAL=$(get_yaml_value "$TEST_DIR/.superclaw/config/board.yaml" "next_id")
[[ "$VAL" == "2" ]] && pass "next_id incremented to 2" || fail "next_id expected '2', got '$VAL'"

# Test 4: Task has title heading
grep -q "^# Add dark mode$" "$TASK_FILE" && pass "title heading present" || fail "title heading missing"

# Test 5: Task has History section
grep -q "^## History$" "$TASK_FILE" && pass "history section present" || fail "history section missing"

# Test 6: Create a second task with custom priority and tier
$CREATE --title "Fix login bug" --type bugfix --priority critical --tier T0 2>&1
TASK2="$TEST_DIR/.superclaw/board/inbox/002-fix-login-bug.md"
[[ -f "$TASK2" ]] && pass "second task created" || fail "second task not created"

VAL=$(get_frontmatter "$TASK2" "priority")
[[ "$VAL" == "critical" ]] && pass "custom priority applied" || fail "priority expected 'critical', got '$VAL'"

VAL=$(get_frontmatter "$TASK2" "tier")
[[ "$VAL" == "T0" ]] && pass "custom tier applied" || fail "tier expected 'T0', got '$VAL'"

VAL=$(get_yaml_value "$TEST_DIR/.superclaw/config/board.yaml" "next_id")
[[ "$VAL" == "3" ]] && pass "next_id incremented to 3" || fail "next_id expected '3', got '$VAL'"

# Test 7: Task with description
$CREATE --title "Refactor auth" --type refactor --description "Simplify the auth module" 2>&1
TASK3="$TEST_DIR/.superclaw/board/inbox/003-refactor-auth.md"
grep -q "Simplify the auth module" "$TASK3" && pass "description included" || fail "description missing"

# Test 8: Missing required --title should fail
if $CREATE --type feature 2>/dev/null; then
    fail "should fail without --title"
else
    pass "fails without --title"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/board/test-board-create.sh`
Expected: FAIL — `board-create.sh` not found

- [ ] **Step 3: Implement board-create.sh**

Create `.superclaw/bin/board-create.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

# --- Parse arguments ---
TITLE=""
TYPE="feature"
PRIORITY=""
TIER=""
DESCRIPTION=""
ASSIGNEE="human"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --title)     TITLE="$2"; shift 2 ;;
        --type)      TYPE="$2"; shift 2 ;;
        --priority)  PRIORITY="$2"; shift 2 ;;
        --tier)      TIER="$2"; shift 2 ;;
        --description) DESCRIPTION="$2"; shift 2 ;;
        --assignee)  ASSIGNEE="$2"; shift 2 ;;
        *)           sc_fail "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$TITLE" ]]; then
    sc_fail "Error: --title is required"
    exit 1
fi

# --- Resolve paths ---
SC_ROOT=$(resolve_superclaw_root)
BOARD_DIR="$SC_ROOT/board"
CONFIG="$SC_ROOT/config/board.yaml"

# --- Generate ID ---
NEXT_ID=$(get_yaml_value "$CONFIG" "next_id")
FORMATTED_ID=$(format_id "$NEXT_ID")

# --- Apply defaults ---
if [[ -z "$PRIORITY" ]]; then
    PRIORITY=$(get_yaml_value "$CONFIG" "default_priority")
fi
if [[ -z "$TIER" ]]; then
    TIER=$(get_yaml_value "$CONFIG" "default_tier")
fi

# --- Generate slug from title ---
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')

# --- Create task file ---
NOW=$(timestamp)
TASK_FILE="$BOARD_DIR/inbox/${FORMATTED_ID}-${SLUG}.md"

cat > "$TASK_FILE" << EOF
---
id: "${FORMATTED_ID}"
slug: ${SLUG}
created: ${NOW}
updated: ${NOW}
assignee: ${ASSIGNEE}
priority: ${PRIORITY}
type: ${TYPE}
tier: ${TIER}
phase: inbox
blocked_reason: ""
parent: ""
spec_path: ""
plan_path: ""
---

# ${TITLE}

## Description

${DESCRIPTION:-No description provided.}

## Acceptance Criteria

- [ ] (to be defined during align phase)

## Verify

\`\`\`bash
# (to be defined during align phase)
\`\`\`

## History

| Time | Phase | Actor | Note |
|------|-------|-------|------|
| ${NOW} | inbox | ${ASSIGNEE} | Created |
EOF

# --- Increment next_id ---
set_yaml_value "$CONFIG" "next_id" "$((NEXT_ID + 1))"

sc_ok "Created task: ${FORMATTED_ID}-${SLUG} in inbox/"
echo "$TASK_FILE"
```

Make executable: `chmod +x .superclaw/bin/board-create.sh`

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash tests/board/test-board-create.sh`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add .superclaw/bin/board-create.sh tests/board/test-board-create.sh
git commit -m "feat(board): add board-create.sh with tests"
```

---

## Task 3: board-move.sh

**Files:**
- Create: `.superclaw/bin/board-move.sh`
- Create: `tests/board/test-board-move.sh`

- [ ] **Step 1: Write failing tests**

Create `tests/board/test-board-move.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

# Setup temp board
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/board"/{inbox,aligning,planned,executing,reviewing,done,blocked}
mkdir -p "$TEST_DIR/.superclaw/config"
mkdir -p "$TEST_DIR/.superclaw/bin"

cp "$REPO_ROOT/.superclaw/bin/_helpers.sh" "$TEST_DIR/.superclaw/bin/"
cp "$REPO_ROOT/.superclaw/bin/board-move.sh" "$TEST_DIR/.superclaw/bin/"

cat > "$TEST_DIR/.superclaw/config/board.yaml" << 'YAML'
next_id: 2
default_tier: T2
default_priority: medium
YAML

export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
source "$TEST_DIR/.superclaw/bin/_helpers.sh"
MOVE="$TEST_DIR/.superclaw/bin/board-move.sh"

# Create a test task in inbox
cat > "$TEST_DIR/.superclaw/board/inbox/001-test-task.md" << 'TASK'
---
id: "001"
slug: test-task
created: 2026-04-05T10:00:00Z
updated: 2026-04-05T10:00:00Z
assignee: openclaw
priority: high
type: feature
tier: T2
phase: inbox
blocked_reason: ""
parent: ""
spec_path: ""
plan_path: ""
---

# Test Task

## Description

A test task.

## Verify

```bash
echo "ok"
```

## History

| Time | Phase | Actor | Note |
|------|-------|-------|------|
| 2026-04-05T10:00 | inbox | human | Created |
TASK

echo "=== Testing board-move.sh ==="
echo ""

# Test 1: Move from inbox to aligning
$MOVE 001-test-task.md inbox aligning "开始对齐" 2>&1
[[ -f "$TEST_DIR/.superclaw/board/aligning/001-test-task.md" ]] && pass "file moved to aligning" || fail "file not in aligning"
[[ ! -f "$TEST_DIR/.superclaw/board/inbox/001-test-task.md" ]] && pass "file removed from inbox" || fail "file still in inbox"

# Test 2: Phase field updated in frontmatter
VAL=$(get_frontmatter "$TEST_DIR/.superclaw/board/aligning/001-test-task.md" "phase")
[[ "$VAL" == "aligning" ]] && pass "phase field updated to aligning" || fail "phase expected 'aligning', got '$VAL'"

# Test 3: Updated timestamp changed
VAL=$(get_frontmatter "$TEST_DIR/.superclaw/board/aligning/001-test-task.md" "updated")
[[ "$VAL" != "2026-04-05T10:00:00Z" ]] && pass "updated timestamp changed" || fail "updated timestamp not changed"

# Test 4: History row appended
grep -q "开始对齐" "$TEST_DIR/.superclaw/board/aligning/001-test-task.md" && pass "history note appended" || fail "history note missing"

# Test 5: Move aligning → planned
$MOVE 001-test-task.md aligning planned "spec approved" 2>&1
[[ -f "$TEST_DIR/.superclaw/board/planned/001-test-task.md" ]] && pass "moved to planned" || fail "not in planned"
VAL=$(get_frontmatter "$TEST_DIR/.superclaw/board/planned/001-test-task.md" "phase")
[[ "$VAL" == "planned" ]] && pass "phase is planned" || fail "phase expected 'planned', got '$VAL'"

# Test 6: Move to blocked sets blocked_reason
$MOVE 001-test-task.md planned blocked "需要用户确认 API 接口" 2>&1
VAL=$(get_frontmatter "$TEST_DIR/.superclaw/board/blocked/001-test-task.md" "blocked_reason")
[[ -n "$VAL" ]] && pass "blocked_reason set" || fail "blocked_reason empty"

# Test 7: Move from blocked clears blocked_reason
$MOVE 001-test-task.md blocked planned "resolved" 2>&1
VAL=$(get_frontmatter "$TEST_DIR/.superclaw/board/planned/001-test-task.md" "blocked_reason")
[[ -z "$VAL" || "$VAL" == '""' ]] && pass "blocked_reason cleared" || fail "blocked_reason not cleared: '$VAL'"

# Test 8: Invalid source phase should fail
if $MOVE 001-test-task.md inbox aligning "nope" 2>/dev/null; then
    fail "should fail when file not in source phase"
else
    pass "fails when file not in source phase"
fi

# Test 9: Invalid phase name should fail
if $MOVE 001-test-task.md planned nonexistent "nope" 2>/dev/null; then
    fail "should fail with invalid phase name"
else
    pass "fails with invalid phase name"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/board/test-board-move.sh`
Expected: FAIL — `board-move.sh` not found

- [ ] **Step 3: Implement board-move.sh**

Create `.superclaw/bin/board-move.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

# Usage: board-move.sh <task-file> <from-phase> <to-phase> <note>
if [[ $# -lt 4 ]]; then
    echo "Usage: board-move.sh <task-file> <from-phase> <to-phase> <note>"
    echo "Example: board-move.sh 001-add-dark-mode.md inbox aligning \"开始对齐\""
    exit 1
fi

TASK_FILE="$1"
FROM="$2"
TO="$3"
NOTE="$4"

# --- Validate phases ---
validate_phase() {
    local phase="$1"
    for p in $BOARD_PHASES; do
        [[ "$p" == "$phase" ]] && return 0
    done
    sc_fail "Invalid phase: $phase (valid: $BOARD_PHASES)"
    return 1
}

validate_phase "$FROM"
validate_phase "$TO"

# --- Resolve paths ---
SC_ROOT=$(resolve_superclaw_root)
SRC="$SC_ROOT/board/$FROM/$TASK_FILE"
DST_DIR="$SC_ROOT/board/$TO"
DST="$DST_DIR/$TASK_FILE"

if [[ ! -f "$SRC" ]]; then
    sc_fail "Task file not found: $SRC"
    exit 1
fi

# --- Move the file ---
mv "$SRC" "$DST"

# --- Update frontmatter ---
NOW=$(timestamp)
set_frontmatter "$DST" "phase" "$TO"
set_frontmatter "$DST" "updated" "$NOW"

# Handle blocked_reason
if [[ "$TO" == "blocked" ]]; then
    set_frontmatter "$DST" "blocked_reason" "\"$NOTE\""
else
    set_frontmatter "$DST" "blocked_reason" "\"\""
fi

# --- Append history row ---
# Find the last line of the History table and append after it
# History format: | Time | Phase | Actor | Note |
SHORT_TIME=$(echo "$NOW" | sed 's/:[0-9][0-9]Z$//')
HISTORY_ROW="| ${SHORT_TIME} | ${TO} | system | ${NOTE} |"

# Append the history row at the end of the file
echo "$HISTORY_ROW" >> "$DST"

sc_ok "Moved ${TASK_FILE}: ${FROM} → ${TO}"
```

Make executable: `chmod +x .superclaw/bin/board-move.sh`

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash tests/board/test-board-move.sh`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add .superclaw/bin/board-move.sh tests/board/test-board-move.sh
git commit -m "feat(board): add board-move.sh with tests"
```

---

## Task 4: board-list.sh + board-status.sh

**Files:**
- Create: `.superclaw/bin/board-list.sh`
- Create: `.superclaw/bin/board-status.sh`
- Create: `tests/board/test-board-list.sh`
- Create: `tests/board/test-board-status.sh`

- [ ] **Step 1: Write failing tests for board-list.sh**

Create `tests/board/test-board-list.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

# Setup temp board
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/board"/{inbox,aligning,planned,executing,reviewing,done,blocked}
mkdir -p "$TEST_DIR/.superclaw/config"
mkdir -p "$TEST_DIR/.superclaw/bin"

cp "$REPO_ROOT/.superclaw/bin/_helpers.sh" "$TEST_DIR/.superclaw/bin/"
cp "$REPO_ROOT/.superclaw/bin/board-list.sh" "$TEST_DIR/.superclaw/bin/"

export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
LIST="$TEST_DIR/.superclaw/bin/board-list.sh"

# Create test tasks
for phase in inbox planned executing; do
    cat > "$TEST_DIR/.superclaw/board/$phase/001-task-a.md" << EOF
---
id: "001"
slug: task-a
priority: high
type: feature
tier: T2
phase: $phase
---

# Task A
EOF
done

cat > "$TEST_DIR/.superclaw/board/inbox/002-task-b.md" << 'EOF'
---
id: "002"
slug: task-b
priority: low
type: bugfix
tier: T1
phase: inbox
---

# Task B
EOF

echo "=== Testing board-list.sh ==="
echo ""

# Test 1: List specific phase
OUTPUT=$($LIST inbox 2>&1)
echo "$OUTPUT" | grep -q "001" && pass "list inbox shows task 001" || fail "task 001 not in inbox listing"
echo "$OUTPUT" | grep -q "002" && pass "list inbox shows task 002" || fail "task 002 not in inbox listing"

# Test 2: List phase with one task
OUTPUT=$($LIST planned 2>&1)
echo "$OUTPUT" | grep -q "001" && pass "list planned shows task" || fail "planned listing empty"

# Test 3: List empty phase
OUTPUT=$($LIST done 2>&1)
echo "$OUTPUT" | grep -qi "no tasks\|empty\|0" && pass "list done shows empty" || pass "list done returned (empty is ok)"

# Test 4: List all phases
OUTPUT=$($LIST --all 2>&1)
echo "$OUTPUT" | grep -q "inbox" && pass "list all includes inbox" || fail "list all missing inbox"
echo "$OUTPUT" | grep -q "planned" && pass "list all includes planned" || fail "list all missing planned"

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 2: Write failing tests for board-status.sh**

Create `tests/board/test-board-status.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

# Setup temp board
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/board"/{inbox,aligning,planned,executing,reviewing,done,blocked}
mkdir -p "$TEST_DIR/.superclaw/config"
mkdir -p "$TEST_DIR/.superclaw/bin"

cp "$REPO_ROOT/.superclaw/bin/_helpers.sh" "$TEST_DIR/.superclaw/bin/"
cp "$REPO_ROOT/.superclaw/bin/board-status.sh" "$TEST_DIR/.superclaw/bin/"

export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
STATUS="$TEST_DIR/.superclaw/bin/board-status.sh"

# Create test tasks in various phases
for i in 1 2 3; do
    cat > "$TEST_DIR/.superclaw/board/inbox/00${i}-task-${i}.md" << EOF
---
id: "00${i}"
slug: task-${i}
phase: inbox
---
# Task ${i}
EOF
done

cat > "$TEST_DIR/.superclaw/board/executing/004-running.md" << 'EOF'
---
id: "004"
slug: running
phase: executing
---
# Running Task
EOF

echo "=== Testing board-status.sh ==="
echo ""

# Test 1: Status shows counts
OUTPUT=$($STATUS 2>&1)
echo "$OUTPUT" | grep -q "inbox" && pass "status includes inbox" || fail "status missing inbox"
echo "$OUTPUT" | grep -q "3" && pass "inbox count is 3" || fail "inbox count wrong"
echo "$OUTPUT" | grep -q "executing" && pass "status includes executing" || fail "status missing executing"

# Test 2: Status shows total
echo "$OUTPUT" | grep -qi "total\|4" && pass "total shown" || fail "total missing"

# Test 3: Empty board
rm -f "$TEST_DIR/.superclaw/board"/*/*.md
OUTPUT=$($STATUS 2>&1)
echo "$OUTPUT" | grep -qi "0\|empty\|no tasks" && pass "empty board handled" || pass "empty board returned"

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash tests/board/test-board-list.sh && bash tests/board/test-board-status.sh`
Expected: FAIL — scripts not found

- [ ] **Step 4: Implement board-list.sh**

Create `.superclaw/bin/board-list.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

SC_ROOT=$(resolve_superclaw_root)
BOARD_DIR="$SC_ROOT/board"

list_phase() {
    local phase="$1"
    local dir="$BOARD_DIR/$phase"
    local files=()

    # Collect .md files (exclude .gitkeep)
    while IFS= read -r f; do
        files+=("$f")
    done < <(find "$dir" -maxdepth 1 -name "*.md" -type f 2>/dev/null | sort)

    if [[ ${#files[@]} -eq 0 ]]; then
        printf "  (no tasks)\n"
        return
    fi

    for f in "${files[@]}"; do
        local basename
        basename=$(basename "$f")
        local id priority tier type
        id=$(get_frontmatter "$f" "id")
        priority=$(get_frontmatter "$f" "priority")
        tier=$(get_frontmatter "$f" "tier")
        type=$(get_frontmatter "$f" "type")
        # Extract title from first heading
        local title
        title=$(grep "^# " "$f" | head -1 | sed 's/^# //')
        printf "  %-20s %-4s %-8s %-10s %s\n" "$basename" "$tier" "$priority" "$type" "$title"
    done
}

if [[ "${1:-}" == "--all" ]]; then
    for phase in $BOARD_PHASES; do
        local_count=$(find "$BOARD_DIR/$phase" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)
        printf "\033[1m%s\033[0m (%d)\n" "$phase" "$local_count"
        list_phase "$phase"
        echo ""
    done
elif [[ -n "${1:-}" ]]; then
    # Validate phase
    FOUND=0
    for p in $BOARD_PHASES; do
        [[ "$p" == "$1" ]] && FOUND=1
    done
    if [[ $FOUND -eq 0 ]]; then
        sc_fail "Invalid phase: $1 (valid: $BOARD_PHASES)"
        exit 1
    fi

    local_count=$(find "$BOARD_DIR/$1" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)
    printf "\033[1m%s\033[0m (%d)\n" "$1" "$local_count"
    list_phase "$1"
else
    echo "Usage: board-list.sh <phase> | --all"
    echo "Phases: $BOARD_PHASES"
    exit 1
fi
```

Make executable: `chmod +x .superclaw/bin/board-list.sh`

- [ ] **Step 5: Implement board-status.sh**

Create `.superclaw/bin/board-status.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"

SC_ROOT=$(resolve_superclaw_root)
BOARD_DIR="$SC_ROOT/board"

TOTAL=0

printf "\033[1m%-15s %s\033[0m\n" "Phase" "Count"
printf "%-15s %s\n" "─────────────" "─────"

for phase in $BOARD_PHASES; do
    COUNT=$(find "$BOARD_DIR/$phase" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)
    TOTAL=$((TOTAL + COUNT))

    # Color coding: empty phases are dimmed, active phases are normal
    if [[ $COUNT -gt 0 ]]; then
        printf "%-15s %d\n" "$phase" "$COUNT"
    else
        printf "\033[2m%-15s %d\033[0m\n" "$phase" "$COUNT"
    fi
done

printf "%-15s %s\n" "─────────────" "─────"
printf "\033[1m%-15s %d\033[0m\n" "Total" "$TOTAL"
```

Make executable: `chmod +x .superclaw/bin/board-status.sh`

- [ ] **Step 6: Run tests to verify they pass**

Run: `bash tests/board/test-board-list.sh && bash tests/board/test-board-status.sh`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add .superclaw/bin/board-list.sh .superclaw/bin/board-status.sh tests/board/test-board-list.sh tests/board/test-board-status.sh
git commit -m "feat(board): add board-list.sh and board-status.sh with tests"
```

---

## Task 5: Lint Scripts (Component 7)

**Files:**
- Create: `.superclaw/lint/lint-task-file.sh`
- Create: `.superclaw/lint/lint-no-placeholder.sh`
- Create: `.superclaw/lint/lint-verify-required.sh`
- Create: `.superclaw/lint/lint-board-consistency.sh`
- Create: `.superclaw/lint/lint-tier-config.sh`
- Create: `.superclaw/lint/run-all.sh`
- Create: `tests/lint/test-lint-task-file.sh`
- Create: `tests/lint/test-lint-no-placeholder.sh`
- Create: `tests/lint/test-lint-verify-required.sh`
- Create: `tests/lint/test-lint-board-consistency.sh`
- Create: `tests/lint/test-lint-tier-config.sh`

- [ ] **Step 1: Write failing tests for lint-task-file.sh**

Create `tests/lint/test-lint-task-file.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/board/inbox"
mkdir -p "$TEST_DIR/.superclaw/bin"
mkdir -p "$TEST_DIR/.superclaw/lint"

cp "$REPO_ROOT/.superclaw/bin/_helpers.sh" "$TEST_DIR/.superclaw/bin/"
cp "$REPO_ROOT/.superclaw/lint/lint-task-file.sh" "$TEST_DIR/.superclaw/lint/"

export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
LINT="$TEST_DIR/.superclaw/lint/lint-task-file.sh"

echo "=== Testing lint-task-file.sh ==="
echo ""

# Test 1: Valid task file passes
cat > "$TEST_DIR/.superclaw/board/inbox/001-valid.md" << 'EOF'
---
id: "001"
slug: valid
created: 2026-04-05T10:00:00Z
updated: 2026-04-05T10:00:00Z
assignee: human
priority: high
type: feature
tier: T2
phase: inbox
blocked_reason: ""
parent: ""
spec_path: ""
plan_path: ""
---

# Valid Task
EOF

if $LINT 2>/dev/null; then
    pass "valid task passes lint"
else
    fail "valid task should pass lint"
fi

# Test 2: Missing required field fails
cat > "$TEST_DIR/.superclaw/board/inbox/002-missing.md" << 'EOF'
---
id: "002"
slug: missing
created: 2026-04-05T10:00:00Z
assignee: human
type: feature
phase: inbox
---

# Missing Fields
EOF

if $LINT 2>/dev/null; then
    fail "missing fields should fail lint"
else
    pass "missing fields fails lint"
fi

# Test 3: No frontmatter fails
cat > "$TEST_DIR/.superclaw/board/inbox/003-nofm.md" << 'EOF'
# No Frontmatter

Just a plain markdown file.
EOF

if $LINT 2>/dev/null; then
    fail "no frontmatter should fail lint"
else
    pass "no frontmatter fails lint"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 2: Write failing tests for remaining lint scripts**

Create `tests/lint/test-lint-no-placeholder.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/lint"
mkdir -p "$TEST_DIR/specs"

cp "$REPO_ROOT/.superclaw/lint/lint-no-placeholder.sh" "$TEST_DIR/.superclaw/lint/"

export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
LINT="$TEST_DIR/.superclaw/lint/lint-no-placeholder.sh"

echo "=== Testing lint-no-placeholder.sh ==="
echo ""

# Test 1: Clean spec passes
cat > "$TEST_DIR/specs/clean.md" << 'EOF'
# Clean Spec

## Description

This is a complete specification with real content.

## Acceptance Criteria

- Users can log in with email and password
EOF

if $LINT "$TEST_DIR/specs/clean.md" 2>/dev/null; then
    pass "clean spec passes"
else
    fail "clean spec should pass"
fi

# Test 2: TBD in spec fails
cat > "$TEST_DIR/specs/tbd.md" << 'EOF'
# Spec With TBD

## Description

The auth system will use TBD authentication method.
EOF

if $LINT "$TEST_DIR/specs/tbd.md" 2>/dev/null; then
    fail "TBD should fail"
else
    pass "TBD detected"
fi

# Test 3: TODO fails
cat > "$TEST_DIR/specs/todo.md" << 'EOF'
# Spec

## Description

TODO: fill in the description later.
EOF

if $LINT "$TEST_DIR/specs/todo.md" 2>/dev/null; then
    fail "TODO should fail"
else
    pass "TODO detected"
fi

# Test 4: "待定" (Chinese placeholder) fails
cat > "$TEST_DIR/specs/chinese.md" << 'EOF'
# Spec

## Description

认证方式待定。
EOF

if $LINT "$TEST_DIR/specs/chinese.md" 2>/dev/null; then
    fail "待定 should fail"
else
    pass "待定 detected"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

Create `tests/lint/test-lint-verify-required.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/board/planned"
mkdir -p "$TEST_DIR/.superclaw/bin"
mkdir -p "$TEST_DIR/.superclaw/lint"

cp "$REPO_ROOT/.superclaw/bin/_helpers.sh" "$TEST_DIR/.superclaw/bin/"
cp "$REPO_ROOT/.superclaw/lint/lint-verify-required.sh" "$TEST_DIR/.superclaw/lint/"

export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
LINT="$TEST_DIR/.superclaw/lint/lint-verify-required.sh"

echo "=== Testing lint-verify-required.sh ==="
echo ""

# Test 1: Task with verify section passes
cat > "$TEST_DIR/.superclaw/board/planned/001-good.md" << 'TASK'
---
id: "001"
slug: good
phase: planned
---

# Good Task

## Verify

```bash
npm test
# Expected: All tests pass
```
TASK

if $LINT 2>/dev/null; then
    pass "task with verify passes"
else
    fail "task with verify should pass"
fi

# Test 2: Task without verify fails
cat > "$TEST_DIR/.superclaw/board/planned/002-bad.md" << 'TASK'
---
id: "002"
slug: bad
phase: planned
---

# Bad Task

## Description

No verify section here.
TASK

if $LINT 2>/dev/null; then
    fail "task without verify should fail"
else
    pass "task without verify fails"
fi

# Test 3: Task with empty verify fails
cat > "$TEST_DIR/.superclaw/board/planned/003-empty.md" << 'TASK'
---
id: "003"
slug: empty
phase: planned
---

# Empty Verify

## Verify

## History
TASK

# Remove bad task to isolate this test
rm "$TEST_DIR/.superclaw/board/planned/002-bad.md"

if $LINT 2>/dev/null; then
    fail "empty verify should fail"
else
    pass "empty verify fails"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

Create `tests/lint/test-lint-board-consistency.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/board"/{inbox,aligning,planned,executing,reviewing,done,blocked}
mkdir -p "$TEST_DIR/.superclaw/bin"
mkdir -p "$TEST_DIR/.superclaw/lint"

cp "$REPO_ROOT/.superclaw/bin/_helpers.sh" "$TEST_DIR/.superclaw/bin/"
cp "$REPO_ROOT/.superclaw/lint/lint-board-consistency.sh" "$TEST_DIR/.superclaw/lint/"

export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
LINT="$TEST_DIR/.superclaw/lint/lint-board-consistency.sh"

echo "=== Testing lint-board-consistency.sh ==="
echo ""

# Test 1: Consistent state passes
cat > "$TEST_DIR/.superclaw/board/inbox/001-ok.md" << 'EOF'
---
id: "001"
phase: inbox
---
# OK
EOF

if $LINT 2>/dev/null; then
    pass "consistent state passes"
else
    fail "consistent state should pass"
fi

# Test 2: Inconsistent state fails (file in inbox but phase says planned)
cat > "$TEST_DIR/.superclaw/board/inbox/002-wrong.md" << 'EOF'
---
id: "002"
phase: planned
---
# Wrong Phase
EOF

if $LINT 2>/dev/null; then
    fail "inconsistent state should fail"
else
    pass "inconsistent state detected"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

Create `tests/lint/test-lint-tier-config.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/config/tiers"
mkdir -p "$TEST_DIR/.superclaw/lint"

cp "$REPO_ROOT/.superclaw/lint/lint-tier-config.sh" "$TEST_DIR/.superclaw/lint/"

export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
LINT="$TEST_DIR/.superclaw/lint/lint-tier-config.sh"

echo "=== Testing lint-tier-config.sh ==="
echo ""

# Test 1: Valid tier config passes
cat > "$TEST_DIR/.superclaw/config/tiers/t2.yaml" << 'EOF'
name: "T2 — Internal Tools"
description: "内部工具，基本检查"
checklist:
  - id: unit_test
    name: "单元测试"
    verify: "npm test"
    required: true
  - id: lint
    name: "代码 lint"
    verify: "npm run lint"
    required: true
EOF

if $LINT 2>/dev/null; then
    pass "valid tier config passes"
else
    fail "valid tier config should pass"
fi

# Test 2: Tier config missing name fails
cat > "$TEST_DIR/.superclaw/config/tiers/bad.yaml" << 'EOF'
description: "Missing name"
checklist:
  - id: test
    verify: "npm test"
    required: true
EOF

if $LINT 2>/dev/null; then
    fail "missing name should fail"
else
    pass "missing name detected"
fi

echo ""
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 3: Run all lint tests to verify they fail**

Run: `for f in tests/lint/test-lint-*.sh; do echo "--- $f ---"; bash "$f" 2>&1 || true; done`
Expected: All FAIL — lint scripts not found

- [ ] **Step 4: Implement lint-task-file.sh**

Create `.superclaw/lint/lint-task-file.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$(dirname "$SCRIPT_DIR")/bin/_helpers.sh"

SC_ROOT=$(resolve_superclaw_root)
BOARD_DIR="$SC_ROOT/board"
ERRORS=0

REQUIRED_FIELDS="id slug created updated assignee priority type tier phase"

# Find all task files across all phases
FILES=()
while IFS= read -r f; do
    FILES+=("$f")
done < <(find "$BOARD_DIR" -name "*.md" -type f 2>/dev/null)

if [[ ${#FILES[@]} -eq 0 ]]; then
    sc_ok "No task files to lint"
    exit 0
fi

for f in "${FILES[@]}"; do
    basename=$(basename "$f")

    # Check frontmatter exists
    if ! head -1 "$f" | grep -q "^---$"; then
        sc_fail "$basename: no frontmatter found"
        ((ERRORS++)) || true
        continue
    fi

    # Check required fields
    for field in $REQUIRED_FIELDS; do
        if ! sed -n '/^---$/,/^---$/p' "$f" | grep -q "^${field}:"; then
            sc_fail "$basename: missing required field '$field'"
            ((ERRORS++)) || true
        fi
    done
done

if [[ $ERRORS -eq 0 ]]; then
    sc_ok "All task files valid (${#FILES[@]} checked)"
    exit 0
else
    sc_fail "$ERRORS error(s) found"
    exit 1
fi
```

Make executable: `chmod +x .superclaw/lint/lint-task-file.sh`

- [ ] **Step 5: Implement lint-no-placeholder.sh**

Create `.superclaw/lint/lint-no-placeholder.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: lint-no-placeholder.sh [file...]
# If no files specified, checks all spec files in common locations.

ERRORS=0

PLACEHOLDER_PATTERNS=(
    "TBD"
    "TODO"
    "FIXME"
    "XXX"
    "HACK"
    "待定"
    "待补充"
    "待确认"
    "\.\.\."  # Three dots as placeholder (not in code blocks)
)

check_file() {
    local file="$1"
    local basename
    basename=$(basename "$file")
    local in_code_block=0

    while IFS= read -r line; do
        # Track code block state
        if [[ "$line" =~ ^\`\`\` ]]; then
            if [[ $in_code_block -eq 0 ]]; then
                in_code_block=1
            else
                in_code_block=0
            fi
            continue
        fi

        # Skip lines inside code blocks
        [[ $in_code_block -eq 1 ]] && continue

        for pattern in "${PLACEHOLDER_PATTERNS[@]}"; do
            if echo "$line" | grep -qiE "\b${pattern}\b"; then
                printf '  \033[1;31m❌\033[0m %s: placeholder found: %s\n' "$basename" "$line"
                ((ERRORS++)) || true
                break  # One error per line is enough
            fi
        done
    done < "$file"
}

if [[ $# -gt 0 ]]; then
    for f in "$@"; do
        check_file "$f"
    done
else
    # Default: check spec files linked from board tasks
    SC_ROOT=$(resolve_superclaw_root 2>/dev/null || echo "")
    if [[ -z "$SC_ROOT" ]]; then
        echo "No files specified and .superclaw not found"
        exit 1
    fi
    source "$(dirname "$0")/../bin/_helpers.sh"

    while IFS= read -r f; do
        SPEC=$(get_frontmatter "$f" "spec_path")
        if [[ -n "$SPEC" && -f "$SPEC" ]]; then
            check_file "$SPEC"
        fi
    done < <(find "$SC_ROOT/board" -name "*.md" -type f 2>/dev/null)
fi

if [[ $ERRORS -eq 0 ]]; then
    printf '  \033[1;32m✅\033[0m No placeholders found\n'
    exit 0
else
    printf '  \033[1;31m❌\033[0m %d placeholder(s) found\n' "$ERRORS"
    exit 1
fi
```

Make executable: `chmod +x .superclaw/lint/lint-no-placeholder.sh`

- [ ] **Step 6: Implement lint-verify-required.sh**

Create `.superclaw/lint/lint-verify-required.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$(dirname "$SCRIPT_DIR")/bin/_helpers.sh"

SC_ROOT=$(resolve_superclaw_root)
BOARD_DIR="$SC_ROOT/board"
ERRORS=0

# Check tasks that are past inbox (they should have verify sections)
# Inbox tasks are exempt since verify is defined during align
PHASES_TO_CHECK="aligning planned executing reviewing done blocked"

FILES=()
for phase in $PHASES_TO_CHECK; do
    while IFS= read -r f; do
        FILES+=("$f")
    done < <(find "$BOARD_DIR/$phase" -name "*.md" -type f 2>/dev/null)
done

if [[ ${#FILES[@]} -eq 0 ]]; then
    sc_ok "No task files to check for verify sections"
    exit 0
fi

for f in "${FILES[@]}"; do
    basename=$(basename "$f")

    # Check if ## Verify section exists
    if ! grep -q "^## Verify" "$f"; then
        sc_fail "$basename: missing ## Verify section"
        ((ERRORS++)) || true
        continue
    fi

    # Check if ## Verify has content (not just the heading)
    # Extract content between ## Verify and next ## heading
    VERIFY_CONTENT=$(sed -n '/^## Verify$/,/^## /{ /^## /d; p; }' "$f" | sed '/^$/d')
    if [[ -z "$VERIFY_CONTENT" ]]; then
        sc_fail "$basename: ## Verify section is empty"
        ((ERRORS++)) || true
    fi
done

if [[ $ERRORS -eq 0 ]]; then
    sc_ok "All tasks have verify sections (${#FILES[@]} checked)"
    exit 0
else
    sc_fail "$ERRORS error(s) found"
    exit 1
fi
```

Make executable: `chmod +x .superclaw/lint/lint-verify-required.sh`

- [ ] **Step 7: Implement lint-board-consistency.sh**

Create `.superclaw/lint/lint-board-consistency.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$(dirname "$SCRIPT_DIR")/bin/_helpers.sh"

SC_ROOT=$(resolve_superclaw_root)
BOARD_DIR="$SC_ROOT/board"
ERRORS=0

for phase in $BOARD_PHASES; do
    while IFS= read -r f; do
        basename=$(basename "$f")
        file_phase=$(get_frontmatter "$f" "phase")

        if [[ "$file_phase" != "$phase" ]]; then
            sc_fail "$basename: file is in $phase/ but phase field says '$file_phase'"
            ((ERRORS++)) || true
        fi
    done < <(find "$BOARD_DIR/$phase" -name "*.md" -type f 2>/dev/null)
done

if [[ $ERRORS -eq 0 ]]; then
    sc_ok "Board state is consistent"
    exit 0
else
    sc_fail "$ERRORS inconsistency(ies) found"
    exit 1
fi
```

Make executable: `chmod +x .superclaw/lint/lint-board-consistency.sh`

- [ ] **Step 8: Implement lint-tier-config.sh**

Create `.superclaw/lint/lint-tier-config.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SC_ROOT="${SUPERCLAW_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)/.superclaw}"
TIERS_DIR="$SC_ROOT/config/tiers"
ERRORS=0

sc_fail() { printf '  \033[1;31m❌\033[0m %s\n' "$1"; }
sc_ok()   { printf '  \033[1;32m✅\033[0m %s\n' "$1"; }

FILES=()
while IFS= read -r f; do
    FILES+=("$f")
done < <(find "$TIERS_DIR" -name "*.yaml" -o -name "*.yml" 2>/dev/null)

if [[ ${#FILES[@]} -eq 0 ]]; then
    sc_ok "No tier config files to lint"
    exit 0
fi

for f in "${FILES[@]}"; do
    basename=$(basename "$f")

    # Check required top-level fields
    if ! grep -q "^name:" "$f"; then
        sc_fail "$basename: missing 'name' field"
        ((ERRORS++)) || true
    fi

    if ! grep -q "^checklist:" "$f"; then
        sc_fail "$basename: missing 'checklist' field"
        ((ERRORS++)) || true
        continue
    fi

    # Check each checklist item has at minimum 'id' and 'required'
    # Simple check: look for '- id:' entries and verify they have 'required:'
    ITEM_COUNT=$(grep -c "^  - id:" "$f" || true)
    REQUIRED_COUNT=$(grep -c "required:" "$f" || true)

    if [[ $ITEM_COUNT -eq 0 ]]; then
        sc_fail "$basename: checklist has no items"
        ((ERRORS++)) || true
    fi

    # Each item should have 'name' field
    NAME_COUNT=$(grep -c "^    name:" "$f" || true)
    if [[ $NAME_COUNT -lt $ITEM_COUNT ]]; then
        sc_fail "$basename: some checklist items missing 'name' field"
        ((ERRORS++)) || true
    fi
done

if [[ $ERRORS -eq 0 ]]; then
    sc_ok "All tier configs valid (${#FILES[@]} checked)"
    exit 0
else
    sc_fail "$ERRORS error(s) found"
    exit 1
fi
```

Make executable: `chmod +x .superclaw/lint/lint-tier-config.sh`

- [ ] **Step 9: Implement run-all.sh**

Create `.superclaw/lint/run-all.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ERRORS=0

printf '\033[1m== SuperClaw Lint ==\033[0m\n\n'

run_lint() {
    local name="$1"
    local script="$2"
    shift 2

    printf '\033[1m%s\033[0m\n' "$name"
    if bash "$script" "$@" 2>&1; then
        :
    else
        ((ERRORS++)) || true
    fi
    echo ""
}

run_lint "Task File Schema"       "$SCRIPT_DIR/lint-task-file.sh"
run_lint "Board Consistency"      "$SCRIPT_DIR/lint-board-consistency.sh"
run_lint "Verify Required"        "$SCRIPT_DIR/lint-verify-required.sh"
run_lint "Tier Config"            "$SCRIPT_DIR/lint-tier-config.sh"
# lint-no-placeholder runs on explicit files, not auto-scanned

if [[ $ERRORS -eq 0 ]]; then
    printf '\033[1;32m✅ All lints passed\033[0m\n'
    exit 0
else
    printf '\033[1;31m❌ %d lint suite(s) failed\033[0m\n' "$ERRORS"
    exit 1
fi
```

Make executable: `chmod +x .superclaw/lint/run-all.sh`

- [ ] **Step 10: Run all lint tests to verify they pass**

Run: `for f in tests/lint/test-lint-*.sh; do echo "--- $f ---"; bash "$f"; done`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
git add .superclaw/lint/ tests/lint/
git commit -m "feat(lint): add constraint enforcement lint scripts with tests"
```

---

## Task 6: Integration Test + Test Runner Update

**Files:**
- Create: `tests/integration/test-board-lifecycle.sh`
- Modify: `tests/run-all.sh`

- [ ] **Step 1: Write integration test**

Create `tests/integration/test-board-lifecycle.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0; FAIL=0
pass() { ((PASS++)) || true; printf '  \033[1;32m✅\033[0m %s\n' "$1"; }
fail() { ((FAIL++)) || true; printf '  \033[1;31m❌\033[0m %s\n' "$1"; }

# Setup: create a complete temp .superclaw environment
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

mkdir -p "$TEST_DIR/.superclaw/board"/{inbox,aligning,planned,executing,reviewing,done,blocked}
mkdir -p "$TEST_DIR/.superclaw/config/tiers"
mkdir -p "$TEST_DIR/.superclaw/bin"
mkdir -p "$TEST_DIR/.superclaw/lint"

# Copy all scripts
cp "$REPO_ROOT/.superclaw/bin/"*.sh "$TEST_DIR/.superclaw/bin/"
cp "$REPO_ROOT/.superclaw/lint/"*.sh "$TEST_DIR/.superclaw/lint/"

cat > "$TEST_DIR/.superclaw/config/board.yaml" << 'YAML'
next_id: 1
default_tier: T2
default_priority: medium
YAML

# Create a tier config for T2
cat > "$TEST_DIR/.superclaw/config/tiers/t2.yaml" << 'YAML'
name: "T2 — Internal Tools"
description: "内部工具，基本检查"
checklist:
  - id: unit_test
    name: "单元测试"
    verify: "echo pass"
    required: true
YAML

export SUPERCLAW_ROOT="$TEST_DIR/.superclaw"
CREATE="$TEST_DIR/.superclaw/bin/board-create.sh"
MOVE="$TEST_DIR/.superclaw/bin/board-move.sh"
LIST="$TEST_DIR/.superclaw/bin/board-list.sh"
STATUS="$TEST_DIR/.superclaw/bin/board-status.sh"
LINT_ALL="$TEST_DIR/.superclaw/lint/run-all.sh"

echo "=== Integration Test: Board Lifecycle ==="
echo ""

# --- Phase 1: Create a task ---
echo "--- Create task ---"
$CREATE --title "Add dark mode" --type feature 2>&1
[[ -f "$TEST_DIR/.superclaw/board/inbox/001-add-dark-mode.md" ]] && pass "task created in inbox" || fail "task not created"

# --- Phase 2: Lint passes on valid state ---
echo ""
echo "--- Lint check (should pass) ---"
if $LINT_ALL 2>&1; then
    pass "lint passes on fresh board"
else
    fail "lint should pass on fresh board"
fi

# --- Phase 3: Move through lifecycle ---
echo ""
echo "--- Move inbox → aligning ---"
$MOVE 001-add-dark-mode.md inbox aligning "开始对齐" 2>&1
[[ -f "$TEST_DIR/.superclaw/board/aligning/001-add-dark-mode.md" ]] && pass "moved to aligning" || fail "not in aligning"

echo ""
echo "--- Move aligning → planned ---"
$MOVE 001-add-dark-mode.md aligning planned "spec approved" 2>&1
[[ -f "$TEST_DIR/.superclaw/board/planned/001-add-dark-mode.md" ]] && pass "moved to planned" || fail "not in planned"

echo ""
echo "--- Move planned → executing ---"
$MOVE 001-add-dark-mode.md planned executing "开始执行" 2>&1
[[ -f "$TEST_DIR/.superclaw/board/executing/001-add-dark-mode.md" ]] && pass "moved to executing" || fail "not in executing"

echo ""
echo "--- Move executing → reviewing ---"
$MOVE 001-add-dark-mode.md executing reviewing "执行完成" 2>&1
[[ -f "$TEST_DIR/.superclaw/board/reviewing/001-add-dark-mode.md" ]] && pass "moved to reviewing" || fail "not in reviewing"

echo ""
echo "--- Move reviewing → done ---"
$MOVE 001-add-dark-mode.md reviewing done "用户 approved" 2>&1
[[ -f "$TEST_DIR/.superclaw/board/done/001-add-dark-mode.md" ]] && pass "moved to done" || fail "not in done"

# --- Phase 4: Verify final state ---
echo ""
echo "--- Final state check ---"
source "$TEST_DIR/.superclaw/bin/_helpers.sh"
PHASE=$(get_frontmatter "$TEST_DIR/.superclaw/board/done/001-add-dark-mode.md" "phase")
[[ "$PHASE" == "done" ]] && pass "final phase is done" || fail "phase expected 'done', got '$PHASE'"

# Count history entries (should have at least 6: created + 5 moves)
HISTORY_LINES=$(grep "^|" "$TEST_DIR/.superclaw/board/done/001-add-dark-mode.md" | grep -v "^| Time" | grep -v "^|--" | wc -l)
[[ $HISTORY_LINES -ge 6 ]] && pass "history has $HISTORY_LINES entries (≥6)" || fail "history has $HISTORY_LINES entries (expected ≥6)"

# --- Phase 5: Board status ---
echo ""
echo "--- Board status ---"
OUTPUT=$($STATUS 2>&1)
echo "$OUTPUT" | grep -q "done" && pass "status shows done" || fail "status missing done"

# --- Phase 6: Lint on final state ---
echo ""
echo "--- Final lint check ---"
if $LINT_ALL 2>&1; then
    pass "lint passes on final state"
else
    fail "lint should pass on final state"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 2: Update tests/run-all.sh to include new suites**

Add the board and lint test suites to `tests/run-all.sh`. After the existing suites, add:

```bash
# Board tests
for test_file in "$SCRIPT_DIR"/board/test-*.sh; do
    [ -f "$test_file" ] || continue
    name=$(basename "$test_file" .sh | sed 's/^test-/board: /')
    run_suite "$name" "$test_file"
done

# Lint tests
for test_file in "$SCRIPT_DIR"/lint/test-*.sh; do
    [ -f "$test_file" ] || continue
    name=$(basename "$test_file" .sh | sed 's/^test-/lint: /')
    run_suite "$name" "$test_file"
done

# Integration tests
for test_file in "$SCRIPT_DIR"/integration/test-*.sh; do
    [ -f "$test_file" ] || continue
    name=$(basename "$test_file" .sh | sed 's/^test-/integration: /')
    run_suite "$name" "$test_file"
done
```

- [ ] **Step 3: Run the integration test**

Run: `bash tests/integration/test-board-lifecycle.sh`
Expected: All tests pass

- [ ] **Step 4: Run the full test suite**

Run: `bash tests/run-all.sh`
Expected: All suites pass (or existing suites skip gracefully)

- [ ] **Step 5: Commit**

```bash
git add tests/integration/test-board-lifecycle.sh tests/run-all.sh
git commit -m "test: add board lifecycle integration test and update test runner"
```

---

## Summary

| Task | Component | What it builds |
|------|-----------|----------------|
| 1 | Board (C1) | Directory structure, config, shared helpers |
| 2 | Board (C1) | board-create.sh — create tasks |
| 3 | Board (C1) | board-move.sh — move tasks between phases |
| 4 | Board (C1) | board-list.sh + board-status.sh — view board |
| 5 | Lint (C7) | 5 lint scripts + run-all.sh |
| 6 | Both | Integration test + test runner update |
