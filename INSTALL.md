# SuperClaw Installation Guide

> 把这个文档给任何一个 OpenClaw 实例看，它就能自动完成安装。

## 概述

SuperClaw 需要安装三个部分：
1. **OpenClaw 侧** — 5 个 skill 文件
2. **Claude Code 侧** — Superpowers plugin + hooks
3. **桥接层** — cc-delegate（OpenClaw 调用 Claude Code 的通道）

## 前置条件检查

在开始之前，请依次执行以下命令确认环境就绪：

```bash
# 1. OpenClaw 是否安装
openclaw --version
# 预期：显示版本号

# 2. Claude Code 是否安装
claude --version
# 预期：显示版本号（需要 2.x+）

# 3. OpenClaw gateway 是否运行
openclaw gateway status
# 预期：running

# 4. jq 是否安装（hooks 需要）
jq --version
# 如果没有：apt install jq / brew install jq
```

## Part 1: 安装 OpenClaw 侧 Skills

### 1.1 克隆 SuperClaw 仓库

```bash
# 选一个存放位置
SUPERCLAW_REPO="${HOME}/.openclaw/workspace/repos/superclaw"
mkdir -p "$(dirname "$SUPERCLAW_REPO")"

# 克隆（内网 GitLab）
git clone http://192.168.16.6/yuxi/superclaw.git "$SUPERCLAW_REPO"

# 或者如果无法访问内网，手动创建目录并下载文件
```

### 1.2 创建 OpenClaw Skill 目录

```bash
SKILL_DIR="${HOME}/.openclaw/workspace/skills/superclaw"
mkdir -p "$SKILL_DIR"
```

### 1.3 创建 Skill 入口文件

创建一个顶层 SKILL.md 作为 OpenClaw 的 skill 入口，它会引导 OpenClaw 根据阶段调用具体的子 skill：

```bash
cat > "$SKILL_DIR/SKILL.md" << 'SKILLEOF'
---
name: superclaw
description: |
  SuperClaw — OpenClaw + Claude Code 超级编码体。
  当用户要求开发功能、写代码、实现需求时使用。
  自动走 align → plan → execute → verify → deliver 五阶段流程。

  Use when:
  (1) 用户提出开发需求（"帮我实现 xxx"、"写一个 xxx"）
  (2) 用户说"用 SuperClaw"、"走 SuperClaw 流程"
  (3) 需要 OpenClaw 和 Claude Code 协作完成编码任务
---

# SuperClaw

OpenClaw + Claude Code 的超级编码体。人管方向，OpenClaw 管对齐和验收，Claude Code 管执行。

## 工作流

```
人 →[align]→ spec → 人 approve
  →[plan]→ plan → 人 approve（可跳过）
  →[execute]→ Claude Code 自治（subagent-driven）
  →[verify]→ OpenClaw 独立验收
  →[deliver]→ 人最终验收
```

## 阶段入口

根据当前状态，读取对应阶段的 skill 文件：

| 阶段 | 文件 | 触发条件 |
|---|---|---|
| align | `references/align.md` | 新需求进来 |
| plan | `references/plan.md` | spec 已 approve |
| execute | `references/execute.md` | plan 已 approve |
| verify | `references/verify.md` | execute 完成 |
| deliver | `references/deliver.md` | verify 通过 |

**默认从 align 开始。** 如果用户明确说"跳过 align，直接 plan"等，按用户指令走。

## 快速开始

1. 用户提出需求 → 读取 `references/align.md`，开始产品对齐
2. Spec approved → 读取 `references/plan.md`，发起技术规划
3. Plan approved → 读取 `references/execute.md`，启动 Claude Code
4. Execute 完成 → 读取 `references/verify.md`，独立验收
5. Verify 通过 → 读取 `references/deliver.md`，交付给用户
SKILLEOF
```

### 1.4 链接子 Skill 文件

