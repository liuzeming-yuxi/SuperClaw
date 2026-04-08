# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in SuperClaw, please report it responsibly:

1. **Do NOT open a public issue.**
2. Use [GitHub Security Advisories](https://github.com/liuzeming-yuxi/SuperClaw/security/advisories/new) to report the vulnerability privately.
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- **72 hours**: We will acknowledge receipt of your report.
- **7 days**: We will provide an initial assessment.
- **30 days**: We aim to release a fix for confirmed vulnerabilities.

## Scope

This policy applies to the SuperClaw repository and its components:
- `cli/superclaw.mjs` (CLI bridge)
- `board-server/` (Go backend)
- `hooks/` (Claude Code hooks)
- `scripts/install.sh` (installer)

## Security Considerations

- **API credentials**: SuperClaw reads API tokens from `.env` files (not hardcoded). Never commit `.env` files.
- **IS_SANDBOX=1**: The CLI runs as root with sandbox bypass. Only run in trusted environments.
- **Hook scripts**: Hooks execute shell commands. Review hook content before installation.

## Contact

For security concerns, use [GitHub Security Advisories](https://github.com/liuzeming-yuxi/SuperClaw/security/advisories/new).
