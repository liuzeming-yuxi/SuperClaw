# Hello World — SuperClaw E2E Example

> 最小完整流程：用 SuperClaw 创建一个 hello world CLI 工具

## 用法

在飞书里对 OpenClaw 说：

> "用 SuperClaw 帮我写一个 Node.js CLI 工具，运行后输出 Hello, SuperClaw!"

## 预期流程

1. **align** — OpenClaw 问几个澄清问题（语言、输出格式等），写 spec
2. **plan** — Claude Code 探索后生成 plan（大概 2-3 个 task）
3. **execute** — Claude Code 执行 plan（TDD：先写测试再写实现）
4. **verify** — OpenClaw 独立跑 `node hello.js` 验证输出
5. **deliver** — 告诉用户"做好了，运行 `node hello.js` 试试"

## 预期产出

```
hello-world/
├── hello.js         # 主程序
├── hello.test.js    # 测试
└── package.json     # 项目配置
```

## 预期时间

align: 2 分钟 | plan: 1 分钟 | execute: 2 分钟 | verify: 1 分钟 | deliver: 30 秒

**总计：约 6-7 分钟**（大部分时间在 align 阶段跟用户对话）

## 验证

```bash
cd hello-world
node hello.js
# 预期输出：Hello, SuperClaw!

npm test
# 预期：all tests pass
```
