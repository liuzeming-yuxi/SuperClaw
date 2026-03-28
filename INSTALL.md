# SuperClaw Installation Guide

> 脚本干活，文档说怎么调脚本。

## 前置条件

| 依赖 | 最低版本 | 检查命令 |
|---|---|---|
| OpenClaw | - | `openclaw --version` |
| Node.js | 18+ | `node --version` |
| jq | - | `jq --version` |
| Claude Code | 2.x+ | `claude --version` |

缺什么装什么：
- jq: `apt install jq` / `brew install jq`
- Claude Code: `curl -fsSL https://claude.ai/install.sh | bash`

## 一键安装

```bash
# 1. 克隆仓库
git clone https://github.com/noumena-ai/superclaw.git
cd superclaw

# 2. 运行安装脚本（需要 root 权限以创建 cc-delegate 用户）
sudo bash scripts/install.sh
```

就这样。脚本会自动完成：
- 创建 OpenClaw skill 目录 + 符号链接
- 部署 hook 脚本到 `~/.superclaw/hooks/`
- 配置 Claude Code settings.json 的 hooks
- 创建 cc-delegate 运行用户 + 部署桥接脚本
- 安装 cc-delegate OpenClaw skill

## 安装选项

```bash
# 只装 OpenClaw 侧（跳过 cc-delegate，比如已经装过）
sudo bash scripts/install.sh --skip-cc-delegate

# 只装 skill，不配置 hooks
bash scripts/install.sh --skip-cc-delegate --skip-hooks

# 自定义 cc-delegate 运行用户（默认 testclaude）
sudo bash scripts/install.sh --delegate-user myuser

# 预览模式（只打印，不执行）
bash scripts/install.sh --dry-run

# 指定仓库路径（非标准位置克隆时）
bash scripts/install.sh --repo-dir /path/to/superclaw
```

## 安装后配置

### 1. cc-delegate 环境变量

安装脚本会生成 `/home/<delegate-user>/cc-delegate/.env` 模板，你需要填入真实值：

```bash
sudo nano /home/testclaude/cc-delegate/.env
```

```ini
# 你的 API 代理地址
ANTHROPIC_BASE_URL=https://api.anthropic.com

# 你的 API Token
ANTHROPIC_AUTH_TOKEN=sk-xxx

# 禁用非必要流量（代理场景推荐开启）
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

⚠️ 三个变量缺一不可。

### 2. 飞书通知（可选）

如果希望 Claude Code 完成后自动飞书通知：

```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
export SUPERCLAW_FEISHU_TARGET="ou_你的open_id"
```

获取 open_id：在飞书里问 OpenClaw "我的 open_id 是什么"。

### 3. Superpowers 插件

Claude Code 侧需要安装 Superpowers：

```bash
# 在 Claude Code 里执行
claude /plugin install superpowers@claude-plugins-official
```

## 验证安装

```bash
# 跑完整测试套件
bash tests/run-all.sh

# 或单独验证安装状态
bash tests/install/verify-install.sh
```

## 快速开始

在飞书里对 OpenClaw 说：

> "用 SuperClaw 帮我写一个 hello world"

## 故障排查

| 症状 | 检查 |
|---|---|
| OpenClaw 不认识 superclaw skill | `ls ~/.openclaw/workspace/skills/superclaw/SKILL.md` |
| 符号链接断裂 | `ls -la ~/.openclaw/workspace/skills/superclaw/references/` |
| Hook 没触发 | `jq '.hooks' ~/.claude/settings.json` |
| 飞书没收到通知 | 检查 `$SUPERCLAW_FEISHU_TARGET` 和 `openclaw gateway status` |
| cc-delegate 调不通 | `node /home/testclaude/cc-delegate/cc-delegate.mjs status` |
| Claude Code 权限问题 | 确认用了非 root 用户运行 |

详细排查见 [cc-delegate 文档](cc-delegate/references/setup-guide.md)。

## 卸载

```bash
# 移除 OpenClaw skills
rm -rf ~/.openclaw/workspace/skills/superclaw
rm -rf ~/.openclaw/workspace/skills/cc-delegate

# 移除 hooks
rm -rf ~/.superclaw

# 移除 Claude Code hooks 配置（手动编辑）
# jq 'del(.hooks.Stop[] | select(.command | contains("superclaw")))' ~/.claude/settings.json
```

## 给 OpenClaw 的安装指令

如果你是 OpenClaw 实例，按以下步骤安装：

1. 确认前置条件（`node --version`, `jq --version`, `openclaw --version`）
2. 克隆仓库：`git clone https://github.com/noumena-ai/superclaw.git`
3. 执行安装：`sudo bash scripts/install.sh`
4. 编辑 `.env`：`sudo nano /home/testclaude/cc-delegate/.env`
5. 验证：`bash tests/run-all.sh`

不需要手动创建任何目录或符号链接，脚本全包了。
