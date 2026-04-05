---
name: superclaw-verify
description: |
  SuperClaw Phase 4-L2: OpenClaw 独立验收。不信任 Claude Code 的自我声明，独立跑测试和检查。
  使用场景：execute 阶段完成，收到执行报告。
  终态：验收通过 → invoke deliver；不通过 → 回 execute 修复。
---

# SuperClaw: Verify

> Phase 4-L2 — OpenClaw 独立验收

Claude Code 说"做完了"不算数。OpenClaw 自己验，通过了才算。

**宣告：** "我在用 superclaw:verify 独立验收 Claude Code 的产出。不信任它的自我声明，我要自己跑测试。"

<HARD-GATE>
不信任 Claude Code 的执行报告。
所有验证必须独立执行，不依赖 CC 的输出声明。
</HARD-GATE>

## 前置条件

- execute 阶段已完成
- 有执行报告（task 状态、文件列表、concerns）
- 有 spec.md（验收标准来源）
- 有 plan.md（task 列表来源）

## Board Integration

> 以下 board 操作仅在 `.superclaw/board/` 存在时执行。没有 board 时 skill 正常运行。

| 时机 | Board 操作 | 命令 |
|------|-----------|------|
| 开始验收 | 读 reviewing 列任务 | 读任务文件 + spec + verify 命令 |
| 验收不通过 | 移回 executing | `board-move.sh {task} reviewing executing "验收不通过: ..."` |
| 验收通过 | 保持在 reviewing（等 deliver） | 更新 history |

### SuperClaw 自身 Lint

验收开始前，先运行 SuperClaw 自身的 lint 检查：

```bash
.superclaw/lint/run-all.sh  # 如果存在
```

lint 失败不阻塞验收，但会在报告中标记。

## 三级验收模型

| 级别 | 谁做 | 做什么 | 时机 |
|---|---|---|---|
| L1 | Claude Code（已完成） | TDD + self-review + 双阶段 review | execute 阶段内 |
| **L2** | **OpenClaw（本 skill）** | **独立测试 + spec 合规 + E2E** | **execute 完成后** |
| L3 | 人类（deliver skill） | 最终确认 | verify 通过后 |

## 流程

```
收到执行报告
  → 读取 spec（验收标准）+ plan（task 列表）+ concerns
  → L2 验收：
      ├─ 1. 跑现有测试（单元 + 集成）
      ├─ 2. Spec acceptance criteria 逐条检查
      ├─ 3. Concerns 重点检查
      ├─ 4. E2E 测试（如果可行）
      └─ 5. 代码质量抽检
  → 生成验证报告
  → 全部通过？
      ├─ yes → invoke deliver
      └─ no → 问题分类
          ├─ 可自动修 → 发修复指令给 CC → CC 修 → 重新 verify（循环）
          ├─ 需要人工决定 → 通知用户 → 用户决定
          └─ 严重问题 → 通知用户，建议回 plan 重新规划
```

## L2 验收步骤

### Step 1: 跑现有测试

```bash
# 在项目目录执行测试命令
# 具体命令从 plan.md 或项目配置中获取
cd <project-dir>

# 检测项目类型并跑测试
# Node.js: npm test / yarn test / pnpm test
# Python: pytest / python -m pytest
# Go: go test ./...
# Rust: cargo test
```

**判断：**
- 全部 PASS → 继续
- 有 FAIL → 记录，标记为问题

### Step 2: Spec Acceptance Criteria 逐条检查

对照 spec.md 的 Acceptance Criteria，逐条验证：

```markdown
## Acceptance Criteria 验证

- [x] 标准 1 — 验证方式：跑了 xxx 测试 / 读了 xxx 代码
- [ ] 标准 2 — ❌ 未满足，原因：...
- [x] 标准 3 — 验证方式：...
```

**方式：**
- 能跑测试的 → 跑测试
- 不能跑的 → 读代码确认
- 涉及 UI 的 → 启动服务 + 截图（如果可行）

