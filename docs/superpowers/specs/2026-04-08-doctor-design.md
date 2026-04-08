---
date: 2026-04-08
status: draft
---

# superclaw doctor 设计

## Context

superclaw 安装后缺少统一的健康检查工具。当前 `verify-install.sh` 只覆盖安装完整性，不检查运行时状态、连通性和安全性，也不能自动修复。参照 `openclaw doctor` 的模式，新增 `superclaw doctor` 命令。

## 命令接口

```
superclaw doctor [--fix] [--verbose]
```

- 无参数：只检查，报告问题（failed + warnings）
- `--fix`：自动修复可修复的问题
- `--verbose`：显示所有检查项（含通过的）

## 检查项（5 类 27 项）

### 1. Prerequisites（前置依赖，7 项）

| # | 检查 | 方法 | 失败级别 |
|---|------|------|---------|
| 1 | Node.js >= 18 | `node --version` | FAIL |
| 2 | jq 可用 | `jq --version` | FAIL |
| 3 | git 可用 | `git --version` | FAIL |
| 4 | Claude Code 已安装 | `claude --version` | FAIL |
| 5 | Claude Code 版本 | 解析版本号 | WARN（过旧时） |
| 6 | OpenClaw 已安装 | `openclaw --version` | WARN |
| 7 | Superpowers plugin 已启用 | 检查 settings.json `enabledPlugins["superpowers@claude-plugins-official"]` | WARN |

### 2. Installation（安装完整性，9 项）

| # | 检查 | 方法 | 失败级别 |
|---|------|------|---------|
| 8 | installed.json 存在且有效 | 读取 + JSON.parse | FAIL |
| 9 | 版本漂移 | installed.json commit vs `git rev-parse HEAD` | WARN |
| 10 | bin/superclaw.mjs symlink 有效 | `lstatSync` + 目标存在 | FAIL |
| 11 | skills symlinks 完整 | 遍历 superclaw/references/*.md + superclaw-cli/SKILL.md | FAIL |
| 12 | hooks symlinks 有效 | ~/.superclaw/hooks/ 两个文件 | FAIL |
| 13 | hook 脚本可执行 | `accessSync(path, X_OK)` | FAIL |
| 14 | settings.json hooks.Stop 配置 | jq 检查 + 命令路径指向有效文件 | FAIL |
| 15 | settings.json hooks.PostToolUse 配置 | 同上 | FAIL |
| 16 | .env 存在 + 权限 600 | `statSync` | FAIL |

### 3. Configuration（配置有效性，4 项）

| # | 检查 | 方法 | 失败级别 |
|---|------|------|---------|
| 17 | ANTHROPIC_BASE_URL 非空 | 读 .env 解析 | FAIL |
| 18 | ANTHROPIC_AUTH_TOKEN 非空 | 读 .env 解析 | FAIL |
| 19 | ANTHROPIC_AUTH_TOKEN 格式合理 | 以 `sk-` 开头且长度 > 20 | WARN |
| 20 | /usr/local/bin/superclaw wrapper 存在 | `existsSync` | WARN |

### 4. Runtime（运行时状态，4 项）

| # | 检查 | 方法 | 失败级别 |
|---|------|------|---------|
| 21 | stale sessions | `readAllActiveSessions().filter(!alive)` | WARN |
| 22 | orphan config dirs | 扫描 `state/claude-config/`，超 32 个或超 7 天 | WARN |
| 23 | tool_log.jsonl 大小 | `statSync`，超 50MB 警告 | WARN |
| 24 | session manifest 可读 | `readManifest()` 不抛错 | FAIL |

### 5. Connectivity（连通性，3 项）

| # | 检查 | 方法 | 失败级别 |
|---|------|------|---------|
| 25 | ACPX 可解析 | `spawnSync("acpx", ["--version"])` | WARN |
| 26 | API 端点可达 | `fetch(ANTHROPIC_BASE_URL, {timeout: 3000})` 或 curl | WARN |
| 27 | OpenClaw gateway | `fetch("http://127.0.0.1:18789/health", {timeout: 3000})` | WARN（不可达时） |

## 输出格式

默认（只显示问题）：

```
superclaw doctor v0.1.0
────────────────────────

✅ Prerequisites (7/7)
✅ Installation (9/9)
✅ Configuration (4/4)
⚠️  Runtime (3/4)
  ⚠️  2 stale sessions found (--fix to clean)
✅ Connectivity (3/3)

27 passed | 0 failed | 1 warning
```

`--verbose` 显示每项：

```
superclaw doctor v0.1.0
────────────────────────

Prerequisites:
  ✅ Node.js v22.22.0 (>= 18)
  ✅ jq 1.6
  ✅ git 2.34.1
  ✅ Claude Code 2.1.84
  ✅ OpenClaw 2026.4.5
  ✅ Superpowers plugin enabled
  ...
```

## `--fix` 自动修复

| 问题 | 修复动作 |
|------|---------|
| stale sessions | `removeActiveSession()` 清理 |
| orphan config dirs | 删除超龄/超量目录（复用 `pruneConfigOverrides`） |
| tool_log.jsonl 过大 | 轮转为 `.old` |
| hook 不可执行 | `chmod +x` |
| hooks 未配置 | 注入到 settings.json（和 install.sh 同逻辑） |
| hook symlink 断裂 | 重新 `ln -sfn` |
| broken skills symlinks | 重新 `ln -sfn` |
| missing installed.json | 提示用户运行 `bash scripts/install.sh` |
| missing .env fields | 提示用户编辑（不自动填写密钥） |
| Superpowers 未安装 | 提示 `claude /plugin install superpowers@claude-plugins-official` |

"提示"类修复只打印建议命令，不自动执行。

## 实现

### 位置

在 `cli/superclaw.mjs` 中新增：
- `cmdDoctor(opts)` — 主函数，编排 5 类检查
- 复用已有：`isPidAlive`、`isPidOurs`、`readAllActiveSessions`、`readManifest`、`pruneConfigOverrides`

### CLI 接线

- `parseArgs`：识别 `doctor` 命令，解析 `--fix` 和 `--verbose` flag
- `printUsage`：加入 `superclaw doctor [--fix] [--verbose]`
- `main()` dispatch：加入 `case "doctor"`
- `isShortSubcommand`：加入 `"doctor"`

### 新增 opts 字段

```js
fix: false,      // --fix
verbose: false,  // --verbose
```

## 修改清单

| 文件 | 操作 |
|------|------|
| `cli/superclaw.mjs` | 新增 cmdDoctor + CLI 接线 |
| `cli/SKILL.md` | 新增 doctor 命令文档 |

## 验证

```bash
superclaw doctor
superclaw doctor --verbose
superclaw doctor --fix
superclaw --help  # 应包含 doctor
```
