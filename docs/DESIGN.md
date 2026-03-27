# SuperClaw Design Document

> OpenClaw + Claude Code 的超级编码体。  
> 人管方向，OpenClaw 管对齐和验收，Claude Code 管执行。

---

## 1. 核心理念

**二层架构：**

```
用户 ↔ OpenClaw（产品脑 + 验收脑）
         ↔
      Claude Code（技术脑 + 执行脑）
```

与现有方案（Superpowers / gstack / mattpocock）的核心区别：

- **他们**：人直接跟 Claude Code 说话
- **我们**：人跟 OpenClaw 说话，OpenClaw 跟 Claude Code 说话

好处：
1. 用户不需要懂技术细节
2. Claude Code 拿到的是已经对齐过的明确 spec
3. OpenClaw 独立验收，不信任 Claude Code 的自我声明
4. 三级验收保证质量

---

## 2. 完整工作流

### 总览

```
人 →[align]→ spec → 人 approve
  →[plan]→ plan → 人 approve（可跳过）
  →[execute]→ Claude Code 自治（subagent-driven）
  → CC 自验 →[verify]→ OpenClaw 独立验收
  →[deliver]→ 人最终验收
```

### 分支设计原则

借鉴 Superpowers 的模式，每个 skill 的分支遵循三种类型：

| 分支类型 | 处理方式 | 例子 |
|---|---|---|
| **循环分支** | 不满足条件就在当前 skill 内转圈，直到满足 | 用户不 approve → 继续修改展示 |
| **选择分支** | 给用户/上游明确选项 | plan 完成后选执行方式 |
| **状态分支** | 根据执行结果走不同路径 | Claude Code 报告 DONE/BLOCKED 各自处理 |

**核心规则：**
- 每个 skill 只有少数几个明确终态
- "继续"不是分支，是循环
- HARD GATE 防止跳阶
- 每个 skill 用流程图标注所有分支点

---

### Phase 1: ALIGN — 产品对齐

**参与者：** 人 ↔ OpenClaw  
**Skill：** `align`  
**借鉴：** Superpowers brainstorming + gstack office-hours + mattpocock grill-me

**流程图：**

```
                    ┌──────────────┐
                    │  用户提出需求  │
                    └──────┬───────┘
                           ▼
                   ┌───────────────┐
                   │ 探索项目上下文  │
                   └──────┬────────┘
                          ▼
               ┌─────────────────────┐
               │ 问澄清问题（一次一问）│◄─────────┐
               └──────────┬──────────┘          │
                          ▼                     │
               ┌─────────────────────┐          │
               │ 提出 2-3 方案 + 推荐  │          │
               └──────────┬──────────┘          │
                          ▼                     │
               ┌─────────────────────┐          │
               │ 逐部分展示设计       │          │
               └──────────┬──────────┘          │
                          ▼                     │
                  ◇ 用户 approve？               │
                 ╱                ╲              │
               no                 yes           │
               │                   │            │
               │                   ▼            │
               │          ┌──────────────┐      │
               │          │ 写 spec.md    │      │
               │          └──────┬───────┘      │
               │                 ▼              │
               │         ◇ 用户 review spec？    │
               │        ╱                ╲      │
               │      要改              approved │
               │       │                  │     │
               └───────┼──────────────────┘     │
                       │                        │
                       └────────────────────────┘
                                  │
                            approved ▼
                     ┌─────────────────────┐
                     │ 终态：invoke [plan]   │
                     └─────────────────────┘
```

**过程：**
1. 用户提出需求（一句话、一段描述、一个链接都行）
2. OpenClaw 深度脑暴：
   - 一次只问一个问题
   - 优先多选题，降低认知负担
   - 先问"为什么要做"，再问"要做什么"
   - 探索完后，提出 2-3 个方案 + 推荐
   - 逐部分呈现设计，每部分确认后再往下
3. 用户 approve → 写 spec → 用户 review spec
4. spec approved → 唯一出口：invoke plan

**输出物：** `spec.md`

```markdown
# [Feature Name] Spec

## Problem Statement
为什么要做这个？解决什么问题？

## User Stories
1. As a <actor>, I want <feature>, so that <benefit>
...

## Architecture Direction
- 技术栈选择
- 大致分层
- 关键技术决策

## Functional Scope
### In Scope
- ...
### Out of Scope
- ...

## Acceptance Criteria
怎样算"做完了"？
- [ ] 标准 1
- [ ] 标准 2
...
```