### Step 3: Concerns 重点检查

Claude Code 执行报告中的 DONE_WITH_CONCERNS 和 concerns 列表，逐条检查：

```markdown
## Concerns 检查

- Concern 1: "Task 3 的错误处理可能不够完善"
  → 检查结果：确实缺少 xxx 场景的处理 → 标记为需修复
- Concern 2: "Task 7 的性能可能有问题"
  → 检查结果：可接受，不影响功能 → 记录但不阻塞
```

### Step 4: E2E 测试（如果可行）

如果项目支持 E2E：
1. 从 spec 的 User Stories 推导出关键用户路径
2. 启动服务
3. 模拟用户操作
4. 验证结果

如果不支持 E2E（CLI 工具、库等）：
- 跳过，在报告中说明

### Step 5: 代码质量抽检

不需要逐行审查（L1 的 code-quality-reviewer 已经做了），但抽检：

- 新增文件的大小是否合理（单文件不超过 500 行）
- 有没有明显的 TODO/FIXME 遗留
- 关键路径的错误处理是否完整
- 类型安全（TypeScript 项目：有没有 any 泛滥）

## 验证报告格式

```markdown
# SuperClaw 验证报告

**Feature:** [名称]
**Date:** YYYY-MM-DD HH:MM
**Verdict:** ✅ PASS / ❌ FAIL / ⚠️ PASS_WITH_NOTES

## 测试结果
- 单元测试：XX/XX 通过
- 集成测试：XX/XX 通过
- E2E 测试：XX/XX 通过（或 N/A）

## Acceptance Criteria
- [x] 标准 1 — ✅
- [ ] 标准 2 — ❌ 原因：...
...

## Concerns 检查
- Concern 1 — ✅ 已确认无问题 / ❌ 需修复
...

## 代码质量
- 新增文件数：N
- 修改文件数：N
- 测试覆盖：简述
- 注意事项：...

## 问题列表（如果有）

### Critical（必须修）
- ...

### Important（应该修）
- ...

### Minor（可以后面修）
- ...

## 结论
[PASS → 进入 deliver / FAIL → 需要修复]
```

## 处理不通过

### 可自动修复的问题

```
OpenClaw → cc-delegate session continue:
"验收发现以下问题，请修复：
1. [问题描述 + 预期行为]
2. [问题描述 + 预期行为]

修复后跑一遍测试确认。"
```

CC 修完后 → 重新走 verify（完整流程，不只是检查修复的部分）

### 需要人工决定的问题

通知用户：
```
⚠️ SuperClaw 验收发现问题

有 2 个问题需要你决定：
1. [问题] — 我的建议：...
2. [问题] — 我的建议：...

你要怎么处理？
```

### 严重问题

通知用户：
```
❌ SuperClaw 验收未通过

发现严重问题，建议回到 plan 阶段重新规划：
- [问题]

要回到 plan 还是尝试修复？
```

## 飞书通知

验收完成时通知：

```
✅ SuperClaw 验收通过

📊 测试：全部通过
📋 Acceptance Criteria：10/10
⚠️ 注意事项：2 条（非阻塞）

准备进入最终交付...
```

或：

```
❌ SuperClaw 验收未通过

📊 测试：2 个失败
📋 Acceptance Criteria：8/10
🔴 Critical 问题：1 个

需要你的决定...
```

## 终态

- **PASS / PASS_WITH_NOTES** → invoke `superclaw:deliver`
- **FAIL（可修）** → 发修复指令 → CC 修 → 重新 verify（循环）
- **FAIL（严重）** → 通知用户，等用户决定

## Anti-Pattern

❌ 信任 CC 说的"测试全过了" — 自己跑
❌ 只检查修复的部分 — 每次 verify 都走完整流程
❌ 把技术问题直接甩给用户 — OpenClaw 先判断能不能自动修
❌ 验收报告含糊其辞 — 每条标准都要有明确的 ✅/❌
