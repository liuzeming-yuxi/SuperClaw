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
      ├─ 4. 端到端验证（最大可能验证）
      └─ 5. 代码质量抽检
  → 生成验证报告
  → 全部通过？
      ├─ yes → invoke deliver
      └─ no → 问题分类
          ├─ 需求与实现不一致 → 路径 A：session continue + systematic-debugging → CC 修 → 完整重新 verify
          └─ 需求本身有问题 → 路径 B：飞书通知用户 → 等用户判断
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

### Step 4: 端到端验证（最大可能验证）

<HARD-GATE>
E2E 验证不是可选的。对每个项目类型，都必须用最合适的方式做端到端验证。
只有你**真正确认**产出和 spec 对齐了，才能放行。
"看了代码觉得应该没问题" 不算验证。
</HARD-GATE>

#### 4.1 判断项目类型

| 项目类型 | 检测方式 | 验证工具 |
|---|---|---|
| Web 前端/SPA | package.json 有 react/vue/next/vite 等 | 浏览器自动化（agent-browser / Puppeteer） |
| 静态 HTML | index.html 存在，无构建步骤 | 浏览器直接打开文件 |
| API 服务 | 有 routes/endpoints 定义 | curl / HTTP 请求 |
| CLI 工具 | 有 bin 字段或可执行脚本 | 命令行调用 |
| 纯库 | 只有 src，无入口 | 跳过 E2E，但必须在报告中说明依赖 Step 1-2 |

#### 4.2 Web 前端 / 静态 HTML 验证

```
1. 启动
   - 静态文件：浏览器打开 file://<absolute-path>
   - 需要构建：npm run build && npx serve dist
   - 需要 dev server：npm run dev

2. 截图初始状态
   - 截图保存到 /tmp/verify-screenshots/
   - 用多模态模型分析截图，对照 spec 的视觉要求逐条确认
   - 示例 prompt："这是一个 Mario 游戏的初始画面吗？
     能看到：(1) 马里奥精灵 (2) 地面 (3) 问号砖块 (4) 管道？"

3. 模拟用户交互
   - 从 spec 的功能列表推导出关键交互路径
   - 每个交互：操作 → 等待 → 截图 → 多模态分析
   - 示例：按右方向键 → 等 1 秒 → 截图 → "马里奥有没有向右移动？"

4. 检查控制台
   - 捕获所有 console.error 和 JS 异常
   - 任何未捕获异常 = 标记为问题

5. 汇总
   - 所有截图路径 + 多模态分析结果 → 写入 E2E 验证报告
```

#### 4.3 API 服务验证

```
1. 启动服务（从 plan 或项目配置获取启动命令）
2. 对照 spec 的 API 列表，逐个端点验证：
   - 正常请求 → 检查状态码 + 响应体结构
   - 边界输入 → 检查错误处理
   - 认证（如果有）→ 检查无 token 时拒绝
3. 停止服务
```

#### 4.4 CLI 工具验证

```
1. 对照 spec 的命令列表，逐个验证：
   - 正常输入 → 检查输出 + exit code
   - 无参数 / 错误参数 → 检查 help 输出和错误提示
   - 边界输入 → 检查不崩溃
2. 如果 CLI 有文件输出 → 检查输出文件内容
```

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

## E2E 验证详情
- 项目类型：[Web 前端 / API / CLI / 纯库]
- 验证工具：[agent-browser / Puppeteer / curl / CLI]
- 截图数量：N 张（保存在 /tmp/verify-screenshots/）

### 截图验证
| # | 操作 | 截图 | 多模态分析结果 | 判定 |
|---|---|---|---|---|
| 1 | 打开初始页面 | screenshot-01.png | 看到马里奥、地面、砖块 | ✅ |
| 2 | 按右方向键 | screenshot-02.png | 马里奥向右移动了约 3 格 | ✅ |
| 3 | 按跳跃键 | screenshot-03.png | 马里奥未跳起 | ❌ |

### 控制台检查
- JS 异常：0 / N 个
- 详情：...

### 返工记录（如果有）
| 次数 | 问题 | 路径 | 结果 |
|---|---|---|---|
| 1 | 跳跃不工作 | A（CC 修） | 修复后通过 |

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

### 路径 A：需求与实现不一致 → CC 修

当 OpenClaw 能明确判断"spec 说的是 X，但实现做的是 Y"时，直接让 CC 修。

```
superclaw session continue --name superclaw-<feature> --prompt "
验收发现以下问题，请使用 superpowers:systematic-debugging 修复：

## 问题 1
[截图路径（如果有）]
预期：spec 说 XXX
实际：截图/测试显示 YYY

## 问题 2
...

修复后跑测试确认。
"
```

**关键规则：**
- 使用 `session continue` 复用同一��� session
- 附截图让 CC 看到问题（如果是视觉问题）
- 必须指定用 `superpowers:systematic-debugging`，不让 CC 自由发挥
- CC 修完后 → **完整重新走 verify**（不只检查修复的部分）
- 每次返工都要在验证报告里记录（第几次返工、修了什么）

### 路径 B：需求本身有问题 → 找人

当 OpenClaw 不确定是实现错了还是 spec 不够清晰时，**不猜，找人**。

通知用户（飞书）：
```
⚠️ SuperClaw 验收发现问题，需要你判断：

[截图（如果有）]
spec 说：'...'
实际效���：'...'
我不确定是实现错了还是需求不够清晰。

请判断：
1. 实现是对的，继续验收
2. 实现有问题，我让 CC 改
3. spec 需要补充，回 align 阶段
```

**判断标准：**
- spec 里有明确的 acceptance criteria 且实现不满足 → 路径 A（CC 修）
- spec 的描述模糊、可以有多种理解 → 路径 B（找人）
- 实现了 spec 没提到的东西 → 路径 A（让 CC 删掉多余的）
- 发现 spec 遗漏了重要场景 → 路径 B��补充需求）

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
- **FAIL（路径 A）** → session continue + systematic-debugging → CC 修 → 完整重新 verify（循环）
- **FAIL（路径 B）** → 飞书通知用户，等用户决定（继续 / CC 改 / 回 align）

## Anti-Pattern

❌ 信任 CC 说的"测试全过了" — 自己跑
❌ 只检查修复的部分 — 每次 verify 都走完整流程
❌ 把技术问题直接甩给用户 — OpenClaw 先判断能不能自动修
❌ 验收报告含糊其辞 — 每条标准都要有明确的 ✅/❌
❌ 看了代码觉得应该没问题就放行 — 必须实际验证（跑测试/截图/调用）
❌ 让 CC 自由发挥修 bug — 必须指定 superpowers:systematic-debugging
❌ 不确定是 spec 还是实现的问题时猜 — 找人
❌ 返工后只检查修复的部分 — 每次都完整 verify
❌ E2E 验证时不截图 — 截图是证据，写进报告