**HARD GATE：** 没有用户 approve 的 spec，绝不进入下一阶段。

**终态：** 唯一出口 → invoke `plan`

---

### Phase 2: PLAN — 技术对齐

**参与者：** OpenClaw ↔ Claude Code（人可选介入）  
**Skill：** `plan`  
**借鉴：** Superpowers writing-plans + mattpocock prd-to-plan

**流程图：**

```
              ┌────────────────────────────┐
              │  收到 spec.md + 项目代码上下文 │
              └─────────────┬──────────────┘
                            ▼
              ┌────────────────────────────┐
              │ OpenClaw 把 spec 交给        │
              │ Claude Code 探索代码库       │◄──────┐
              └─────────────┬──────────────┘       │
                            ▼                      │
              ┌────────────────────────────┐       │
              │ Claude Code 出 plan 草案     │       │
              └─────────────┬──────────────┘       │
                            ▼                      │
              ┌────────────────────────────┐       │
              │ OpenClaw review plan：       │       │
              │ - spec 覆盖度               │       │
              │ - task 粒度                 │       │
              │ - 依赖关系                  │       │
              └─────────────┬──────────────┘       │
                            ▼                      │
                    ◇ OpenClaw 满意？               │
                   ╱              ╲                │
                 no               yes              │
                 │                 │               │
                 │                 ▼               │
                 │    ◇ 呈现给人类 review？          │
                 │   ╱        │        ╲           │
                 │ 摘要给人  跳过     完整 plan     │
                 │  │         │          │         │
                 │  ▼         │          ▼         │
                 │ 人看摘要   │       人看完整 plan  │
                 │  │         │          │         │
                 │  ▼         │          ▼         │
                 │ ◇人满意？  │      ◇ 人满意？     │
                 │ ╱    ╲     │      ╱      ╲      │
                 │no    yes   │    no       yes    │
                 │ │     │    │     │         │    │
                 └─┼─────┼────┼─────┘         │    │
                   │     │    │               │    │
                   └─────┘    │               │    │
                              ▼               ▼    │
                    ┌──────────────────────────┐   │
                    │  plan.md 确认完成          │   │
                    └────────────┬─────────────┘   │
                                 ▼                 │
                      ◇ 选择执行方式？               │
                     ╱         │        ╲          │
              subagent     inline     重新规划      │
              （推荐）      执行                     │
                │            │          │          │
                ▼            ▼          └──────────┘
         ┌───────────┐ ┌───────────┐
         │ 终态 A：    │ │ 终态 B：   │
         │ invoke     │ │ invoke    │
         │ execute    │ │ execute   │
         │(subagent)  │ │(inline)   │
         └───────────┘ └───────────┘
```

**过程：**
1. OpenClaw 把 spec + 项目代码上下文交给 Claude Code
2. Claude Code 探索代码库，出 plan 草案
3. OpenClaw review plan（循环，直到满意）
4. 人类检查点（三个选项）：
   - **摘要给人 review**：OpenClaw 总结 plan 要点给用户看
   - **完整 plan 给人看**：用户看完整技术细节
   - **跳过**：用户说"你们定就行"
5. 选择执行方式：
   - **subagent-driven**（推荐）：Claude Code 用 subagent 逐 task 执行
   - **inline 执行**：Claude Code 在同一 session 内顺序执行
   - **重新规划**：回到步骤 1 重做

**输出物：** `plan.md`

```markdown
# [Feature Name] Implementation Plan

> **执行方式：** 使用 subagent-driven-development 逐 task 执行

**Goal:** 一句话目标
**Architecture:** 2-3 句方案概述
**Tech Stack:** 关键技术

---

### Task 1: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py`
- Test: `tests/exact/path/to/test.py`

**Steps:**
- [ ] Step 1: Write failing test
- [ ] Step 2: Run test, verify fail
- [ ] Step 3: Implement
- [ ] Step 4: Run test, verify pass
- [ ] Step 5: Commit

