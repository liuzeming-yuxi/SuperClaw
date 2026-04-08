---
date: 2026-04-08
status: draft
---

# Release v0.1.0 Readiness Fixes

## Context

审计发现 superclaw 有 2 个 release blocker（硬编码凭证）和 6 个 P0 缺失项。本 spec 覆盖所有修复。

## B1/B2: board-server 硬编码凭证修复

**文件:** `board-server/cmd/server/main.go`

当前问题：
- L36: `OpenClawToken: "130b9e35e8c7e52b3992253f54047d4726ec60c4d23c5ab1"` — 硬编码 token
- L45: `AllowedOrigins: []string{"http://192.168.16.30:*", ...}` — 暴露开发者内网 IP

修复：改为环境变量，保留安全的 localhost 默认值。

```go
OpenClawBaseURL: envOr("OPENCLAW_BASE_URL", "http://127.0.0.1:18789"),
OpenClawToken:   os.Getenv("OPENCLAW_TOKEN"),
AllowedOrigins:  strings.Split(envOr("BOARD_ALLOWED_ORIGINS", "http://localhost:*,http://127.0.0.1:*"), ","),
```

添加 `envOr` helper（如不存在）：
```go
func envOr(key, fallback string) string {
    if v := os.Getenv(key); v != "" { return v }
    return fallback
}
```

## P0-1: SECURITY.md

创建标准安全策略文件，内容：
- 漏洞报告流程（GitHub Security Advisory）
- 响应时间承诺（72h 确认）
- 支持版本范围（最新 minor 版本）
- 不适用范围

## P0-2: README badges

在 README.md 标题后加 3 个 shields.io badges：
- License: MIT
- Version: 0.1.0
- Node: >= 18

## P0-3: package.json 补全

添加字段：
- `engines: {"node": ">=18"}`
- `homepage`
- `bugs.url`
- `scripts.test`

## P0-4: .editorconfig

root=true, indent_style=space, indent_size=2, end_of_line=lf, charset=utf-8。Markdown 不 trim 尾部空格。

## P0-5: .nvmrc

内容：`22`

## P0-6: Git tag v0.1.0

提交所有修复后打 `v0.1.0` tag。

## 修改清单

| 文件 | 操作 |
|------|------|
| `board-server/cmd/server/main.go` | 修改：凭证改为环境变量 |
| `SECURITY.md` | 新建 |
| `README.md` | 修改：加 badges |
| `package.json` | 修改：补全字段 |
| `.editorconfig` | 新建 |
| `.nvmrc` | 新建 |

## 验证

```bash
grep -n "130b9e35\|192.168.16.30" board-server/cmd/server/main.go  # 应无输出
cat SECURITY.md
head -5 README.md  # 应有 badges
node -e "const p=require('./package.json'); console.log(p.engines, p.homepage, p.scripts)"
cat .editorconfig
cat .nvmrc
git tag -l v0.1.0
```
