# SuperClaw 自动化流程设计：Board → Agent Pipeline

## 1. 现状分析

### 已建成
| 组件 | 状态 | 说明 |
|------|------|------|
| Board 文件系统 | ✅ | `.superclaw/board/{inbox,aligning,...,done}/` |
| Go 后端 API | ✅ | Task CRUD, Session CRUD, Artifact CRUD, Move |
| Next.js 前端 | ✅ | 看板、任务详情、产物 tab、创建表单 |
| 任务数据模型 | ✅ | frontmatter + sessions[] + artifacts{} |
| 产物格式定义 | ✅ | Spec/Plan/Progress/Verify Report/Deliver Summary |
| 三级验收设计 | ✅ | L1(CC自审) → L2(OpenClaw独立验) → L3(人拍板) |

### 缺失的关键环节
| 缺失 | 影响 | 
|------|------|
| **流程引擎** | 任务创建后没人认领，停在 inbox |
| **OpenClaw ↔ Board 集成** | OpenClaw 不知道看板上有新任务 |
| **对齐流程** | 没有 OpenClaw→飞书→用户 的对齐交互 |
| **CC 分发** | 没有 Board→CC 的执行分发 |
| **结果回流** | CC 执行完没有回写 artifacts/状态 |
| **验收流程** | L2 verify 没有实现 |

**一句话总结：看板是个空壳，agent 是孤岛，中间没有桥。**

---

## 2. 架构方案

### 核心设计原则

1. **OpenClaw 是大脑** — 它负责认领任务、对齐 spec、分发 CC、验收结果
2. **Board API 是状态存储** — 只负责读写，不驱动流程
3. **CC 是手** — 只管执行，不管流程
4. **飞书是嘴和耳** — 用户交互通道

### 架构图

```
用户（飞书）
    │
    ▼
┌─────────────────────┐
│     OpenClaw         │  ← 大脑：流程驱动、决策、验收
│  (heartbeat 轮询)    │
└──────┬──────┬────────┘
       │      │
       ▼      ▼
┌──────────┐  ┌──────────┐
│ Board API│  │   acpx   │  ← CC 执行通道
│ :9876    │  │(Claude   │
│          │  │  Code)   │
└──────────┘  └──────────┘
       │
       ▼
┌──────────────────────┐
│  文件系统             │
│  .superclaw/board/   │
│  .superclaw/specs/   │
│  .superclaw/plans/   │
└──────────────────────┘
```

### 驱动方式：OpenClaw Skill + Heartbeat

**不搞独立 daemon，不搞 cron job。** 用 OpenClaw 自己的 heartbeat 机制 + 一个 SuperClaw skill 来驱动。

理由：
- OpenClaw 已经有 heartbeat 轮询（每 30 分钟左右）
- OpenClaw 已经有飞书通道（可以直接跟用户对话）
- OpenClaw 已经有 acpx 能力（可以直接调 CC）
- 不需要新的进程/服务，复用现有能力

---

## 3. 阶段流程

### Phase 0: Inbox → Aligning（任务认领）

**触发**: OpenClaw heartbeat 检查 Board API，发现 inbox 有新任务

**流程**:
1. OpenClaw 调 `GET /api/projects/{id}/tasks`，过滤 `phase=inbox`
2. 有新任务 → OpenClaw 通过飞书通知用户："有新任务 #001「测试」，要开始对齐吗？"
3. 用户确认 → OpenClaw 调 `PATCH /api/projects/{id}/tasks/{taskId}/move` 移到 aligning
4. 同时 `POST /sessions` 创建 OpenClaw 对齐 session

### Phase 1: Aligning（对齐 Spec）

**执行者**: OpenClaw（通过飞书跟用户对话）

**流程**:
1. OpenClaw 读取任务描述
2. 在飞书里跟用户讨论：
   - 明确范围（做什么、不做什么）
   - 确定验收标准
   - 确定影响面（决定 Tier）
3. 讨论完毕 → OpenClaw 生成 Spec 文档
4. `PUT /artifacts/spec` 写入 spec
5. 飞书发 spec 给用户确认
6. 用户确认 → 移到 planned

**Spec 格式**（已定义）:
```markdown
# [任务标题] 规格说明

## 背景与动机
## 目标
## 非目标（明确排除）
## 验收标准
## 技术约束
## 开放问题（如有）
```

### Phase 2: Planned（生成 Plan）

**执行者**: CC（由 OpenClaw 分发）

**流程**:
1. OpenClaw 读取 spec，组装 CC 执行 prompt
2. 通过 acpx 调 CC："根据这个 spec，生成实现计划"
3. CC 输出 plan → OpenClaw 写入 `PUT /artifacts/plan`
4. OpenClaw review plan（自动检查：有没有遗漏 spec 要求的点）
5. Plan OK → 移到 executing

**Plan 格式**（已定义）:
```markdown
# 实现计划

## 变更概要
## 详细步骤（有序列表）
## 文件变更清单
## 测试计划
## 风险评估
```

