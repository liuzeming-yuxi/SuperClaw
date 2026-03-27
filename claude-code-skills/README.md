# Claude Code Side — Use Superpowers

SuperClaw 的 Claude Code 侧**直接使用 Superpowers**，不 fork 不改造。

## 安装

```bash
# 方式 1: Claude Code plugin marketplace
# 在 Claude Code 里搜 "superpowers" 安装

# 方式 2: Git clone
git clone --depth 1 https://github.com/obra/superpowers.git ~/.claude/skills/superpowers
```

## SuperClaw 用到的 Superpowers 资产

| 类型 | 资产 | SuperClaw 哪个阶段用 |
|---|---|---|
| Skill | writing-plans | Plan 阶段 — CC 生成 plan |
| Skill | subagent-driven-development | Execute 阶段 — CC 自治执行 |
| Skill | executing-plans | Execute 阶段 — inline 模式 |
| Skill | test-driven-development | Execute 阶段 — 每个 task |
| Skill | verification-before-completion | Execute 阶段 — CC 自验 |
| Skill | using-superpowers | Session 启动 — skill 路由 |
| Skill | using-git-worktrees | Plan/Execute — 工作区隔离 |
| Skill | finishing-a-development-branch | Deliver — 分支收尾 |
| Skill | systematic-debugging | Execute — 遇 bug 时 |
| Skill | requesting-code-review | Execute — task review |
| Skill | receiving-code-review | Execute — 处理 review 反馈 |
| Prompt | implementer-prompt.md | Execute — subagent 指令 |
| Prompt | spec-reviewer-prompt.md | Execute — spec 合规 review |
| Prompt | code-quality-reviewer-prompt.md | Execute — 代码质量 review |
| Agent | code-reviewer.md | Execute — review agent |
| Hook | session-start | Session 启动 — 注入 skill |
| Command | write-plan.md | Plan 阶段 |
| Command | execute-plan.md | Execute 阶段 |

## SuperClaw 额外添加的

只在 `hooks/` 目录添加了两个通知脚本，不修改 Superpowers 任何文件：

1. `superclaw-notify.sh` — Stop hook → 飞书通知 + 触发 OpenClaw verify
2. `superclaw-progress.sh` — PostToolUse → 记录进度日志
