# SuperClaw Architecture

> 人管方向，OpenClaw 管对齐和验收，Claude Code 管执行。

## 二层架构

```
┌─────────────────────────────────────────────────┐
│                   用户（人）                       │
│  只需要：提需求 + 确认 spec + 最终验收              │
└──────────────────────┬──────────────────────────┘
                       │ 自然语言
                       ▼
┌─────────────────────────────────────────────────┐
│              OpenClaw（产品脑 + 验收脑）            │
│                                                   │
│  Skills:                                          │
│  ┌─────┐  ┌─────┐  ┌────────┐  ┌──────┐  ┌─────┐│
│  │align│→ │plan │→ │execute │→ │verify│→ │deliver│
│  └─────┘  └─────┘  └────┬───┘  └──────┘  └─────┘│
│                          │                        │
│  cc-delegate bridge      │                        │
└──────────────────────────┼────────────────────────┘
                           │ ACPX protocol
                           ▼
┌─────────────────────────────────────────────────┐
│             Claude Code（技术脑 + 执行脑）          │
│                                                   │
│  Superpowers Skills (直接复用):                    │
│  ┌──────────────┐  ┌─────┐  ┌──────────────────┐ │
│  │writing-plans │  │ TDD │  │subagent-driven-dev│ │
│  └──────────────┘  └─────┘  └──────────────────┘ │
│                                                   │
│  Agents:  code-reviewer                           │
│  Hooks:   SessionStart → Superpowers injection    │
│           Stop → SuperClaw notify                 │
└───────────────────────────────────────────────────┘
```

## 与现有方案的区别

| | 传统方案 (Superpowers/gstack) | SuperClaw |
|---|---|---|
| 谁跟 Claude Code 说话 | 人 | OpenClaw |
| 需求对齐 | 人自己想清楚 | OpenClaw 帮你对齐 |
| 技术规划 | 人 review plan | OpenClaw 先 review，人看摘要 |
| 执行监控 | 人盯着终端 | Hook 自动通知飞书 |
| 验收 | 人自己看代码 | L1(CC自验) → L2(OpenClaw独立验) → L3(人最终确认) |
| 信息损失 | 每次人肉传递都损失 | OpenClaw 直调 CC，零损失 |

## 90% Skill + 10% Hook

**Skill** 管"做什么"：
- 每个阶段是一个 skill，有明确的输入/输出/分支流程
- align 的输出是 spec.md，plan 的输出是 plan.md
- 分支类型：循环（不满足就转圈）、选择（多路径）、终态（唯一出口）

**Hook** 管"什么时候自动触发"：
- Claude Code 原生 hooks 机制
- Stop → shell 脚本 → `openclaw message send` → 飞书通知
- PostToolUse → 进度日志（JSONL）

## 三级验收

| 级别 | 执行者 | 信任度 | 做什么 |
|---|---|---|---|
| L1 | Claude Code | 不完全信任 | TDD + self-review + spec-reviewer + code-quality-reviewer |
| L2 | OpenClaw | 信任 | 独立跑测试 + spec 逐条验证 + E2E |
| L3 | 人 | 最终决定 | 确认产品层面的正确性 |

## 技术栈

| 组件 | 技术 |
|---|---|
| OpenClaw | Node.js, OpenClaw plugin system |
| cc-delegate | Node.js (ESM), ACPX protocol |
| Claude Code | Anthropic Claude, Superpowers plugin |
| Hooks | Bash, jq, `openclaw message send` |
| 通知 | Feishu (飞书) |
