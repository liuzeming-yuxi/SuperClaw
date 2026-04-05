---
name: superclaw-execute
description: |
  SuperClaw Phase 3: 执行。通过 cc-delegate 让 Claude Code 自治执行 plan。
  使用场景：plan 已 approve，选定了执行方式。
  终态：执行完成 → 自动触发 verify（通过 hook 或轮询）。
---

# SuperClaw: Execute

> Phase 3 — OpenClaw 发起 → Claude Code 自治执行

把 approved plan 交给 Claude Code，让它用 Superpowers 的 subagent-driven-development 自治完成。OpenClaw 只管启动和等结果，不做逐 task 微操。

**宣告：** "我在用 superclaw:execute 启动 Claude Code 执行 plan。Claude Code 会自治完成所有 task，每个 task 完成后有自动 review。"

## 前置条件

- `plan.md` 已存在且已 approve
- 执行方式已确定（subagent / inline）
- cc-delegate 可用

## Board Integration

> 以下 board 操作仅在 `.superclaw/board/` 存在时执行。没有 board 时 skill 正常运行。

| 时机 | Board 操作 | 命令 |
|------|-----------|------|
| 开始执行 | 从 planned 移到 executing | `board-move.sh {task} planned executing "开始执行"` |
| 执行中 | 更新 updated 时间戳 + 追加 history | 定期更新任务文件 |
| CC 完成 | 从 executing 移到 reviewing | `board-move.sh {task} executing reviewing "执行完成"` |
| CC 阻塞 | 从 executing 移到 blocked | `board-move.sh {task} executing blocked "原因: ..."` |

### 崩溃恢复

如果 CC session 意外终止（Stop hook 写入 `last_event.json` 且 `status: "interrupted"`）：
1. 任务仍在 `executing/` 但 session 已结束
2. OpenClaw 下次检查时读取 `tool_log.jsonl` 判断进度
3. 选择：恢复执行 / 移到 blocked / 移回 planned

## 核心原则

**OpenClaw 不做逐 task 微操。** subagent-driven-development 是 Claude Code 的原生能力：
- Claude Code 自己读 plan
- 自己派 subagent 执行每个 task
- 每个 task 完成后自动走双阶段 review（spec compliance → code quality）
- 遇到问题自己决定是继续还是上报

OpenClaw 只需要：**启动 → 等结果 → 收到通知后触发 verify**

## 流程

```
收到 approved plan + 执行方式
  → cc-delegate session start（传入 plan + 执行指令）
  → Claude Code 自治区域
      │  ┌─────────────────────────────────────────┐
      │  │ 读 plan → 逐 task 执行                    │
      │  │  ├─ 派 subagent 执行 task                 │
      │  │  ├─ spec-reviewer 验 task                 │
      │  │  ├─ code-quality-reviewer 审 task         │
      │  │  └─ 处理 task 状态：                       │
      │  │       ├─ DONE → 下一个 task               │
      │  │       ├─ DONE_WITH_CONCERNS → 记录 → 继续  │
      │  │       ├─ NEEDS_CONTEXT → 上报 OpenClaw    │
      │  │       └─ BLOCKED → 上报 OpenClaw          │
      │  └─────────────────────────────────────────┘
  → [Hook: PostToolUse] 记录进度到 tool_log.jsonl
  → [Hook: Stop] session 结束 → 飞书通知 + 写 last_event.json
  → OpenClaw 收到通知
  → 读取执行结果（状态文件 + CC 输出）
  → 判断最终状态：
      ├─ SUCCESS → invoke verify
      ├─ PARTIAL → 通知用户 + 决定是否 verify 已完成部分
      └─ FAILED → 通知用户 + 决定重试/放弃
```

## 启动 Claude Code

### Subagent 模式（推荐）

```bash
cc-delegate session start \
  --name "superclaw-exec-<feature>" \
  --cwd <project-dir> \
  --prompt "
你现在是 SuperClaw execute 阶段的执行者。

## 你的任务
使用 superpowers:subagent-driven-development 执行下面的 plan。

## Plan
<plan.md 路径>

## 重要
- 每个 task 派独立 subagent
- 每个 task 完成后走 spec compliance review + code quality review
- 遇到 BLOCKED 或 NEEDS_CONTEXT 状态，在报告中说明
- 全部完成后，写一份执行报告

## 执行报告格式
完成后输出：
- 总 task 数 / 完成数 / 跳过数 / 失败数
- 每个 task 的状态和摘要
- concerns 列表（如果有）
- 所有改动的文件列表
- 测试结果汇总
"
```

### Inline 模式

```bash
cc-delegate session start \
  --name "superclaw-exec-<feature>" \
  --cwd <project-dir> \
  --prompt "
使用 superpowers:executing-plans 执行下面的 plan。
<plan.md 路径>
"
```

## 等待执行完成

OpenClaw 在 Claude Code 执行期间可以做：

1. **被动等待**（推荐）— 靠 Hook 通知
   - `superclaw-notify.sh` 在 CC session Stop 时自动通知飞书 + 写状态文件
   - OpenClaw 收到飞书消息或读到 `.superclaw/last_event.json` 后触发 verify

2. **主动轮询**（备选）— 如果 Hook 不可用
   - 定期 `cc-delegate session list` 检查 session 状态
   - session 结束后读取输出

## 处理 Claude Code 上报

如果 Claude Code 在执行中遇到 NEEDS_CONTEXT 或 BLOCKED：

### NEEDS_CONTEXT — CC 需要更多信息

```
CC: "Task 3 需要知道数据库的连接字符串配置方式，plan 里没写。"
```

OpenClaw 处理：
1. 如果 OpenClaw 能回答 → 直接 `cc-delegate session continue` 传入答案
2. 如果不能 → 问用户 → 拿到答案后传给 CC

### BLOCKED — CC 无法继续

```
CC: "Task 5 依赖的 API 还没部署，无法测试。"
```

OpenClaw 处理：
1. 通知用户，说明 blocker
2. 用户决定：跳过这个 task / 等 blocker 解决 / 修改 plan

## 执行完成后

读取 Claude Code 的执行报告，判断状态：

| 最终状态 | 条件 | 下一步 |
|---|---|---|
| SUCCESS | 所有 task DONE（可含 DONE_WITH_CONCERNS） | invoke verify |
| PARTIAL | 部分 task 完成，部分 BLOCKED/跳过 | 通知用户，问是否 verify 已完成部分 |
| FAILED | 关键 task 失败 | 通知用户，问是否重试/修改 plan/放弃 |

## 飞书通知

执行完成时自动通知用户（通过 Hook）：

```
🦞 SuperClaw 执行完成

📊 结果：8/10 task 完成
⏱️ 耗时：约 15 分钟
📝 状态：SUCCESS

正在进入验收阶段...
```

## 终态

- **SUCCESS** → invoke `superclaw:verify`
- **PARTIAL** → 用户决定后 invoke `superclaw:verify` 或回到 plan
- **FAILED** → 用户决定后重试 execute 或回到 plan

## Anti-Pattern

❌ OpenClaw 逐 task 给 CC 发指令 — CC 自治，OpenClaw 不微操
❌ 忽略 DONE_WITH_CONCERNS — 要记录 concerns，verify 时重点检查
❌ Hook 和轮询同时用 — 选一种，别重复触发
❌ CC 说完成了就直接信 — 必须走 verify