```bash
# 创建 references 目录，链接各阶段 skill
mkdir -p "$SKILL_DIR/references"

ln -sf "$SUPERCLAW_REPO/openclaw-skills/align/SKILL.md"   "$SKILL_DIR/references/align.md"
ln -sf "$SUPERCLAW_REPO/openclaw-skills/plan/SKILL.md"    "$SKILL_DIR/references/plan.md"
ln -sf "$SUPERCLAW_REPO/openclaw-skills/execute/SKILL.md" "$SKILL_DIR/references/execute.md"
ln -sf "$SUPERCLAW_REPO/openclaw-skills/verify/SKILL.md"  "$SKILL_DIR/references/verify.md"
ln -sf "$SUPERCLAW_REPO/openclaw-skills/deliver/SKILL.md" "$SKILL_DIR/references/deliver.md"
```

### 1.5 验证 OpenClaw 侧安装

```bash
# 检查 skill 目录结构
ls -la "$SKILL_DIR/"
ls -la "$SKILL_DIR/references/"

# 预期输出：
# SKILL.md
# references/
#   align.md -> .../openclaw-skills/align/SKILL.md
#   plan.md -> .../openclaw-skills/plan/SKILL.md
#   execute.md -> .../openclaw-skills/execute/SKILL.md
#   verify.md -> .../openclaw-skills/verify/SKILL.md
#   deliver.md -> .../openclaw-skills/deliver/SKILL.md
```

## Part 2: 安装 Claude Code 侧

### 2.1 安装 Superpowers Plugin

```bash
# 方式 1: Claude Code 官方 marketplace（推荐）
# 在 Claude Code 终端中执行：
claude /plugin install superpowers@claude-plugins-official

# 方式 2: 手动安装
git clone --depth 1 https://github.com/obra/superpowers.git ~/.claude/skills/superpowers
```

验证 Superpowers 安装：
```bash
# 检查是否在已启用插件中
cat ~/.claude/settings.json | grep superpowers
# 预期：包含 "superpowers@claude-plugins-official": true
```

### 2.2 安装 SuperClaw Hooks

```bash
# 创建 hooks 目录
HOOKS_DIR="${HOME}/.superclaw/hooks"
mkdir -p "$HOOKS_DIR"

# 创建状态目录
STATE_DIR="${HOME}/.superclaw/state"
mkdir -p "$STATE_DIR"
```

#### 创建 superclaw-notify.sh

```bash
cat > "$HOOKS_DIR/superclaw-notify.sh" << 'HOOKEOF'
#!/bin/bash
# SuperClaw 通知脚本 — Claude Code → OpenClaw / 飞书

FEISHU_ACCOUNT="${SUPERCLAW_FEISHU_ACCOUNT:-default}"
FEISHU_TARGET="${SUPERCLAW_FEISHU_TARGET}"
OPENCLAW_PATH="${SUPERCLAW_OPENCLAW_PATH:-openclaw}"
STATE_DIR="${SUPERCLAW_STATE_DIR:-$HOME/.superclaw/state}"

mkdir -p "$STATE_DIR"

# 读取 hook 输入
HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

case "$TOOL_NAME" in
  "Stop")
    TITLE="🦞 Claude Code 执行完成"
    MESSAGE="Session: $SESSION_ID\n📅 $TIMESTAMP\n\n正在触发 OpenClaw 验收..."

    # 通知飞书
    if [ -n "$FEISHU_TARGET" ]; then
      $OPENCLAW_PATH message send \
        --channel feishu \
        --account "$FEISHU_ACCOUNT" \
        --target "$FEISHU_TARGET" \
        --message "$TITLE\n\n$MESSAGE" 2>/dev/null || true
    fi

    # 写状态文件
    echo "{\"event\":\"execute_done\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
      > "$STATE_DIR/last_event.json"
    ;;
  *)
    # 其他工具调用 → 记录日志
    echo "{\"tool\":\"$TOOL_NAME\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
      >> "$STATE_DIR/tool_log.jsonl"
    ;;
esac

exit 0
HOOKEOF

chmod +x "$HOOKS_DIR/superclaw-notify.sh"
```

#### 创建 superclaw-progress.sh

```bash
cat > "$HOOKS_DIR/superclaw-progress.sh" << 'HOOKEOF'
#!/bin/bash
# SuperClaw 进度记录 — PostToolUse → 记录每步操作

STATE_DIR="${SUPERCLAW_STATE_DIR:-$HOME/.superclaw/state}"
mkdir -p "$STATE_DIR"

HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "{\"tool\":\"$TOOL_NAME\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
  >> "$STATE_DIR/tool_log.jsonl"

exit 0
HOOKEOF

chmod +x "$HOOKS_DIR/superclaw-progress.sh"
```

