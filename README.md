# SuperClaw

> OpenClaw + Claude Code 的超级编码体。
> 人管方向，OpenClaw 管对齐和验收，Claude Code 管执行。

## Why

我是一个重度 AI 用户。每天的工作流是这样的：左边开着 OpenClaw 帮我规划任务、管理上下文，右边终端里跑着 Claude Code 帮我写代码。

OpenClaw 越来越懂我了。它知道我的项目背景、技术偏好、团队约定。但问题是——**每天我的大量工作其实是在 OpenClaw 和 Claude Code 之间传递信息。**

我说"帮我实现用户系统"，OpenClaw 理解了我的意思，但它写不了代码。于是我打开 Claude Code，重新描述一遍需求，丢失了一半上下文。Claude Code 写完了，我又切回 OpenClaw 告诉它"那个功能做好了"。

一天切换几十次。每次切换都带来**信息损失**。我意识到一个事实：**我调用 Claude Code 的效率，远不如 OpenClaw 直接调用 Claude Code。**

我需要的不是两个各自聪明的助手，而是一个**高效协作的 agent team**。

所以我基于 [Superpowers](https://github.com/obra/superpowers) 等项目的实战经验，构建了 SuperClaw —— 一个 harness engineering 项目，让 OpenClaw 和 Claude Code 形成真正的二层架构。

## How it works

传统方案里（包括 Superpowers、gstack），**人直接跟 Claude Code 对话**。SuperClaw 不一样：

```
传统：  人 ↔ Claude Code
SuperClaw：  人 ↔ OpenClaw ↔ Claude Code
```

你只需要用自然语言告诉 OpenClaw 你想做什么。剩下的事情自动发生：

1. **OpenClaw 帮你对齐需求** — 它了解你的上下文，一次一问地帮你理清想法，输出结构化的 spec
2. **OpenClaw 把 spec 交给 Claude Code 做技术规划** — Claude Code 探索代码库，用 Superpowers 的 writing-plans skill 生成 plan
3. **Claude Code 自治执行** — 用 Superpowers 的 subagent-driven-development，每个 task 自动 TDD + 双阶段 review
4. **Claude Code 做完了，自动通知** — 通过 hook 发飞书消息，OpenClaw 自动进入验收
5. **OpenClaw 独立验收** — 不信任 Claude Code 的"我做完了"，自己跑测试、逐条对照验收标准
6. **结果交给你** — 用你能懂的语言告诉你做了什么，你说 OK 就 merge

整个过程，你可能只在两个地方介入：**确认 spec** 和 **最终验收**。技术细节的对齐在 OpenClaw 和 Claude Code 之间完成，你不需要看函数签名。

## Architecture

### 90% Skill + 10% Hook

- **Skill** 管"做什么"：每个阶段是一个 skill，有明确的输入/输出/分支流程
- **Hook** 管"什么时候自动触发"：Claude Code 原生 hooks → shell 脚本 → 飞书通知

### Skills（OpenClaw 侧）

| Skill | 阶段 | 做什么 |
|---|---|---|
| `align` | Phase 1 | 把模糊需求变成结构化 spec。一次一问，2-3 方案推荐，逐部分确认 |
| `plan` | Phase 2 | 把 spec 交给 Claude Code 规划。OpenClaw 做 review 桥梁 |
| `execute` | Phase 3 | 启动 Claude Code 自治执行。不微操，等结果 |
| `verify` | Phase 4 | 独立验收。自己跑测试，逐条对照 acceptance criteria |
| `deliver` | Phase 5 | 用人话告诉用户做了什么。approve / 调整 / 丢弃 |

### Skills（Claude Code 侧）

**直接使用 [Superpowers](https://github.com/obra/superpowers)**，不 fork 不改造。站在巨人肩膀上。

复用 11 个 Skills、3 个 Prompt 模板、1 个 Review Agent。包括：

- `subagent-driven-development` — 逐 task 派 subagent + 双阶段 review
- `writing-plans` — spec → 可执行 plan
- `test-driven-development` — TDD 红绿灯
- `verification-before-completion` — 没跑过不准说完了
- `code-reviewer` — 6 维代码审查 agent
- ...完整清单见 [claude-code-skills/README.md](claude-code-skills/README.md)

### Hooks

| Hook | 触发时机 | 做什么 |
|---|---|---|
| `Stop` | Claude Code session 结束 | 飞书通知 + 触发 OpenClaw verify |
| `PostToolUse` | 每次工具调用后 | 记录进度日志 |
| `SessionStart` | session 启动 | 注入上下文（Superpowers 原生） |

### 三级验收

| 级别 | 谁 | 做什么 | 信任度 |
|---|---|---|---|
| L1 | Claude Code | TDD + self-review + 双阶段 review | 不完全信任 |
| L2 | OpenClaw | 独立跑测试 + spec 逐条验证 | 信任 |
| L3 | 人 | 最终确认 | 最终决定 |

## The Workflow

```
人："帮我实现用户注册功能"
  │
  ▼
[align] OpenClaw 一次一问，理清需求
  → spec.md（用户 approve ✅）
  │
  ▼
[plan] OpenClaw → Claude Code 规划
  → plan.md（OpenClaw review + 用户可选 review）
  │
  ▼
[execute] Claude Code 自治（subagent-driven）
  → 每个 task: 实现 → spec review → code review
  → Hook: Stop → 飞书通知 🔔
  │
  ▼
[verify] OpenClaw 独立验收
  → 跑测试 → spec 逐条验证 → 验证报告
  │
  ▼
[deliver] 用人话告诉你结果
  → "用户可以用邮箱注册和登录了，测试全过"
  → approve → merge 🎉
```

## Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) installed and configured
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- [Superpowers](https://github.com/obra/superpowers) installed as Claude Code plugin
- A Feishu bot connected to OpenClaw (for notifications)

## Installation

> 🚧 SuperClaw is under active development. The skill files are ready, packaging as OpenClaw plugin is coming soon.

### Manual Setup

1. Copy `openclaw-skills/*` to your OpenClaw skills directory
2. Copy `hooks/*` to `~/.superclaw/hooks/` and `chmod +x` them
3. Add hook configuration to Claude Code's `settings.json` (see [hooks/settings.json.example](hooks/settings.json.example))
4. Set environment variables in your shell:

```bash
export SUPERCLAW_FEISHU_TARGET="your_open_id"    # 飞书通知目标
export SUPERCLAW_STATE_DIR="$PWD/.superclaw"      # 状态文件目录
```

## Project Structure

```
superclaw/
├── DESIGN.md                    # 完整设计文档（10 章节，42KB）
├── openclaw-skills/             # OpenClaw 侧 Skills
│   ├── align/SKILL.md           # Phase 1: 产品对齐
│   ├── plan/SKILL.md            # Phase 2: 技术对齐
│   ├── execute/SKILL.md         # Phase 3: 执行
│   ├── verify/SKILL.md          # Phase 4-L2: 验收
│   └── deliver/SKILL.md         # Phase 5: 交付
├── claude-code-skills/          # Claude Code 侧 = 直接用 Superpowers
│   └── README.md
├── hooks/                       # Claude Code hooks
│   ├── superclaw-notify.sh      # Stop → 飞书通知
│   └── superclaw-progress.sh    # PostToolUse → 进度日志
├── protocol/                    # 双端通信协议
├── cc-delegate/                 # OpenClaw → Claude Code 桥接
└── examples/                    # 端到端示例
```

## Philosophy

- **人管方向，不管实现** — 你只需要说"做什么"和"做得对不对"
- **信息零损失** — OpenClaw 调 Claude Code，上下文完整传递，不靠人肉中转
- **不信任，要验证** — Claude Code 说完了不算数，OpenClaw 独立验收
- **站在巨人肩膀上** — Claude Code 侧直接用 Superpowers，不重复造轮子
- **90% Skill + 10% Hook** — Skill 管逻辑，Hook 管胶水

## Acknowledgements

SuperClaw stands on the shoulders of giants:

- **[Superpowers](https://github.com/obra/superpowers)** by Jesse Vincent — Claude Code 侧的全部开发流程 skills
- **[OpenClaw](https://github.com/openclaw/openclaw)** — 个人 AI 助手平台，SuperClaw 的宿主
- **[gstack](https://github.com/gstack-labs/gstack)** 和 **mattpocock's skills** — 设计灵感来源

## License

MIT