### Task 2: ...
```

**Plan 质量规则（来自 Superpowers writing-plans）：**
- 每个 step 是一个 2-5 分钟的动作
- 完整代码，不留占位符
- 精确文件路径
- 精确命令 + 预期输出
- DRY / YAGNI / TDD

**终态：** invoke `execute`（带执行模式参数）

---

### Phase 3: EXECUTE — Claude Code 自治执行

**参与者：** Claude Code（OpenClaw 只发起不微操）  
**Skill：** `execute`（OpenClaw 侧）+ Superpowers skills（Claude Code 侧）  
**借鉴：** Superpowers subagent-driven-development + executing-plans

**流程图：**

```
          ┌──────────────────────────┐
          │ 收到 plan.md + 执行模式    │
          └────────────┬─────────────┘
                       ▼
          ┌──────────────────────────┐
          │ cc-delegate 启动          │
          │ Claude Code session       │
          │ 注入 plan + skills        │
          └────────────┬─────────────┘
                       ▼
     ┌─────────────────────────────────────┐
     │        Claude Code 自治区域           │
     │                                     │
     │  ◇ 执行模式？                        │
     │  ╱               ╲                  │
     │ subagent        inline              │
     │  │                │                 │
     │  ▼                ▼                 │
     │ ┌────────┐  ┌──────────┐           │
     │ │per task│  │ 顺序执行  │           │
     │ │启subagt│  │ 同session │           │
     │ └───┬────┘  └────┬─────┘           │
     │     │             │                 │
     │     ▼             ▼                 │
     │  ┌─────────────────────┐           │
     │  │ 每个 task：           │◄────┐    │
     │  │  TDD 红→绿→重构→commit│     │    │
     │  │  self-review         │     │    │
     │  └──────────┬──────────┘     │    │
     │             ▼                │    │
     │     ◇ task 状态？            │    │
     │    ╱    │     │    ╲         │    │
     │ DONE  DONE   NEEDS  BLOCKED │    │
     │  │    _WITH   _CTX    │     │    │
     │  │   CONCERNS  │     │     │    │
     │  │      │      │     ▼     │    │
     │  │      │      │  ◇评估：   │    │
     │  │      │      │  ╱│ │╲   │    │
     │  │      │      │ 补上下文   │    │
     │  │      │      │  │换模型   │    │
     │  │      │      │  │ 拆task  │    │
     │  │      │      │  │  │报人  │    │
     │  │      │      │  │  │ │   │    │
     │  │      ▼      ▼  ▼  ▼ │   │    │
     │  │   评估担忧→处理 ──────┘   │    │
     │  │      │                  │    │
     │  ▼      ▼                  │    │
     │  spec compliance review    │    │
     │     ◇ 通过？               │    │
     │    ╱        ╲              │    │
     │  no          yes           │    │
     │  │            │            │    │
     │  │            ▼            │    │
     │  │   code quality review   │    │
     │  │      ◇ 通过？           │    │
     │  │     ╱        ╲         │    │
     │  │   no          yes      │    │
     │  │    │           │       │    │
     │  ▼    ▼           ▼       │    │
     │  修复 → 重新 review  标记完成 │    │
     │                    │      │    │
     │                    ▼      │    │
     │            ◇ 还有 task？   │    │
     │           ╱          ╲    │    │
     │         yes           no  │    │
     │          │             │  │    │
     │          └─────────────┘  │    │
     │                    │          │
     │                    ▼          │
     │    verification-before-complete│
     │         全局最终检查            │
     └─────────────┬───────────────┘
                   │
                   ▼
          ◇ Claude Code 报告状态？
         ╱         │          ╲
      SUCCESS   PARTIAL     FAILED
        │          │           │
        ▼          ▼           ▼
    invoke      invoke      报告问题
    verify      verify      → 人介入
               (附带问题清单)
