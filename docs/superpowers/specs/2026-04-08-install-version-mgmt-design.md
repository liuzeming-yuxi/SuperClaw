---
date: 2026-04-08
status: draft
---

# 统一安装与版本管理设计

## 背景

superclaw 当前安装机制有以下问题：

1. **两个安装脚本**（`scripts/install.sh` + `cli/scripts/setup.sh`），职责重叠
2. **混合 copy/symlink 策略**——phase skills 用 symlink，hooks 和 superclaw.mjs 用 copy，导致更新行为不一致
3. **无版本追踪**——`package.json` 有 version 但安装后不记录，无法判���是否需要更新
4. **无 update 机制**——全靠手动重跑 install
5. **面向开源/团队分发**，需要 release 级别的标准

## 设计目标

- 单一安装入口，幂等：第一次跑是安装，再跑就是更新
- 全 symlink 策略：repo 改动即时生效，消除 copy 同步问题
- Git tag 版本管理：`v0.1.0` 等 semver tag
- 安装状态持久化：`~/.superclaw/installed.json` 记录版本、commit、时间
- `superclaw version` / `superclaw update` 子命令
- 启动时版本偏移检测（warning，不阻塞）

## 1. 版本管理

### 版本号来源

- `package.json` 的 `version` 字段为 source of truth（当前 `0.1.0`）
- 每次 release 打 git tag `v{version}`
- `superclaw version` 从安装状态和 repo 双向读取

### 安装状态文件 `~/.superclaw/installed.json`

```json
{
  "version": "0.1.0",
  "commit": "9c3ec80",
  "commitFull": "9c3ec80abcdef1234567890",
  "installedAt": "2026-04-08T19:30:00.000Z",
  "repoPath": "/root/.openclaw/workspace/repos/superclaw",
  "installer": "scripts/install.sh"
}
```

install 结束时写入。`superclaw version` 和启动时版本检查都读这个文件。

### `superclaw version` 输出

```
superclaw v0.1.0 (9c3ec80, installed 2026-04-08)
repo:      v0.1.0 (9c3ec80) — up to date
```

或者有偏移时：

```
superclaw v0.1.0 (9c3ec80, installed 2026-04-08)
repo:      v0.2.0 (def5678) — 3 commits ahead, run 'superclaw update'
```

### 启动时版本检查

在 `cmdExec`、`cmdSessionStart`、`cmdSessionContinue` 入口，检查 `installed.json` 的 `commitFull` 与 repo `git rev-parse HEAD` 是否一致。不一致时打 warning 到 stderr：

```
[superclaw] warning: installed (9c3ec80) != repo (def5678). Run 'superclaw update'.
```

Best-effort，不阻塞执行。git 命令失败时（比如 repo 目录不存在）静默跳过。

## 2. 统一安装器

### 合并策略

将 `scripts/install.sh` 和 `cli/scripts/setup.sh` 合并为单一 `scripts/install.sh`。删除 `cli/scripts/setup.sh`。

### 全 symlink 安装足迹

安装完成后的文件布局：

```
# OpenClaw Skills（全部 symlink）
~/.openclaw/workspace/skills/superclaw/
  ├── SKILL.md                    → <repo>/skills/superclaw/SKILL.md
  └── references/
      ├── align.md                → <repo>/skills/align/SKILL.md
      ├── plan.md                 → <repo>/skills/plan/SKILL.md
      ├── execute.md              → <repo>/skills/execute/SKILL.md
      ├── verify.md               → <repo>/skills/verify/SKILL.md
      └── using-superclaw.md      → <repo>/skills/using-superclaw/SKILL.md

# CLI Skill（全部 symlink）
~/.openclaw/workspace/skills/superclaw-cli/
  ├── SKILL.md                    → <repo>/cli/SKILL.md
  └── references/
      └── setup-guide.md          → <repo>/cli/references/setup-guide.md

# Hooks（symlink）
~/.superclaw/hooks/
  ├── superclaw-notify.sh         → <repo>/hooks/superclaw-notify.sh
  └── superclaw-progress.sh       → <repo>/hooks/superclaw-progress.sh

# Runtime state（安装器创建目录，运行时填充）
~/.superclaw/
  ├── installed.json              ← 安装器写入（regular file）
  └── state/
      ├── sessions/
      └── tool_log.jsonl

# superclaw CLI（symlink + wrapper）
/root/.openclaw/workspace/bin/
  ├── superclaw.mjs               → <repo>/cli/superclaw.mjs （symlink）
  ├── .env                        ← 安装器生成模板（regular file，不覆盖已有）
  └── state/                      ← 运行时 session manifest

# 全局命令入口（唯一的 regular file，因为需要稳定入口路径）
/usr/local/bin/superclaw          ← shell wrapper
```

**关键变化：**
- hooks 从 copy 改为 symlink
- superclaw.mjs 从 copy 改为 symlink
- superclaw-cli SKILL.md 从 copy 改为 symlink
- 删除 superclaw-cli 下冗余的 scripts/ 复制（setup.sh、superclaw.mjs）

