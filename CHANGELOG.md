# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-28

### Added

- **DESIGN.md**: Complete design document (10 chapters, 42KB) covering architecture, workflow, skill design, hook design, and borrowing sources
- **5 OpenClaw Skills**: align (product alignment), plan (technical alignment), execute (Claude Code orchestration), verify (independent acceptance), deliver (human handoff)
- **superclaw**: Bridge layer for OpenClaw → Claude Code communication (679-line Node.js wrapper with user switching, env injection, session management)
- **Hook system**: Claude Code native hooks for automatic notifications (Stop → Feishu notify, PostToolUse → progress logging)
- **INSTALL.md**: Agent-readable installation guide (5 parts, verification steps, troubleshooting)
- **Superpowers integration**: Claude Code side directly uses Superpowers plugin (11 skills, 3 prompt templates, 1 agent, 1 hook)
- **Three-level acceptance**: L1 Claude Code self-review → L2 OpenClaw independent verify → L3 Human final approval