```

**OpenClaw 角色：** 发起指令 + 等待结果。不做逐 task 微操。

**Claude Code 内部直接复用 Superpowers（不改造、不 fork，原样使用）：**

| Skill | 做什么 | 为什么不改 |
|---|---|---|
| `subagent-driven-development` | 逐 task 派 subagent + 双阶段 review | 核心执行引擎，经过大量实战验证 |
| `test-driven-development` | 红绿灯开发 | TDD 流程标准化 |
| `verification-before-completion` | "没跑过不准说完了" | 质量铁律 |
| `executing-plans` | inline 模式下的顺序执行 | 备选执行路径 |
| `writing-plans` | spec → 带 task list 的 plan.md | plan 格式已经是 subagent-driven 友好的 |
| `using-superpowers` | session 启动时 skill 路由 | 确保 CC 正确加载和调用 skill |
| `using-git-worktrees` | 隔离工作区 | 防止 feature 分支污染 |
| `finishing-a-development-branch` | 完成后 merge/PR/保留/丢弃 | 收尾标准化 |
| `systematic-debugging` | 遇 bug 时的系统化排查 | 不瞎猜 |
| `requesting-code-review` | 代码审查模板 | reviewer subagent 用 |
| `receiving-code-review` | 收到 review 后的处理 | 不盲目接受反馈 |

**Superpowers 内置的三个 prompt 模板也直接复用：**

| 模板 | 用在哪里 | 核心设计 |
|---|---|---|
| `implementer-prompt.md` | 派发给实现 subagent | 含自审清单 + 4种状态上报（DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED）|
| `spec-reviewer-prompt.md` | spec 合规 review | "不信任 implementer 的报告，自己读代码验证" |
| `code-quality-reviewer-prompt.md` | 代码质量 review | 基于 requesting-code-review 模板 + 文件职责检查 |

**Superpowers 的 agents 也直接复用：**

| Agent | 做什么 |
|---|---|
| `code-reviewer.md` | Senior Code Reviewer，6维审查（plan对齐/代码质量/架构设计/文档标准/问题分级/沟通协议）|

**Superpowers 的 hooks 也直接复用：**

| Hook | 做什么 |
|---|---|
| `hooks.json` + `session-start` | SessionStart 时注入 using-superpowers skill，确保所有 skill 正确路由 |

**SuperClaw 只在 Superpowers 之上添加：**
1. `superclaw-notify.sh` — Stop hook → 飞书通知 + 触发 OpenClaw verify
2. `superclaw-progress.sh` — PostToolUse hook → 记录进度日志

**终态：** invoke `verify`（带执行结果）

---

### Phase 4: VERIFY — 三级验收

**借鉴：** Superpowers verification-before-completion + gstack /qa

**流程图：**

```
          ┌───────────────────────┐
          │ 收到 execute 结果      │
          └───────────┬───────────┘
                      ▼
     ═══════════════════════════════
     ║  L1: Claude Code 自验        ║
     ║  （Phase 3 中已完成）         ║
     ║  - TDD 全过                  ║
     ║  - spec review ✅            ║
     ║  - quality review ✅         ║
     ═══════════════════════════════
                      │
                      ▼
     ┌────────────────────────────┐
     │ L2: OpenClaw 独立验收       │
     │                            │◄─────────┐
     │ 1. 独立跑测试套件           │          │
     │ 2. agent-browser E2E       │          │
     │ 3. 截图取证                 │          │
     └─────────────┬──────────────┘          │
                   ▼                         │
           ◇ L2 通过？                       │
          ╱            ╲                     │
        no              yes                  │
        │                │                   │
        ▼                │                   │
  ┌───────────────┐      │                   │
  │ 生成修复指令    │      │                   │
  │ → 回 execute  │      │                   │
  └───────┬───────┘      │                   │
          │              │                   │
          ▼              │                   │
   Claude Code 修复      │                   │
          │              │                   │
          └──────────────┼───────────────────┘
                         │
                         ▼
          ┌────────────────────────────┐
          │ L3: 人类最终验收             │
          │                            │
          │ 交付报告：                   │
          │ - 做了什么                   │
          │ - 变更清单                   │
          │ - 测试结果 + 截图            │
          │ - 已知限制                   │
          │ - 下一步建议                 │
          └─────────────┬──────────────┘
                        ▼
                ◇ 人类判断？
               ╱     │      ╲
           approve  要调整   丢弃
              │       │       │
              ▼       ▼       ▼
          ┌──────┐  回到    ┌──────┐
          │完成 🎉│ plan    │ 终止  │
          └──────┘ 或exec  └──────┘
```

#### Level 1: Claude Code 自验（Phase 3 中已完成）

- TDD 测试全过
- spec compliance review ✅
- code quality review ✅
- verification-before-completion 铁律执行

#### Level 2: OpenClaw 独立验收

**Skill：** `verify`

OpenClaw **不信任** Claude Code 说的"全部通过"，独立验证：

1. **TDD 验证：** 自己跑一遍测试套件
2. **E2E 验证：** 用 agent-browser 做端到端测试
   - 启动服务
   - 打开关键页面
   - 走主要用户路径
   - 检查功能是否正常
3. **截图取证：** 关键页面截图保存

**验证铁律（来自 Superpowers）：**
> 没有跑过验证命令的结果，不准说"完成了"。
> "should pass"、"looks correct" 都不算。
> 只有命令输出 + exit code 才算。

**不通过？** 生成修复指令 → 回 Phase 3 → 修完再验（循环）

#### Level 3: 人类最终验收

**Skill：** `deliver`

OpenClaw 把完整结果呈现给用户：

```markdown
## 交付报告

