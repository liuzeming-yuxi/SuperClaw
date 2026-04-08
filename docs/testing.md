# Testing SuperClaw

## Test Structure

```
tests/
├── run-all.sh                  # Run all test suites
├── install/
│   └── verify-install.sh       # Installation verification (all components)
├── hooks/
│   ├── test-notify.sh          # Stop hook → state file + notify
│   └── test-progress.sh        # PostToolUse hook → JSONL log
├── cli/
│   └── test-status.sh          # Bridge layer basic commands
└── e2e/
    └── hello-world/            # Minimal end-to-end flow
        └── README.md
```

## Running Tests

### All tests

```bash
bash tests/run-all.sh
```

### Individual suites

```bash
# Hook tests (no external dependencies, always runnable)
bash tests/hooks/test-notify.sh
bash tests/hooks/test-progress.sh

# Installation verification
bash tests/install/verify-install.sh

# superclaw tests (requires superclaw installed at /root/.openclaw/workspace/bin/)
bash tests/cli/test-status.sh
```

## Test Philosophy

1. **Hook tests are pure** — no external dependencies, create temp dirs, clean up after
2. **Install tests are diagnostic** — check actual system state, report what's missing
3. **superclaw tests need infra** — require superclaw deployed at /root/.openclaw/workspace/bin/
4. **E2E tests are manual** — guided by README, run through the full SuperClaw flow

## Writing New Tests

Follow the pattern:
- Use `pass()` / `fail()` / `warn()` helper functions
- Clean up temp dirs with `trap`
- Exit 0 on success, 1 on failure
- Print clear results summary at the end
