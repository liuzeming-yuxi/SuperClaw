# Contributing to SuperClaw

Thanks for your interest in contributing!

## Getting Started

1. Fork the repo and clone it locally
2. Install dependencies: `bash scripts/install.sh --dry-run` (to preview)
3. Run tests: `bash tests/run-all.sh`

## Development Workflow

- Create a feature branch from `main`
- Write tests for new functionality
- Ensure all tests pass before submitting a PR
- Follow existing code style and conventions

## Project Structure

- `skills/` — OpenClaw-side skill definitions (one per phase)
- `cc-delegate/` — Bridge layer between OpenClaw and Claude Code
- `hooks/` — Claude Code hook scripts
- `commands/` — Quick skill invocation commands
- `tests/` — Test suite (install, hooks, cc-delegate, e2e)
- `docs/` — Design docs and architecture notes

## Reporting Issues

Use the GitHub issue templates for bug reports and feature requests.

## Code Style

- Shell scripts: `set -euo pipefail`, use `shellcheck` when possible
- JavaScript (ESM): Node.js 18+, no external dependencies
- Markdown: Keep lines readable, use tables for structured data

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