### 做了什么
- 简要描述完成的功能

### 变更清单
- 新增文件：...
- 修改文件：...

### 测试结果
- 单元测试：X/X 通过
- E2E 测试：X/X 通过
- [截图]

### 已知限制
- ...

### 下一步建议
- ...
```

**人类三个选项：**
- **approve** → 完成 🎉
- **要调整** → 反馈 → 回 Phase 2（plan 有问题）或 Phase 3（实现有问题）
- **丢弃** → 终止

---

## 3. 全局流程图

```
┌──────┐
│ 用户  │
└──┬───┘
   │ 需求
   ▼
╔══════════════════════════════════════════════════════════╗
║                    Phase 1: ALIGN                       ║
║                                                         ║
║  探索上下文 → 一次一问 → 2-3方案 → 展示设计               ║
║       ◇ 用户approve？                                   ║
║      ╱              ╲                                   ║
║    no (循环)         yes → 写spec → 用户review           ║
║                            ◇ approved？                 ║
║                           ╱           ╲                 ║
║                         要改(循环)    approved            ║
╚═══════════════════════════════╪══════════════════════════╝
                                │ spec.md
                                ▼
╔══════════════════════════════════════════════════════════╗
║                    Phase 2: PLAN                        ║
║                                                         ║
║  OpenClaw ↔ Claude Code 技术对齐                         ║
║  CC 探索代码 → 出plan草案 → OpenClaw review               ║
║       ◇ OpenClaw 满意？                                  ║
║      ╱              ╲                                   ║
║    no (循环)         yes                                 ║
║                      │                                  ║
║              ◇ 人类 review？                             ║
║             ╱      │       ╲                            ║
║          摘要    跳过    完整plan                         ║
║            │      │        │                            ║
║            ▼      │        ▼                            ║
║        人看摘要   │    人看完整plan                       ║
║         ◇ok？    │      ◇ok？                           ║
║        ╱   ╲    │     ╱    ╲                           ║
║      no   yes   │   no    yes                          ║
║       │    │    │    │      │                           ║
║       └──(循环) │    └──(循环)                           ║
║            │    │           │                           ║
║            ▼    ▼           ▼                           ║
║         ◇ 选择执行方式？                                 ║
║        ╱        │         ╲                             ║
║   subagent   inline    重新规划(循环)                     ║
╚═══════╪════════╪══════════════════════════════════════════╝
        │        │
        ▼        ▼
╔══════════════════════════════════════════════════════════╗
║                   Phase 3: EXECUTE                      ║
║                                                         ║
║  ┌─────────────────────────────────────────┐            ║
║  │         Claude Code 自治区域              │            ║
║  │                                         │            ║
║  │  每个task: TDD → self-review → commit   │            ║
║  │     ◇ 状态？                             │            ║
║  │    DONE → spec review → quality review  │            ║
║  │    BLOCKED → 评估 → 补上下文/换模型/报人   │            ║
║  │    NEEDS_CTX → 补上下文 → 重试            │            ║
║  │                                         │            ║
║  │  全部完成 → verification-before-complete  │            ║
║  └───────────────────┬─────────────────────┘            ║
║                      │                                  ║
║              ◇ CC 报告？                                 ║
║             ╱     │       ╲                             ║
║         SUCCESS PARTIAL  FAILED→人介入                   ║
╚═══════════╪═══════╪════════════════════════════════════════╝
            │       │
            ▼       ▼
