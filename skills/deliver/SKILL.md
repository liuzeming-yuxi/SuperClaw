---
name: superclaw-deliver
description: |
  SuperClaw Phase 4-L3: 人类最终验收交付。把验证通过的产出交给用户做最终确认。
  使用场景：verify 阶段通过。
  终态：用户 approve → 完成；用户要调整 → 回 verify/execute；用户丢弃 → 结束。
---

# SuperClaw: Deliver

> Phase 4-L3 — 人类最终验收

验收通过了，把成果交给用户。说人话，不说技术话。

**宣告：** "验收通过 ✅，来看看成果。"

## 前置条件

- verify 阶段已 PASS / PASS_WITH_NOTES
- 验证报告已生成

## 流程

```
收到验证报告（PASS）
  → 生成交付摘要（面向用户）
  → 展示给用户
  → 用户选择：
      ├─ "approve" → 收尾（commit/merge/PR）
      ├─ "调整" → 收集反馈 → 回 execute 或 verify
      └─ "丢弃" → 清理 → 结束
```

## 交付摘要

给用户看的是**产品层面**的总结，不是技术报告：

```markdown
## ✅ [Feature Name] 完成

### 做了什么
用一两段话描述，用用户能懂的语言。
不要说"实现了 UserService 类"，要说"现在可以用邮箱注册和登录了"。

### 关键变化
- 新增了 xxx 功能
- 改进了 xxx 体验
- 修复了 xxx 问题

### 数据
- 新增 N 个文件，修改 N 个文件
- 测试：XX 个通过
- 代码变更：+XXX / -XXX 行

### 注意事项（如果有）
- ...

### 下一步建议（如果有）
- ...
```

## 用户选择

### Approve → 收尾

> "很好，merge 吧"

收尾流程：
1. 确认所有测试通过
2. 如果是 feature branch → 提示 merge 方式（merge/squash/rebase）
3. 如果需要 PR → 生成 PR 描述
4. 清理临时文件（.superclaw/ 状态文件）

通知飞书：
```
🎉 SuperClaw 交付完成

Feature: [名称]
状态：已 merge / 已创建 PR
耗时：从 align 到 deliver 共 xx 分钟
```

### 调整 → 收集反馈

> "这里不太对，xxx 应该 xxx"

处理：
1. 记录用户反馈
2. 判断反馈类型：
   - 小改动（UI 调整、文案修改）→ 直接发给 CC 修 → 重新 verify
   - 功能方向问题 → 回到 plan 重新规划
   - 需求变更 → 回到 align 重新对齐
3. 告诉用户走哪个路径

### 丢弃 → 清理

> "算了不要了"

处理：
1. 确认："确定丢弃？代码改动会保留在分支上但不会 merge。"
2. 用户确认后：
   - 不删除代码（保留分支作为参考）
   - 清理 .superclaw/ 状态文件
   - 记录到日志

通知飞书：
```
🗑️ SuperClaw 任务终止

Feature: [名称]
状态：用户选择丢弃
分支保留：<branch-name>
```

## 终态

| 用户选择 | 结果 |
|---|---|
| Approve | 收尾（merge/PR）→ 🎉 完成 |
| 调整 | 回 execute/verify/plan/align（取决于反馈类型）|
| 丢弃 | 清理 → 结束 |

## Anti-Pattern

❌ 给用户看技术报告 — 说人话
❌ 直接 merge 不问用户 — 必须用户 approve
❌ 丢弃时删代码 — 保留分支，万一后面要用
❌ 用户说"调整"就直接改 — 先判断反馈类型，走正确的路径