### .env 处理

- .env 包含用户密钥，永远不覆盖已有文件
- 首次安装时从 `cli/.env.example` 生成模板
- `superclaw update` 时如果 `.env.example` 有新增字段，打印提示但不自动修改

### settings.json Hook 注入

- 幂等：先检查是否已配置，已有则跳过
- Hook 命令路径指向 symlink 位置（`~/.superclaw/hooks/superclaw-notify.sh`）
- 修改前自动备份 `settings.json.bak.{timestamp}`

### 安装器伪代码

```bash
#!/bin/bash
# scripts/install.sh — superclaw unified installer

# Preflight: openclaw, node>=18, jq, git, repo location
# Read version from package.json

# ─── Part 1: OpenClaw Skills ───
# Create skill dirs, symlink phase files

# ─── Part 2: Hooks ───
# Create ~/.superclaw/hooks/
# Symlink hooks (ln -sfn, 幂等)
# chmod +x
# Inject into settings.json (if not present)

# ─── Part 3: CLI ───
# Symlink superclaw.mjs to bin/
# Create /usr/local/bin/superclaw wrapper (if not present or outdated)
# Generate .env template (if not exists)
# Create state directories

# ─── Part 4: Version stamp ───
# Write ~/.superclaw/installed.json

# ─── Summary ───
# Print installed version, paths, next steps
```

## 3. `superclaw update` 子命令

### 命令

```
superclaw update [--check]
```

- 无参数：执行 git pull + 重新运行 install.sh
- `--check`：只检查是否有更新，不执行

### 逻辑

```
1. 读 installed.json 获取 repoPath
2. cd repoPath
3. git fetch origin main
4. 比较 HEAD 和 origin/main
5. --check 模式：打印差异信息，退出
6. 非 check 模式：
   a. git pull origin main
   b. exec bash scripts/install.sh（重新安装，幂等）
   c. 安装器末尾自动更新 installed.json
```

### `superclaw update --check` 输出

```
superclaw v0.1.0 (9c3ec80)
remote:   v0.2.0 (def5678) — 5 commits ahead

Recent changes:
  def5678 feat: add session ps command
  abc1234 fix: PID reuse safety check
  ...

Run 'superclaw update' to apply.
```

## 4. `superclaw version` 子命令

### 命令

```
superclaw version
```

### 逻辑

```
1. 读 installed.json → 已安装版本和 commit
2. 读 package.json → repo 版本
3. git rev-parse HEAD → repo commit
4. 比较，输出状态
```

## 5. 启动时版本偏移检测

在 `superclaw.mjs` 中新增 `checkVersionDrift()` 函数，在 exec/start/continue 入口调用（和 `autoCleanStaleSessions()` 同级）。

```js
function checkVersionDrift() {
  try {
    const installed = JSON.parse(readFileSync(INSTALLED_JSON_PATH, "utf8"));
    const headCommit = execSync("git rev-parse HEAD", { cwd: REPO_PATH, ... }).toString().trim();
    if (installed.commitFull && installed.commitFull !== headCommit) {
      process.stderr.write(`[superclaw] warning: installed (${installed.commit}) != repo (${headCommit.slice(0,7)}). Run 'superclaw update'.\n`);
    }
  } catch { /* best-effort */ }
}
```

为避免每次启动都 spawn git 进程，缓存 HEAD commit 到内存（进程生命周期内只检查一次）。

## 6. 修改清单

| 文件 | 操作 |
|------|------|
| `scripts/install.sh` | 重写：合并两个脚本，全 symlink，写 installed.json |
| `cli/scripts/setup.sh` | 删除（逻辑合并到 install.sh） |
| `cli/superclaw.mjs` | 新增 `version`/`update` 子命令、版本偏移检查 |
| `tests/install/verify-install.sh` | 更新：检查 symlink 而非 copy，检查 installed.json |
| `tests/cli/test-status.sh` | 新增 version 命令测试 |
| `INSTALL.md` | 更新文档 |
| `cli/SKILL.md` | 新增 version/update 命令文档 |

## 7. 验证计划

```bash
# 全新安装
rm -rf ~/.superclaw ~/.openclaw/workspace/skills/superclaw*
rm -f /usr/local/bin/superclaw /root/.openclaw/workspace/bin/superclaw.mjs
bash scripts/install.sh
superclaw version
superclaw status
superclaw session ps

# 验证全 symlink
ls -la ~/.superclaw/hooks/superclaw-notify.sh    # → repo/hooks/...
ls -la /root/.openclaw/workspace/bin/superclaw.mjs # → repo/cli/...
cat ~/.superclaw/installed.json

# 验证幂等
bash scripts/install.sh  # 再跑一次，无报错

# 验证更新检测
superclaw update --check

# 验证安装验证脚本
bash tests/install/verify-install.sh
```