╔══════════════════════════════════════════════════════════╗
║                   Phase 4: VERIFY                       ║
║                                                         ║
║  L1: CC自验 ✅（Phase 3 已完成）                          ║
║                                                         ║
║  L2: OpenClaw 独立验收                                   ║
║      跑测试 + agent-browser E2E + 截图                   ║
║       ◇ 通过？                                          ║
║      ╱        ╲                                         ║
║    no          yes                                      ║
║    │            │                                       ║
║    ▼            │                                       ║
║  修复指令        │                                       ║
║  →回Phase3      │                                       ║
║  (循环)         │                                       ║
║                 ▼                                       ║
║  L3: 人类最终验收                                        ║
║      交付报告 → 人判断                                    ║
║       ◇ 结果？                                          ║
║      ╱     │      ╲                                    ║
║  approve 要调整   丢弃                                   ║
║     │      │       │                                    ║
║     ▼      ▼       ▼                                    ║
║   完成🎉  回P2/P3  终止                                  ║
╚══════════════════════════════════════════════════════════╝
```

---

## 4. Skill 架构

### 目录结构

```
superclaw/
├── README.md
├── DESIGN.md                    # 本文件
│
├── skills/             # OpenClaw 侧 Skills
│   ├── align/
│   │   └── SKILL.md             # Phase 1: 产品对齐
│   ├── plan/
│   │   └── SKILL.md             # Phase 2: 技术对齐
│   ├── execute/
│   │   └── SKILL.md             # Phase 3: 发起执行
│   ├── verify/
│   │   └── SKILL.md             # Phase 4-L2: OpenClaw 验收
│   └── deliver/
│       └── SKILL.md             # Phase 4-L3: 人类验收交付
│
├── docs/                           # 文档 = 直接装 Superpowers
│   └── README.md               # 说明：直接安装 Superpowers，不 fork
│                                # SuperClaw 只在 hooks/ 里添加通知脚本
│
├── protocol/                    # 双端通信协议
│   ├── spec-format.md           # spec.md 格式规范
│   ├── plan-format.md           # plan.md 格式规范
│   └── status-report.md         # Claude Code → OpenClaw 状态格式
│
├── cc-delegate/                 # OpenClaw → Claude Code 桥接
│   ├── cc-delegate.mjs
│   ├── setup.sh
│   └── .env.example
│
├── hooks/                       # Claude Code 原生 hooks（10%）
│   ├── superclaw-notify.sh      # Stop → 飞书通知 + 触发 OpenClaw verify
│   ├── superclaw-progress.sh    # PostToolUse → 记录进度日志
│   ├── superclaw-session-start.sh # SessionStart → 注入上下文 + plan
│   └── settings.json.example    # Claude Code hooks 配置示例
│
└── examples/
    └── hello-world/             # 端到端示例
```

### Skill 清单

**OpenClaw 侧（5 个 skill）：**

| Skill | Phase | 输入 | 输出 | 分支模式 |
|---|---|---|---|---|
| `align` | 1 | 用户需求 | spec.md | 循环（不approve就转圈）→ 唯一终态：plan |
| `plan` | 2 | spec.md + 代码 | plan.md | 循环 + 选择（3种review方式 + 3种执行方式）|
| `execute` | 3 | plan.md | 执行结果 | 状态分支（SUCCESS/PARTIAL/FAILED）|
| `verify` | 4-L2 | 代码产出 | 验证报告 | 循环（不通过→修→再验）|
| `deliver` | 4-L3 | 验证报告 | 交付报告 | 选择（approve/调整/丢弃）|

**Claude Code 侧（直接安装 Superpowers，不 fork 不改造）：**

安装方式：Claude Code plugin marketplace 安装 superpowers，或 `git clone --depth 1 https://github.com/obra/superpowers.git ~/.claude/skills/superpowers`

直接复用的 Superpowers 资产：

| 类型 | 数量 | 列表 |
|---|---|---|
| Skills | 11 个 | subagent-driven-development, writing-plans, executing-plans, test-driven-development, verification-before-completion, using-superpowers, using-git-worktrees, finishing-a-development-branch, systematic-debugging, requesting-code-review, receiving-code-review |
| Prompt 模板 | 3 个 | implementer-prompt.md, spec-reviewer-prompt.md, code-quality-reviewer-prompt.md |
| Agents | 1 个 | code-reviewer.md（Senior Code Reviewer） |
| Hooks | 1 个 | SessionStart → 注入 using-superpowers |
| Commands | 2 个 | write-plan.md, execute-plan.md |

**不复用的 Superpowers 资产（由 SuperClaw OpenClaw 侧替代）：**

| 不用 | 原因 |
|---|---|
| `brainstorming` | SuperClaw 的 `align` skill 替代（OpenClaw 侧做，不在 CC 里做） |
| `writing-skills` | 不需要在 CC 里写 skill |
| `dispatching-parallel-agents` | 暂不需要并行 agent |

**基础设施：**

| 组件 | 说明 |
|---|---|
| `cc-delegate` | OpenClaw → Claude Code 桥接层 |

---

## 5. 人类检查点

