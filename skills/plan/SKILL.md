---
name: superclaw-plan
description: |
  SuperClaw Phase 2: 技术对齐。OpenClaw 与 Claude Code 协商，把 spec 变成可执行的 plan。
  使用场景：align 阶段完成、spec 已 approve。
  终态：plan approved → invoke execute。
---

# SuperClaw: Plan

> Phase 2 — OpenClaw ↔ Claude Code 技术对齐

把 approved spec 交给 Claude Code，让它探索代码库后出 plan，OpenClaw 做 review 和人类沟通的桥。

**宣告：** "我在用 superclaw:plan 来规划实现方案。我会把 spec 交给 Claude Code，让它基于代码库给出 plan。"

<HARD-GATE>
Plan 阶段不写实现代码。
Plan 必须经过 review 才能执行。
</HARD-GATE>

## 前置条件

- `spec.md` 已存在且状态为 APPROVED
- 项目代码库可访问

## Board Integration

> 以下 board 操作仅在 `.superclaw/board/` 存在时执行。没有 board 时 skill 正常运行。

| 时机 | Board 操作 | 命令 |
|------|-----------|------|
| 开始 | 读 planned 列中的任务 | 读任务文件 + spec_path |
| CC 出 plan | 更新任务文件 plan_path | `set_frontmatter plan_path <path>` |
| plan 确认 | 更新 history | 追加 history 行 |

### 如何找到当前任务

1. 如果从 align invoke 过来 → 从调用上下文获取任务文件
2. 否则 → 在 `board/planned/` 中找到匹配 spec 的任务

## Checklist

1. **准备上下文** — 收集 spec + 项目结构 + 关键文件
2. **发起 Claude Code session** — 通过 superclaw 启动，传入 spec
3. **Claude Code 探索代码库** — 读代码、理解现有架构
4. **Claude Code 出 plan 草案** — 使用 Superpowers writing-plans skill
5. **OpenClaw review plan** — 检查 spec 覆盖、任务粒度、风险点
6. **人类 review（可选）** — 三种方式供用户选择
7. **确定执行方式** — 进入 execute

## 流程

```
收到 approved spec
  → 准备上下文（spec + 代码结构 + 关键文件）
  → superclaw start（传入 spec + writing-plans 指令）
  → Claude Code 探索代码库 + 出 plan 草案
  → OpenClaw review plan
      ├─ 有问题 → 发修改意见给 CC → CC 修改 → 重新 review（循环）
      └─ 通过 → 人类 review gate
  → 人类 review？
      ├─ "看摘要" → OpenClaw 总结 plan 要点 → 人 approve？
      │     ├─ no → 人给反馈 → 传给 CC 修改（循环）
      │     └─ yes → 选执行方式
      ├─ "看完整 plan" → 发 plan.md 给人 → 人 approve？
      │     ├─ no → 人给反馈 → 传给 CC 修改（循环）
      │     └─ yes → 选执行方式
      └─ "跳过，我信你" → 直接选执行方式
  → 选执行方式？
      ├─ "subagent"（推荐）→ invoke execute（mode=subagent）
      ├─ "inline" → invoke execute（mode=inline）
      └─ "重新规划" → 回到 CC 修改 plan（循环）
```

## 发起 Claude Code Session

通过 superclaw 启动 Claude Code：

```bash
superclaw start \
  --name "superclaw-<feature>" \
  --cwd <project-dir> \
  --prompt "
你现在是 SuperClaw plan 阶段的技术规划者。

## 你的任务
1. 阅读下面的 spec
2. 探索项目代码库，理解现有架构
3. 使用 superpowers:writing-plans skill 编写实现 plan
4. plan 写好后报告给我

## Spec
<spec.md 内容>

## 约束
- 使用 superpowers:writing-plans skill 的标准格式
- 每个 task 必须有完整代码、精确路径、测试命令
- 不要有 placeholder
- TDD, DRY, YAGNI
- plan 保存到 docs/superclaw/plans/YYYY-MM-DD-<feature>.md
"
```

## OpenClaw Review Plan

Claude Code 出 plan 后，OpenClaw 独立检查：

### Review Checklist

1. **Spec 覆盖度** — plan 里的 task 是否覆盖了 spec 的所有 acceptance criteria？
2. **任务粒度** — 每个 task 是否 2-5 分钟可完成？太大要拆
3. **占位符扫描** — 有没有 TBD/TODO/模糊步骤？
4. **依赖顺序** — task 之间的依赖是否合理？
5. **测试覆盖** — 每个 task 都有测试吗？
6. **风险识别** — 哪些 task 可能踩坑？标注出来

### Review 结果

- **通过** → 进入人类 review gate
- **有问题** → `superclaw send "superclaw-<feature>"` 发修改意见 → CC 修改 → 重新 review

## 人类 Review Gate

给用户三个选择：

> "Plan 已经准备好了，你想怎么 review？"
> 1. **看摘要** — 我给你总结 plan 要点（推荐，省时间）
> 2. **看完整 plan** — 我把 plan 文件发给你
> 3. **跳过** — 你信任 OpenClaw 和 Claude Code 的 review

### 摘要格式

```markdown
## Plan 摘要

**目标：** [一句话]
**Task 数量：** N 个
**预估复杂度：** 简单/中等/复杂
**关键技术决策：**
- ...

**Task 列表：**
1. [Task 名] — [一句话描述]
2. ...

**风险点：**
- ...

**需要你决定的：**
- ...（如果有）
```

## 执行方式选择

Plan approved 后，给用户选执行方式：

> "Plan 确认 ✅，怎么执行？"
> 1. **Subagent 驱动**（⭐ 推荐）— 每个 task 派独立 subagent，task 之间有 review
> 2. **Inline 执行** — 单 session 顺序执行，有 checkpoint
> 3. **重新规划** — 对 plan 不满意，回去改

## 终态

> "Plan 已确认，执行方式：[subagent/inline]。开始执行阶段。"

invoke `superclaw:execute`（传入 plan 路径 + 执行方式 + session 名称 `superclaw-<feature>`）

**重要：session 命名用 `superclaw-<feature>`（不带阶段前缀）。execute 阶段会 `send` 同一个 session，复用 plan 阶段 CC 对代码库的理解，避免重复探索。**

## Anti-Pattern

❌ OpenClaw 自己写 plan — plan 必须由 Claude Code 出（它懂代码库）
❌ 跳过 OpenClaw review 直接给人看 — OpenClaw 先过滤一轮
❌ 给用户看函数签名级别的细节 — 人看摘要就够了
❌ Plan 阶段就开始执行代码 — HARD GATE
