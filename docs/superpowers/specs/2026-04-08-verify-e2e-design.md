# Verify 阶段 E2E 验证增强

## Problem

现有的 verify skill 对 E2E 测试只写了"如果可行"，实际上 OpenClaw 从来没有真正做过端到端验证。CC 说"做完了"，OpenClaw 跑跑单元测试就放行了，导致交付的产出可能和 spec 不一致（比如 mario 游戏 Write 了空文件但没人发现）。

## Solution

重写 verify skill 的 Step 4（E2E 测试），让 OpenClaw 用浏览器自动化 + 多模态分析做"最大可能验证"，确保产出和 spec 对齐后才交付。同时明确返工流程的两条路径。

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| CC vs OpenClaw 分工 | CC 保证代码质量（L1），OpenClaw 保证产出与 spec 对齐（L2） | 各司其职，互不信任 |
| 浏览器工具 | 灵活选择（agent-browser / Puppeteer / curl 等） | 不同项目类型需要不同工具 |
| 验证深度 | 最大可能验证（截图 + 交互 + 多模态分析） | 只有真正确认对齐才放行 |
| 返工路径 | 两条：实现问题→CC用systematic-debugging修；需求问题→找人 | OpenClaw 能判断的不拖人，判断不了的不瞎猜 |

## Architecture

### CC 和 OpenClaw 的验收分工

| | CC（L1，execute 阶段内） | OpenClaw（L2，verify 阶段） |
|---|---|---|
| **测试类型** | 单元测试、TDD、代码 review | 端到端测试、视觉验证、用户路径模拟 |
| **关注点** | 代码对不对（函数行为、类型安全） | 产出对不对（用户看到的和 spec 一致吗） |
| **工具** | superpowers（TDD + review） | 浏览器自动化 + 截图 + 多模态分析 |
| **信任度** | 自我验证 | 不信任 CC，独立验证 |

核心理念：**CC 保证代码质量，OpenClaw 保证产出与 spec 对齐。**

### E2E 验证流程

```
execute 完成 → OpenClaw 收到通知
  → Step 1: 跑现有测试（保留）
  → Step 2: Spec acceptance criteria 逐条检查（保留）
  → Step 3: Concerns 检查（保留）
  → Step 4: 端到端验证（重写）
      ├─ 判断项目类型：
      │   ├─ Web 前端/游戏 → 浏览器自动化
      │   ├─ API 服务 → curl/HTTP 请求验证
      │   ├─ CLI 工具 → 命令行调用验证
      │   └─ 纯库 → 跳过 E2E，靠 Step 1-2
      │
      ├─ Web 前端验证流程：
      │   1. 启动服务（或直接打开 html 文件）
      │   2. 截图关键页面/状态
      │   3. 用多模态模型分析截图 vs spec 要求
      │   4. 模拟用户交互（点击、键盘、表单）
      │   5. 交互后再截图，验证状态变化
      │   6. 检查控制台有无报错
      │
      ├─ 生成 E2E 验证报告（带截图）
      └─ 判定：PASS / FAIL + 具体问题列表
  → Step 5: 代码质量抽检（保留）
```

### 项目类型对应的验证策略

| 项目类型 | 检测���式 | 验证工具 | 验证内容 |
|---|---|---|---|
| Web 前端/SPA | 检查 package.json 有 react/vue/next 等 | 浏览器自动化 | 截图 + 交互 + 控制台 |
| 静态 HTML（如 mario） | index.html 存在，无构建步骤 | 浏览器直接打开 | 截图 + 交互 + 控制台 |
| API 服务 | 有 routes/endpoints 定义 | curl / HTTP 请求 | 状态码 + 响应体 + 错误处理 |
| CLI 工具 | 有 bin 字段或可执行脚本 | 命令行调用 | 输出 + exit code + 边界输入 |
| 纯库 | 只有 src，无入口 | 跳过 E2E | 依赖 Step 1-2 的测试和 spec 检查 |

### Web 前端验证��细流程

以 mario 游戏为例：

```
1. 启动
   - 静态文件：浏览器直接打开 file:///root/code/mario/index.html
   - 需要构建：npm run build && npx serve dist
   - 需要 dev server：npm run dev

2. 截图初始状态
   - 截图 → 保存到 /tmp/verify-screenshots/
   - 多模态分析："这是一个 Mario 游戏的初始画面吗？
     能看到：(1) 马里奥精灵 (2) 地面 (3) 问号砖块 (4) 管道？"
   - 对照 spec 的视觉要求逐条确认

3. 模拟用户交互
   - 按右方向键 → 等 1 秒 → 截图 → "马里奥有没有向右移动？"
   - 按跳跃键 → 等 0.5 秒 → 截图 → "马里奥有没有跳起来？"
   - 走到问号砖块下方 → 跳 → "砖块有没有被顶？金币有没有出来？"

4. 检查控制台
   - 捕获所有 console.error 和 JS 异常
   - 任何未捕获异常 = FAIL

5. 汇总
   - 所有截图 + 分析结果 → E2E 验证报告
```

### 返工流程

#### 路径 A：需求与实现不一致 → CC 修

```
OpenClaw 发现问题
  → superclaw session continue --name superclaw-<feature>
  → prompt:
    "验收发现以下问题，请使用 superpowers:systematic-debugging 修复：

    ## 问题 1
    [截图路径]
    预期：spec 说 XXX
    实际：截图显示 YYY

    修复后跑测试确认。"
  → CC 用 systematic-debugging skill 修复
  → OpenClaw 重新走完整 verify（不只检查修复的部分）
```

关键：
- 使用 `session continue` 复用同一个 session
- 附截图让 CC 看到问题
- 指定用 `superpowers:systematic-debugging` 而不是让 CC 自由发挥
- 修完后完整重新 verify，不跳步

#### 路径 B：需求本身有问题 → 找人

```
OpenClaw 发现 spec 描述有歧义或不完整
  → 不发给 CC
  → 通知用户（飞书）：
    "⚠️ 验收发现问题，需要你判断：

    [截图]
    spec 说：'...'
    实际效果：'...'
    我不确定是实现错了还是需求不够清晰。

    请判断：
    1. 实现是对的，继续验收
    2. 实现有问题，我让 CC 改
    3. spec 需要补充，回 align 阶段"
  → 等用户回复后继续
```

关键：
- OpenClaw 自己能判断的问题（明确违反 spec）不拖人
- 判断不了的不瞎猜，找人决定
- 提供截图和上下文，让人有足够信息做判断

## Changes to verify skill

只改 Step 4 和返工流程，Step 1/2/3/5 保留不动。

### 新增内容

1. **项目类型检测逻辑**：根据项目文件自动判断用什么验证工具
2. **Web 前端 E2E 验证流程**：浏览器打开 → 截图 → 多模态分析 → 交互 → 再截图
3. **API 服务验证流程**：curl 请求 → 状态码 → 响应体检查
4. **CLI 验证流程**：命令行调用 → 输出 + exit code
5. **返工路径 A 模板**：session continue + systematic-debugging
6. **返工路径 B 模板**：飞书通知 + 等人决定
7. **E2E 验证报告格式**：带截图路径和多模态分析结果

## Not in scope

- 自动化 E2E 测试脚本生成（让 CC 在 execute 阶段写）
- 视频录制（截图足够）
- 性能测试（不是 verify 的职责）
- 移动端测试（当前只支持桌面浏览器）