| 检查点 | Phase | 必须？ | 看什么 | 选项 |
|---|---|---|---|---|
| spec approve | 1→2 | **必须** | 方向对不对 | approve / 继续改 |
| plan review | 2→3 | 可跳过 | 技术方案行不行 | 摘要 / 完整plan / 跳过 |
| 执行方式 | 2→3 | 选择 | subagent 还是 inline | subagent / inline / 重新规划 |
| 最终验收 | 4-L3 | **必须** | 结果满不满意 | approve / 要调整 / 丢弃 |

---

## 6. Hook 设计（10%）

### 机制

利用 Claude Code 原生 hooks（`~/.claude/settings.json` 中的 `hooks` 字段），在关键事件时自动执行 shell 脚本，脚本通过 `openclaw message send` 通知飞书 / 触发 OpenClaw 下一步动作。

**原理：**
```
Claude Code 事件 → hooks.xxx → shell 脚本 → openclaw message send → 飞书/OpenClaw
```

### Hook 清单

| Hook 事件 | 触发时机 | 脚本做什么 | 通知谁 |
|---|---|---|---|
| `Stop` | Claude Code session 结束 | 发送完成通知 + 执行摘要 | 飞书（用户）+ OpenClaw |
| `PostToolUse` | 每次工具调用完成后 | 记录进度（可选：只在关键 task 完成时通知） | OpenClaw |
| `PreToolUse` | 工具调用前 | 拦截危险操作（可选） | — |
| `SessionStart` | session 启动时 | 注入 SuperClaw 上下文 + Superpowers skills 路径 | — |

### Hook 脚本模板

#### `superclaw-notify.sh` — 核心通知脚本

```bash
#!/bin/bash
# SuperClaw 通知脚本 — Claude Code → OpenClaw / 飞书

FEISHU_ACCOUNT="${SUPERCLAW_FEISHU_ACCOUNT:-default}"
FEISHU_TARGET="${SUPERCLAW_FEISHU_TARGET}"     # 用户 open_id
OPENCLAW_PATH="${SUPERCLAW_OPENCLAW_PATH:-openclaw}"
SUPERCLAW_STATE="${SUPERCLAW_STATE_DIR:-.superclaw}"

# 读取 hook 输入
HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

case "$TOOL_NAME" in
  "Stop")
    # Session 结束 → 通知用户 + 触发 OpenClaw verify
    TITLE="🦞 Claude Code 执行完成"
    MESSAGE="Session: $SESSION_ID\n📅 $TIMESTAMP\n\n正在触发 OpenClaw 验收..."

    # 通知飞书
    $OPENCLAW_PATH message send \
      --channel feishu \
      --account "$FEISHU_ACCOUNT" \
      --target "$FEISHU_TARGET" \
      --message "$TITLE\n\n$MESSAGE"

    # 写状态文件，OpenClaw 可以 poll 或被 webhook 触发
    echo "{\"event\":\"execute_done\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
      > "$SUPERCLAW_STATE/last_event.json"
    ;;

  *)
    # 其他工具调用 → 记录日志（不通知，避免刷屏）
    echo "{\"tool\":\"$TOOL_NAME\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
      >> "$SUPERCLAW_STATE/tool_log.jsonl"
    ;;
esac

exit 0
```

#### `superclaw-session-start.sh` — Session 启动注入

```bash
#!/bin/bash
# SuperClaw session 启动 → 注入上下文

SUPERCLAW_STATE="${SUPERCLAW_STATE_DIR:-.superclaw}"

# 如果有待执行的 plan，输出提示
if [ -f "$SUPERCLAW_STATE/current_plan.md" ]; then
  echo "📋 SuperClaw plan detected: $SUPERCLAW_STATE/current_plan.md"
  echo "Use subagent-driven-development to execute it."
fi
```

### Claude Code settings.json 配置

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "~/.superclaw/hooks/superclaw-notify.sh",
        "timeout": 30
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "~/.superclaw/hooks/superclaw-progress.sh",
        "timeout": 10
      }
    ]
  }
}
```

### Hook 与 Skill 的协作

```
Phase 3 (execute):
  OpenClaw [execute skill]
    → cc-delegate 启动 Claude Code session
    → Claude Code 自治执行 plan
    → [Hook: PostToolUse] 每个工具调用记录到 tool_log.jsonl
    → [Hook: Stop] session 结束 → 通知飞书 + 写 last_event.json
    → OpenClaw 收到通知 → 自动触发 [verify skill]