### 2.3 配置 Claude Code Hooks

将 SuperClaw hooks 注册到 Claude Code 的 settings.json：

```bash
# 读取现有 settings，合并 hooks 配置
CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

# 备份
cp "$CLAUDE_SETTINGS" "${CLAUDE_SETTINGS}.bak.$(date +%s)"

# 用 jq 合并 hooks（保留现有配置）
# 如果没有 jq，手动编辑
if command -v jq &>/dev/null; then
  jq --arg notify "$HOOKS_DIR/superclaw-notify.sh" \
     --arg progress "$HOOKS_DIR/superclaw-progress.sh" \
     '.hooks = (.hooks // {}) |
      .hooks.Stop = (.hooks.Stop // []) + [{
        "type": "command",
        "command": $notify,
        "timeout": 30
      }] |
      .hooks.PostToolUse = (.hooks.PostToolUse // []) + [{
        "type": "command",
        "command": $progress,
        "timeout": 10
      }]' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp" && \
    mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"
  echo "✅ Hooks 已配置到 $CLAUDE_SETTINGS"
else
  echo "⚠️ jq 未安装，请手动编辑 $CLAUDE_SETTINGS 添加 hooks 配置"
  echo "参考 $SUPERCLAW_REPO/hooks/settings.json.example"
fi
```

## Part 3: 安装 cc-delegate 桥接层

cc-delegate 是 OpenClaw 调用 Claude Code 的核心通道。没有它，OpenClaw 无法启动 Claude Code session。

### 3.1 创建运行用户

Claude Code 拒绝在 root 下运行 `--permission-mode bypassPermissions`，必须用非 root 用户：

```bash
# 检查是否已有非 root 用户可用
id testclaude 2>/dev/null && echo "✅ testclaude 用户已存在" || {
  echo "创建 testclaude 用户..."
  sudo useradd -m -s /bin/bash testclaude
  # 如果需要 docker 权限：
  # sudo usermod -aG docker testclaude
}
```

### 3.2 部署 cc-delegate 脚本

```bash
CC_DELEGATE_DIR="/home/testclaude/cc-delegate"

# 从 superclaw 仓库复制
sudo -u testclaude mkdir -p "$CC_DELEGATE_DIR"
sudo cp "$SUPERCLAW_REPO/cc-delegate/cc-delegate.mjs" "$CC_DELEGATE_DIR/"
sudo chown testclaude:testclaude "$CC_DELEGATE_DIR/cc-delegate.mjs"
sudo chmod +x "$CC_DELEGATE_DIR/cc-delegate.mjs"

# 创建状态目录
sudo -u testclaude mkdir -p "$CC_DELEGATE_DIR/state"
```

### 3.3 配置环境变量

```bash
# 复制 .env 模板
sudo cp "$SUPERCLAW_REPO/cc-delegate/.env.example" "$CC_DELEGATE_DIR/.env"
sudo chown testclaude:testclaude "$CC_DELEGATE_DIR/.env"
sudo chmod 600 "$CC_DELEGATE_DIR/.env"

# 编辑 .env，填入真实值：
# ANTHROPIC_BASE_URL=你的API代理地址
# ANTHROPIC_AUTH_TOKEN=你的API Token
# CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
sudo nano "$CC_DELEGATE_DIR/.env"
```

⚠️ 三个环境变量缺一不可。`ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN` 取决于你的 API 代理配置。

### 3.4 安装 cc-delegate OpenClaw Skill

```bash
# 创建 skill 目录
CC_SKILL_DIR="${HOME}/.openclaw/workspace/skills/cc-delegate"
mkdir -p "$CC_SKILL_DIR/references" "$CC_SKILL_DIR/scripts"

# 复制 skill 文件
cp "$SUPERCLAW_REPO/cc-delegate/SKILL.md" "$CC_SKILL_DIR/"
cp "$SUPERCLAW_REPO/cc-delegate/references/setup-guide.md" "$CC_SKILL_DIR/references/"
cp "$SUPERCLAW_REPO/cc-delegate/scripts/cc-delegate.mjs" "$CC_SKILL_DIR/scripts/"
cp "$SUPERCLAW_REPO/cc-delegate/scripts/setup.sh" "$CC_SKILL_DIR/scripts/"
```

