#!/usr/bin/env bash
# Test phase integration: full task lifecycle inbox → aligning → planned → executing → reviewing → done
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BIN_DIR="$REPO_ROOT/.superclaw/bin"

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

echo "🧪 Testing phase integration: full lifecycle"
echo ""

# ─── Setup: Create a mock .superclaw structure ────────────────────────────────

setup_board() {
  local root="$1"
  mkdir -p "$root/.superclaw/board/"{inbox,aligning,planned,executing,reviewing,done,blocked}
  mkdir -p "$root/.superclaw/config/tiers"
  mkdir -p "$root/.superclaw/context"
  cat > "$root/.superclaw/config/board.yaml" << 'EOF'
next_id: 1
default_tier: T2
default_priority: medium
EOF
}

# ─── Test 1: Create task in inbox ─────────────────────────────────────────────

echo "Test 1: Create task in inbox"

setup_board "$TMPDIR_TEST/t1"

output=$(SUPERCLAW_ROOT="$TMPDIR_TEST/t1/.superclaw" bash "$BIN_DIR/board-create.sh" \
  --title "Add dark mode" --type feature --assignee openclaw 2>&1)

task_file=$(ls "$TMPDIR_TEST/t1/.superclaw/board/inbox/"*.md 2>/dev/null | head -1)
if [[ -n "$task_file" ]] && grep -q 'phase: inbox' "$task_file"; then
  pass "Task created in inbox with correct phase"
else
  fail "Task creation failed"
fi

# ─── Test 2: Move inbox → aligning (align start) ────────────────────────────

echo "Test 2: Move inbox → aligning (align start)"

task_basename=$(basename "$task_file")

SUPERCLAW_ROOT="$TMPDIR_TEST/t1/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task_basename" inbox aligning "开始对齐" > /dev/null 2>&1

moved_file="$TMPDIR_TEST/t1/.superclaw/board/aligning/$task_basename"
if [[ -f "$moved_file" ]] && grep -q 'phase: aligning' "$moved_file"; then
  pass "Task moved to aligning with updated phase"
else
  fail "inbox → aligning move failed"
fi

# ─── Test 3: Update spec_path during align ─────────────────────────────────

echo "Test 3: Update spec_path in task file"

source "$BIN_DIR/_helpers.sh"
set_frontmatter "$moved_file" "spec_path" "docs/spec/add-dark-mode-spec.md"

spec_val=$(get_frontmatter "$moved_file" "spec_path")
if [[ "$spec_val" == "docs/spec/add-dark-mode-spec.md" ]]; then
  pass "spec_path updated in frontmatter"
else
  fail "spec_path update failed (got: $spec_val)"
fi

# ─── Test 4: Move aligning → planned (spec approved) ────────────────────────

echo "Test 4: Move aligning → planned (spec approved)"

SUPERCLAW_ROOT="$TMPDIR_TEST/t1/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task_basename" aligning planned "spec approved" > /dev/null 2>&1

planned_file="$TMPDIR_TEST/t1/.superclaw/board/planned/$task_basename"
if [[ -f "$planned_file" ]] && grep -q 'phase: planned' "$planned_file"; then
  pass "Task moved to planned"
else
  fail "aligning → planned move failed"
fi

# ─── Test 5: Update plan_path during plan phase ──────────────────────────────

echo "Test 5: Update plan_path in task file"

set_frontmatter "$planned_file" "plan_path" "docs/plans/add-dark-mode-plan.md"

plan_val=$(get_frontmatter "$planned_file" "plan_path")
if [[ "$plan_val" == "docs/plans/add-dark-mode-plan.md" ]]; then
  pass "plan_path updated in frontmatter"
else
  fail "plan_path update failed (got: $plan_val)"
fi

# ─── Test 6: Move planned → executing (execute start) ───────────────────────

echo "Test 6: Move planned → executing (execute start)"

SUPERCLAW_ROOT="$TMPDIR_TEST/t1/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task_basename" planned executing "开始执行" > /dev/null 2>&1

exec_file="$TMPDIR_TEST/t1/.superclaw/board/executing/$task_basename"
if [[ -f "$exec_file" ]] && grep -q 'phase: executing' "$exec_file"; then
  pass "Task moved to executing"
else
  fail "planned → executing move failed"
fi

# ─── Test 7: Move executing → reviewing (execute complete) ───────────────────

echo "Test 7: Move executing → reviewing (execute complete)"

SUPERCLAW_ROOT="$TMPDIR_TEST/t1/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task_basename" executing reviewing "执行完成" > /dev/null 2>&1

review_file="$TMPDIR_TEST/t1/.superclaw/board/reviewing/$task_basename"
if [[ -f "$review_file" ]] && grep -q 'phase: reviewing' "$review_file"; then
  pass "Task moved to reviewing"
else
  fail "executing → reviewing move failed"
fi

