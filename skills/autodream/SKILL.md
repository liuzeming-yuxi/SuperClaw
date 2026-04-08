---
name: superclaw-autodream
description: |
  SuperClaw AutoDream: 记忆整理持久 agent。定期整理 OpenClaw 记忆文件。
  触发条件：距上次 >= 24 小时 AND >= 5 个 session。
  由 agent-check.sh 自动触发，也可用户手动 invoke。
---

# SuperClaw: AutoDream

> 持久 Agent — 记忆整理

整理 OpenClaw 的记忆文件，去重、合并、修复、更新索引。

**宣告：** "我在用 superclaw:autodream 整理记忆文件。"

## 触发方式

1. **自动触发**：agent-check.sh 检测到条件满足后输出 "autodream"，OpenClaw 据此 invoke 本 skill
2. **手动触发**：用户说 "整理记忆" / "run autodream" / invoke superclaw:autodream

## 4 Phases

### Phase 1: Orient — 建立记忆地图

**读取：**
- `~/.openclaw/memory/MEMORY.md`
- `~/.openclaw/memory/*.md`（所有主题文件）
- `.superclaw/agents/autodream-state.json`

**操作：**
1. 列出所有记忆文件 + 最后修改时间
2. 读取每个文件，提取主题和关键内容
3. 构建当前记忆地图（哪些主题、多大、何时更新）

**产出：** 内存中的记忆地图

### Phase 2: Gather Signal — 收集新信号

**读取：**
- `~/.openclaw/daily-notes/`（最近 7 天的笔记，如果存在）
- `.superclaw/board/done/`（最近完成的任务）

**操作：**
1. 从近期笔记中提取有价值的模式、决策、偏好
2. 从完成的任务中提取经验教训
3. 过滤：只保留值得长期记忆的信号（不是每个 session 细节都要记）

**产出：** 新信号列表

### Phase 3: Consolidate — 合并整理

**操作：**
1. 将新信号合并到现有记忆文件（放入最相关的主题文件）
2. **去重**：相同信息在多处出现 → 保留在最佳位置，删除其他
3. **修复相对日期**："昨天" → 具体日期，"最近" → 具体时间段
4. **合并小文件**：< 5 行的相关文件 → 合并到相关主题
5. 更新 MEMORY.md 索引，确保所有主题文件被引用

**写入：** 更新后的 memory 文件

### Phase 4: Prune & Index — 修剪和索引

**操作：**
1. **删除空文件**：内容为空或只有标题的文件 → 删除
2. **删除过时内容**：已被明确否定的结论 → 移除
3. **确保 MEMORY.md 简洁**：< 200 行，纯索引，不含实质内容
4. 每个主题文件有清晰的标题和范围

**写入：**
- 最终的 memory 文件
- 更新 `.superclaw/agents/autodream-state.json`：
  - `last_consolidation` = 当前时间
  - `sessions_since_last` = 0
- 更新 `.superclaw/agents/autodream.md` Run History

## 约束

- **只读代码**：AutoDream 不修改项目代码，只修改 memory 文件
- **保守合并**：宁可留下一条看起来重复的记忆，也不要误删有用信息
- **不改 CLAUDE.md**：MEMORY.md 和主题文件是 AutoDream 的范围，不碰 CLAUDE.md
- **幂等安全**：运行两次不会产生不同结果
- **记录操作**：在 Run History 中记录本次操作摘要

## 运行方式

推荐异步运行：
```bash
superclaw start \
  --name "autodream-$(date +%Y%m%d)" \
  --prompt "invoke superclaw:autodream"
```

也可同步运行（会占用当前 session）。

## 完成后

更新状态文件 `.superclaw/agents/autodream-state.json`：

```json
{
  "last_consolidation": "2026-04-06T03:00:00Z",
  "sessions_since_last": 0,
  "last_session_id": "current-session-id"
}
```

追加 Run History 到 `.superclaw/agents/autodream.md`：

```
| 2026-04-06T03:00 | 45s | success | 合并 3 个文件，删除 1 个空文件 |
```

## Anti-Pattern

❌ 删除看起来过时的记忆（除非有明确证据它已被否定）
❌ 把所有 session 细节都写入记忆（只记模式和决策）
❌ 改动 CLAUDE.md 或项目代码
❌ 一次大改（渐进式修改，每次小步）
