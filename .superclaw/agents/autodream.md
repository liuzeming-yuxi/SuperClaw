---
agent: autodream
type: persistent
trigger:
  type: condition
  condition: "sessions_since_last >= 5 AND hours_since_last >= 24"
state_file: .superclaw/agents/autodream-state.json
last_run: ""
next_eligible: ""
status: idle
---

# AutoDream — Memory Consolidation Agent

## Purpose
定期整理 OpenClaw 记忆文件，保持记忆库整洁、无重复、索引清晰。

## Trigger
- 距上次 consolidation >= 24 小时
- 自上次 consolidation 以来 >= 5 个 session

## Run History

| Time | Duration | Result | Notes |
|------|----------|--------|-------|