# ─── Test 8: Move reviewing → done (user approved) ─────────────────────────

echo "Test 8: Move reviewing → done (user approved)"

SUPERCLAW_ROOT="$TMPDIR_TEST/t1/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task_basename" reviewing done "用户 approved" > /dev/null 2>&1

done_file="$TMPDIR_TEST/t1/.superclaw/board/done/$task_basename"
if [[ -f "$done_file" ]] && grep -q 'phase: done' "$done_file"; then
  pass "Task moved to done"
else
  fail "reviewing → done move failed"
fi

# ─── Test 9: History trail is complete ──────────────────────────────────────

echo "Test 9: History trail tracks all phase transitions"

history_count=$(grep -c '| .* | .* | .* | .* |' "$done_file" | head -1)
# Should have: header separator + inbox (create) + aligning + planned + executing + reviewing + done = 7 lines with |
if [[ $history_count -ge 6 ]]; then
  pass "History trail has $history_count entries (expected >= 6)"
else
  fail "History trail incomplete: $history_count entries (expected >= 6)"
fi

# ─── Test 10: Board consistency check ─────────────────────────────────────────

echo "Test 10: Board consistency lint passes on completed board"

if SUPERCLAW_ROOT="$TMPDIR_TEST/t1/.superclaw" bash "$REPO_ROOT/.superclaw/lint/lint-board-consistency.sh" > /dev/null 2>&1; then
  pass "Board consistency lint passes"
else
  fail "Board consistency lint should pass after clean lifecycle"
fi

# ─── Test 11: Verify failure → back to executing ─────────────────────────────

echo "Test 11: Verify failure sends task back to executing"

setup_board "$TMPDIR_TEST/t11"

# Create and move to reviewing
SUPERCLAW_ROOT="$TMPDIR_TEST/t11/.superclaw" bash "$BIN_DIR/board-create.sh" \
  --title "Fix login bug" --type bug > /dev/null 2>&1
task11=$(ls "$TMPDIR_TEST/t11/.superclaw/board/inbox/"*.md | head -1 | xargs basename)

SUPERCLAW_ROOT="$TMPDIR_TEST/t11/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task11" inbox aligning "开始" > /dev/null 2>&1
SUPERCLAW_ROOT="$TMPDIR_TEST/t11/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task11" aligning planned "spec ok" > /dev/null 2>&1
SUPERCLAW_ROOT="$TMPDIR_TEST/t11/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task11" planned executing "go" > /dev/null 2>&1
SUPERCLAW_ROOT="$TMPDIR_TEST/t11/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task11" executing reviewing "done" > /dev/null 2>&1

# Verify fails → back to executing
SUPERCLAW_ROOT="$TMPDIR_TEST/t11/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task11" reviewing executing "验收不通过: 测试失败" > /dev/null 2>&1

if [[ -f "$TMPDIR_TEST/t11/.superclaw/board/executing/$task11" ]]; then
  pass "Task moved back to executing after verify failure"
else
  fail "Verify failure → executing move failed"
fi

# ─── Test 12: Blocked flow ──────────────────────────────────────────────────

echo "Test 12: Task can be moved to blocked with reason"

SUPERCLAW_ROOT="$TMPDIR_TEST/t11/.superclaw" bash "$BIN_DIR/board-move.sh" \
  "$task11" executing blocked "等待 API 部署" > /dev/null 2>&1

blocked_file="$TMPDIR_TEST/t11/.superclaw/board/blocked/$task11"
if [[ -f "$blocked_file" ]]; then
  reason=$(get_frontmatter "$blocked_file" "blocked_reason")
  if [[ -n "$reason" ]]; then
    pass "Task blocked with reason: $reason"
  else
    fail "Blocked reason not set"
  fi
else
  fail "executing → blocked move failed"
fi

# ─── Test 13: Context directory exists ───────────────────────────────────────

echo "Test 13: Context directory structure"

if [[ -d "$REPO_ROOT/.superclaw/context" ]]; then
  pass "Context directory exists"
else
  fail "Context directory missing"
fi

# ─── Test 14: Onboard skill exists ──────────────────────────────────────────

echo "Test 14: Onboard skill exists"

if [[ -f "$REPO_ROOT/skills/onboard/SKILL.md" ]]; then
  pass "Onboard SKILL.md exists"
else
  fail "Onboard SKILL.md missing"
fi

# ─── Test 15: run-all.sh lint runner ────────────────────────────────────────

echo "Test 15: run-all.sh lint runner works"

setup_board "$TMPDIR_TEST/t15"

if SUPERCLAW_ROOT="$TMPDIR_TEST/t15/.superclaw" bash "$REPO_ROOT/.superclaw/lint/run-all.sh" > /dev/null 2>&1; then
  pass "run-all.sh passes on empty board"
else
  fail "run-all.sh should pass on empty board"
fi

# ─── Results ────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || exit 1