### 3.5 配置 testclaude 的 Claude Code

```bash
# Claude Code 需要在 testclaude 用户下有正确的配置
sudo -u testclaude mkdir -p /home/testclaude/.claude

# 创建 settings.json
sudo -u testclaude tee /home/testclaude/.claude/settings.json > /dev/null << 'EOF'
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "model": "opus[1m]",
  "permissions": {
    "allow": ["*"],
    "deny": []
  },
  "skipDangerousModePermissionPrompt": true,
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true
  }
}
EOF
```

⚠️ 如果你的 API 代理需要自定义 `apiBaseUrl`，在 settings.json 中添加 `"apiBaseUrl": "你的代理地址"`。

### 3.6 验证 cc-delegate

```bash
# 测试 status 命令
node /home/testclaude/cc-delegate/cc-delegate.mjs status
# 预期：显示 Claude Code 版本和配置状态

# 测试 exec 命令（快速执行）
node /home/testclaude/cc-delegate/cc-delegate.mjs exec --cwd /tmp --prompt "echo hello"
# 预期：Claude Code 执行并返回结果
```

## Part 4: 环境变量配置

```bash
# 在你的 shell profile（~/.bashrc 或 ~/.zshrc）中添加：

# SuperClaw 飞书通知目标（你的 open_id）
export SUPERCLAW_FEISHU_TARGET="ou_你的open_id"

# SuperClaw 状态目录
export SUPERCLAW_STATE_DIR="$HOME/.superclaw/state"

# 飞书账号（通常是 default）
export SUPERCLAW_FEISHU_ACCOUNT="default"

# OpenClaw 路径（通常不需要改）
export SUPERCLAW_OPENCLAW_PATH="openclaw"
```

获取你的 open_id：在飞书里问 OpenClaw "我的 open_id 是什么"。

## Part 5: 验证安装

### 5.1 验证目录结构

```bash
echo "=== OpenClaw Skill ==="
ls ~/.openclaw/workspace/skills/superclaw/
ls ~/.openclaw/workspace/skills/superclaw/references/

echo "=== Hooks ==="
ls ~/.superclaw/hooks/

echo "=== State ==="
ls ~/.superclaw/state/ 2>/dev/null || echo "(空，正常)"

echo "=== Claude Code Settings ==="
cat ~/.claude/settings.json | jq '.hooks' 2>/dev/null
```

### 5.2 测试 Hook

```bash
echo '{"tool_name": "Stop", "session_id": "test-install"}' | ~/.superclaw/hooks/superclaw-notify.sh
# 预期：飞书收到一条测试通知（如果配置了 SUPERCLAW_FEISHU_TARGET）
```

### 5.3 测试完整流程

在飞书里对 OpenClaw 说：

> "用 SuperClaw 帮我写一个 hello world"

OpenClaw 应该会启动 align 阶段，开始问你澄清问题。

## 故障排查

| 问题 | 检查 |
|---|---|
| OpenClaw 不认识 superclaw skill | `ls ~/.openclaw/workspace/skills/superclaw/SKILL.md` |
| 符号链接断了 | `ls -la ~/.openclaw/workspace/skills/superclaw/references/` |
| Hook 没触发 | `cat ~/.claude/settings.json \| jq '.hooks'` |
| 飞书没收到通知 | 检查 `SUPERCLAW_FEISHU_TARGET` 和 `openclaw gateway status` |
| Claude Code 没装 Superpowers | `cat ~/.claude/settings.json \| grep superpowers` |
| cc-delegate 调不通 | 参考 cc-delegate 独立文档排查 |

## 一键安装脚本（可选）

如果你希望全自动安装，在终端执行：

```bash
curl -sL http://192.168.16.6/yuxi/superclaw/-/raw/main/scripts/install.sh | bash
```

> ⚠️ install.sh 尚未实现，上述命令仅为规划。当前请按本文档手动安装。