### Phase 3: Executing（CC 执行）

**执行者**: CC（由 OpenClaw 监控）

**流程**:
1. OpenClaw 组装完整的 CC 执行 prompt：spec + plan + 项目 context
2. acpx 启动 CC session，传入 Superpowers 的 subagent-driven-development 方法
3. CC 执行代码修改（内部走 L1 自审）
4. OpenClaw 定期检查 CC session 状态
5. CC 完成 → OpenClaw 更新 `PUT /artifacts/progress`
6. 移到 reviewing

### Phase 4: Reviewing（L2 独立验收）

**执行者**: OpenClaw（独立验证，不看 CC 执行历史）

**流程**:
1. OpenClaw 只看：git diff + spec + verify 条件
2. 如果 verify 是命令 → 执行命令检查输出
3. 如果 verify 是描述 → 用 agent-browser 截图 or 人工判断
4. 生成 Verify Report → `PUT /artifacts/verify_report`
5. 验收通过 → 移到 done 或发飞书给用户做 L3 确认
6. 验收不通过 → 移回 executing（同一个 CC session 继续修）

### Phase 5: Done（交付）

**流程**:
1. OpenClaw 生成 Deliver Summary
2. `PUT /artifacts/deliver_summary`
3. 飞书通知用户："任务 #001 已完成"
4. 附上变更摘要

---

## 4. 集成点

### A. OpenClaw → Board API

OpenClaw 需要一个 SuperClaw skill，提供以下能力：
- `superclaw list-inbox` — 列出所有 inbox 任务
- `superclaw align <task-id>` — 开始对齐流程
- `superclaw dispatch <task-id>` — 分发给 CC 执行
- `superclaw verify <task-id>` — 执行 L2 验收
- `superclaw status` — 看板全局状态

**实现方式**: Shell 脚本（调 curl 访问 Board API），通过 SKILL.md 暴露给 OpenClaw。

### B. OpenClaw → CC（acpx）

已有能力，关键是 prompt 组装：

```bash
acpx --cwd <project-path> \
  --approve-all \
  --auth-policy fail \
  --non-interactive-permissions fail \
  --format text \
  claude exec -f <plan-file>
```

Plan 文件由 OpenClaw 从 Board API 读取 spec/plan 后动态生成。

### C. Heartbeat 集成

在 `HEARTBEAT.md` 中添加：
```markdown
- [ ] 检查 SuperClaw Board inbox 是否有新任务（每次 heartbeat）
- [ ] 检查 executing 中的 CC session 是否完成
```

或者更精确：在 OpenClaw 的 heartbeat 逻辑中直接调 Board API。

### D. 飞书通知

OpenClaw 已有飞书通道，直接用 message tool 发送：
- 新任务通知
- Spec 确认请求
- 验收结果
- 完成通知

---

## 5. 实现计划（优先级排序）

### MVP（最小可行）

**目标**：打通一条完整链路，从 inbox 到 done

| 步骤 | 内容 | 预估工作量 |
|------|------|-----------|
| 1 | 写 `superclaw` CLI wrapper（6 个 shell 脚本调 Board API） | 1h |
| 2 | 写 SuperClaw SKILL.md（让 OpenClaw 知道怎么用这些脚本） | 1h |
| 3 | HEARTBEAT.md 加 inbox 轮询 | 10min |
| 4 | 测试完整链路：创建任务 → 飞书对齐 → CC 执行 → 验收 | 2h |

### 增强

| 步骤 | 内容 |
|------|------|
| 5 | 前端实时状态更新（WebSocket 已有基础） |
| 6 | 多任务并行调度 |
| 7 | CC session 实时日志流到前端 |
| 8 | 自动 Tier 推断 |
| 9 | 看板 ↔ 飞书双向操作（飞书里也能移动任务） |

---

## 6. 风险评估

| 风险 | 级别 | 缓解 |
|------|------|------|
| Heartbeat 间隔太长，任务响应慢 | 中 | 可以缩短 heartbeat 间隔，或加飞书消息触发 |
| CC 执行超时/失败 | 中 | 加 timeout + 失败重试 + 自动移到 blocked |
| 对齐阶段用户不回复 | 低 | 设超时提醒，超过 24h 自动移到 blocked |
| Board API 挂了 | 低 | systemd Restart=always 已配置 |
| acpx 路径变化 | 低 | skill 脚本里用 `which acpx` 动态查找 |

---

## 7. 关键决策待确认

1. **Heartbeat 驱动 vs 事件驱动** — 用 heartbeat 轮询够了吗？还是需要 Board API 主动通知 OpenClaw？
2. **对齐在哪做** — 当前飞书群聊？还是单独开话题？
3. **多项目支持** — 一次只处理一个任务还是并行多个？
4. **CC session 复用** — 一个任务一个 CC session，还是可以跨任务？