Phase 4 (verify):
  OpenClaw [verify skill]
    → 读取 tool_log.jsonl 了解执行过程
    → 独立跑测试 + E2E
    → 结果通知飞书
```

**关键点：Hook 是被动触发的胶水，不做业务逻辑。** 它只负责"Claude Code 做完了 → 告诉 OpenClaw"，具体怎么验收是 verify skill 的事。

---

## 7. 设计原则

### 90% Skill + 10% Hook

- **Skill** 管"做什么"：每个 phase 是一个 skill，有明确的输入/输出/分支
- **Hook** 管"什么时候自动触发"：Claude Code 原生 hooks → shell 脚本 → openclaw message send

### 分支三模式

- **循环**：不满足就在 skill 内转圈（align 的脑暴循环、verify 的修复循环）
- **选择**：给人明确选项（plan 的 review 方式、执行方式、deliver 的最终判断）
- **状态**：根据结果走不同路径（execute 的 DONE/BLOCKED/FAILED）

### Claude Code 自治

- OpenClaw 不微操 Claude Code 的执行过程
- subagent-driven-development 是 Claude Code 原生能力
- OpenClaw 只管：发指令、等结果、独立验收

### 三级验收

- L1: Claude Code 自验（TDD + self-review + 双阶段 review）— 执行过程中完成
- L2: OpenClaw 独立验证 — 不信任 L1，自己跑测试 + E2E
- L3: 人类最终判断 — 看交付报告做决定

### 验证铁律

> 没有跑过验证命令的结果，不准声称"完成了"。

适用于 Claude Code（L1）和 OpenClaw（L2）两层。

### 不重新造轮子

Claude Code 侧复用 Superpowers 的 skill，只在必要时做适配性改造。

---

## 8. 借鉴来源

| 借鉴内容 | 来源 | 用在哪里 |
|---|---|---|
| 一次一问 + 多选 + 2-3 方案 | Superpowers brainstorming | Phase 1 align |
| HARD GATE：没 approve 不动手 | Superpowers brainstorming | Phase 1→2 |
| 循环分支 + 唯一终态 | Superpowers brainstorming | 所有 skill |
| YC 6 问（需求真实性追问） | gstack office-hours | Phase 1 align |
| grill-me（追问到底） | mattpocock | Phase 1 可选加强 |
| No Placeholders 规则 | Superpowers writing-plans | Phase 2 plan |
| vertical slice 分阶段 | mattpocock prd-to-plan | Phase 2 plan |
| 执行方式二选一 | Superpowers writing-plans | Phase 2→3 |
| subagent-driven-development | Superpowers | Phase 3（CC 内部） |
| 4 种状态分支 | Superpowers subagent-driven-dev | Phase 3（CC 内部） |
| TDD 红绿灯 | Superpowers | Phase 3（CC 内部） |
| 验证铁律 | Superpowers verification-before-completion | L1 + L2 |
| 浏览器 E2E 实测 | gstack /qa | Phase 4 L2 |
| 4 选项收尾 | Superpowers finishing-a-dev-branch | Phase 4 L3 |
| deep module 设计理念 | mattpocock | Phase 2 plan |
| Claude Code hooks 机制 | 气球哥飞书联动文档 | Phase 3→4 hook 通知 |
| `openclaw message send` 通知 | 气球哥飞书联动文档 | hook → 飞书通知 |

---

## 9. 待定 / Open Questions

- [ ] Claude Code 侧的 Superpowers skill 需要改造多少？直接复用还是 fork？
- [ ] plan 阶段 OpenClaw 和 Claude Code 的对话用什么形式？一次 exec？还是 session？
- [ ] verify 阶段 E2E 测试用例怎么生成？从 spec 自动推导？还是手写？
- [ ] cc-delegate 是否需要扩展新命令来支持 plan 阶段的交互式对话？
- [ ] Hook 的具体实现方式：用 Claude Code 原生 hook 还是 OpenClaw 侧触发？
- [ ] 多项目支持：一个 SuperClaw 实例管多个项目的状态怎么隔离？
- [ ] PARTIAL 状态下的处理策略：直接进 verify 还是先让人判断？

---

## 10. 下一步

1. ✅ DESIGN.md 完成
2. 逐个写 OpenClaw 侧的 5 个 Skill（align → plan → execute → verify → deliver）
3. 确定 Superpowers skill 的复用/改造方案
4. 定义双端通信协议（spec-format / plan-format / status-report）
5. 找一个真实项目验证
