#!/usr/bin/env node
// doctor.mjs — superclaw health checks and auto-repair
import {
  existsSync, readFileSync, readdirSync, lstatSync, statSync,
  accessSync, constants as fsConstants, unlinkSync, renameSync, symlinkSync,
  chmodSync, readlinkSync,
} from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";

// ─── Result helpers ──────────────────────────────────────────────────────────

const PASS = (name, msg) => ({ name, status: "pass", message: msg });
const WARN = (name, msg, fix) => ({ name, status: "warn", message: msg, fix: fix || null });
const FAIL = (name, msg, fix) => ({ name, status: "fail", message: msg, fix: fix || null });

// ─── Output ──────────────────────────────────────────────────────────────────

function printResults(categories, verbose) {
  let totalPass = 0, totalFail = 0, totalWarn = 0;

  for (const [catName, results] of categories) {
    const passes = results.filter((r) => r.status === "pass").length;
    const fails = results.filter((r) => r.status === "fail").length;
    const warns = results.filter((r) => r.status === "warn").length;
    totalPass += passes;
    totalFail += fails;
    totalWarn += warns;

    const icon = fails > 0 ? "X" : warns > 0 ? "!" : "OK";
    console.log(`[${icon}] ${catName} (${passes}/${results.length})`);

    if (verbose) {
      for (const r of results) {
        const sym = r.status === "pass" ? "  [OK]" : r.status === "warn" ? "  [! ]" : "  [X ]";
        console.log(`${sym} ${r.message}`);
      }
    } else {
      // Only show non-pass items
      for (const r of results) {
        if (r.status !== "pass") {
          const sym = r.status === "warn" ? "  [! ]" : "  [X ]";
          console.log(`${sym} ${r.message}`);
        }
      }
    }
  }

  console.log("");
  console.log(`${totalPass} passed | ${totalFail} failed | ${totalWarn} warnings`);
  return totalFail;
}

function applyFixes(categories) {
  let fixed = 0;
  for (const [catName, results] of categories) {
    for (const r of results) {
      if (r.status !== "pass" && r.fix) {
        try {
          r.fix();
          console.log(`  [fix] Fixed: ${r.name}`);
          fixed++;
        } catch (e) {
          console.log(`  [X ] Fix failed for ${r.name}: ${e.message}`);
        }
      }
    }
  }
  if (fixed > 0) console.log(`\n${fixed} issue(s) fixed. Run 'superclaw doctor' again to verify.`);
  else console.log("\nNo auto-fixable issues found.");
}

// ─── Category 1: Prerequisites ───────────────────────────────────────────────

function checkPrerequisites(ctx) {
  const results = [];

  // 1. Node.js >= 18
  try {
    const ver = execSync("node --version", { encoding: "utf8", timeout: 5000 }).trim();
    const major = parseInt(ver.replace("v", "").split(".")[0], 10);
    results.push(major >= 18 ? PASS("node", `Node.js ${ver}`) : FAIL("node", `Node.js ${ver} too old (>= 18 required)`));
  } catch { results.push(FAIL("node", "Node.js not found")); }

  // 2. jq
  try {
    const ver = execSync("jq --version", { encoding: "utf8", timeout: 5000 }).trim();
    results.push(PASS("jq", `jq ${ver}`));
  } catch { results.push(FAIL("jq", "jq not found -- install with: apt install jq")); }

  // 3. git
  try {
    execSync("git --version", { encoding: "utf8", timeout: 5000 });
    results.push(PASS("git", "git installed"));
  } catch { results.push(FAIL("git", "git not found")); }

  // 4. Claude Code
  try {
    const ver = execSync("claude --version", { encoding: "utf8", timeout: 5000 }).trim();
    results.push(PASS("claude", `Claude Code ${ver}`));
  } catch { results.push(FAIL("claude", "Claude Code not found -- install from https://claude.ai/install.sh")); }

  // 5. OpenClaw
  try {
    const ver = execSync("openclaw --version", { encoding: "utf8", timeout: 5000 }).trim();
    results.push(PASS("openclaw", `OpenClaw ${ver}`));
  } catch { results.push(WARN("openclaw", "OpenClaw not found")); }

  // 6. Superpowers plugin
  const settingsPath = resolve(homedir(), ".claude", "settings.json");
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const enabled = settings.enabledPlugins?.["superpowers@claude-plugins-official"];
    if (enabled) {
      results.push(PASS("superpowers", "Superpowers plugin enabled"));
    } else {
      results.push(WARN("superpowers", "Superpowers plugin not enabled -- run: claude /plugin install superpowers@claude-plugins-official"));
    }
  } catch {
    results.push(WARN("superpowers", "Cannot read Claude Code settings.json"));
  }

  // 7. curl (needed for connectivity checks)
  try {
    execSync("curl --version", { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
    results.push(PASS("curl", "curl installed"));
  } catch { results.push(WARN("curl", "curl not found -- connectivity checks will be skipped")); }

  return results;
}

// ─── Category 2: Installation ────────────────────────────────────────────────

function checkSymlink(path, label, expectedTarget) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      if (existsSync(path)) return PASS(label, `${label} (symlink OK)`);
      return FAIL(label, `${label} -- broken symlink`, expectedTarget ? () => {
        unlinkSync(path);
        symlinkSync(expectedTarget, path);
      } : null);
    }
    // Regular file -- not ideal but functional
    return WARN(label, `${label} exists but is a regular file (expected symlink)`);
  } catch {
    return FAIL(label, `${label} not found`);
  }
}

function checkInstallation(ctx) {
  const results = [];
  const { installedJsonPath, repoDir, binDir } = ctx;

  // 8. installed.json
  try {
    const data = JSON.parse(readFileSync(installedJsonPath, "utf8"));
    results.push(PASS("installed.json", `installed.json v${data.version} (${data.commit})`));
    ctx.installed = data;
  } catch {
    results.push(FAIL("installed.json", "installed.json missing or invalid -- run: bash scripts/install.sh"));
  }

  // 9. Version drift
  if (ctx.installed) {
    try {
      const head = execSync("git rev-parse HEAD", { cwd: repoDir, encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }).trim();
      if (ctx.installed.commitFull === head) {
        results.push(PASS("version-drift", "Installed version matches repo HEAD"));
      } else {
        results.push(WARN("version-drift", `Version drift: installed ${ctx.installed.commit} != repo ${head.slice(0, 7)} -- run: superclaw update`));
      }
    } catch {
      results.push(WARN("version-drift", "Cannot check version drift (git not accessible)"));
    }
  }

  // 10. bin/superclaw.mjs symlink
  const binMjs = resolve(binDir, "superclaw.mjs");
  const binTarget = resolve(repoDir, "cli/superclaw.mjs");
  results.push(checkSymlink(binMjs, "bin/superclaw.mjs", binTarget));

  // 11. Skills symlinks
  const skillDir = resolve(homedir(), ".openclaw/workspace/skills/superclaw/references");
  for (const phase of ["align", "plan", "execute", "verify", "deliver"]) {
    const path = resolve(skillDir, `${phase}.md`);
    const target = resolve(repoDir, `skills/${phase}/SKILL.md`);
    results.push(checkSymlink(path, `skills/${phase}.md`, target));
  }

  const cliSkill = resolve(homedir(), ".openclaw/workspace/skills/superclaw-cli/SKILL.md");
  const cliTarget = resolve(repoDir, "cli/SKILL.md");
  results.push(checkSymlink(cliSkill, "superclaw-cli/SKILL.md", cliTarget));

  // 12-13. Hook symlinks + executable
  const hooksDir = resolve(homedir(), ".superclaw/hooks");
  for (const hook of ["superclaw-notify.sh", "superclaw-progress.sh"]) {
    const hookPath = resolve(hooksDir, hook);
    const hookTarget = resolve(repoDir, `hooks/${hook}`);
    results.push(checkSymlink(hookPath, `hooks/${hook}`, hookTarget));

    // Executable check
    try {
      accessSync(hookPath, fsConstants.X_OK);
      results.push(PASS(`${hook}-exec`, `${hook} is executable`));
    } catch {
      results.push(FAIL(`${hook}-exec`, `${hook} not executable`, () => chmodSync(hookPath, 0o755)));
    }
  }

  // 14-15. settings.json hooks configured
  const settingsPath = resolve(homedir(), ".claude/settings.json");
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const stopHooks = settings.hooks?.Stop || [];
    const ptuHooks = settings.hooks?.PostToolUse || [];
    const hasStop = stopHooks.some((h) => h.hooks?.some((hh) => hh.command?.includes("superclaw")));
    const hasPtu = ptuHooks.some((h) => h.hooks?.some((hh) => hh.command?.includes("superclaw")));

    if (hasStop) {
      // Verify the command path exists
      const cmd = stopHooks.flatMap((h) => h.hooks || []).find((hh) => hh.command?.includes("superclaw"))?.command;
      if (cmd && existsSync(cmd)) {
        results.push(PASS("hooks.Stop", "hooks.Stop configured, command path valid"));
      } else {
        results.push(FAIL("hooks.Stop", `hooks.Stop configured but command not found: ${cmd}`));
      }
    } else {
      results.push(FAIL("hooks.Stop", "hooks.Stop not configured for superclaw"));
    }

    if (hasPtu) {
      const cmd = ptuHooks.flatMap((h) => h.hooks || []).find((hh) => hh.command?.includes("superclaw"))?.command;
      if (cmd && existsSync(cmd)) {
        results.push(PASS("hooks.PostToolUse", "hooks.PostToolUse configured, command path valid"));
      } else {
        results.push(FAIL("hooks.PostToolUse", `hooks.PostToolUse configured but command not found: ${cmd}`));
      }
    } else {
      results.push(FAIL("hooks.PostToolUse", "hooks.PostToolUse not configured for superclaw"));
    }
  } catch {
    results.push(FAIL("hooks.Stop", "Cannot read Claude Code settings.json"));
    results.push(FAIL("hooks.PostToolUse", "Cannot read Claude Code settings.json"));
  }

  // 16. .env exists + permissions
  const envPath = resolve(binDir, ".env");
  try {
    const stat = statSync(envPath);
    const mode = (stat.mode & 0o777).toString(8);
    if (mode === "600") {
      results.push(PASS(".env", ".env exists (permissions: 600)"));
    } else {
      results.push(WARN(".env", `.env permissions ${mode} (should be 600)`, () => chmodSync(envPath, 0o600)));
    }
  } catch {
    results.push(FAIL(".env", `.env not found at ${envPath}`));
  }

  return results;
}

// ─── Category 3: Configuration ───────────────────────────────────────────────

function checkConfiguration(ctx) {
  const results = [];
  const envPath = resolve(ctx.binDir, ".env");

  // Parse .env into a map
  const envVars = {};
  try {
    readFileSync(envPath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .forEach((l) => {
        const idx = l.indexOf("=");
        envVars[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
      });
  } catch { /* .env missing -- already caught in Installation */ }

  // 17. ANTHROPIC_BASE_URL
  if (envVars.ANTHROPIC_BASE_URL) {
    results.push(PASS("ANTHROPIC_BASE_URL", `ANTHROPIC_BASE_URL = ${envVars.ANTHROPIC_BASE_URL}`));
  } else {
    results.push(FAIL("ANTHROPIC_BASE_URL", "ANTHROPIC_BASE_URL not set in .env"));
  }

  // 18. ANTHROPIC_AUTH_TOKEN non-empty
  if (envVars.ANTHROPIC_AUTH_TOKEN) {
    results.push(PASS("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN is set"));
  } else {
    results.push(FAIL("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN not set in .env"));
  }

  // 19. Token format
  const token = envVars.ANTHROPIC_AUTH_TOKEN || "";
  if (token && token.startsWith("sk-") && token.length > 20) {
    results.push(PASS("token-format", "Token format looks valid (sk-...)"));
  } else if (token) {
    results.push(WARN("token-format", "Token does not start with sk- or is very short"));
  } else {
    results.push(WARN("token-format", "Token not set, cannot validate format"));
  }

  // 20. wrapper exists
  if (existsSync("/usr/local/bin/superclaw")) {
    results.push(PASS("wrapper", "/usr/local/bin/superclaw exists"));
  } else {
    results.push(WARN("wrapper", "/usr/local/bin/superclaw not found -- run: bash scripts/install.sh"));
  }

  return results;
}

// ─── Category 4: Runtime ─────────────────────────────────────────────────────

function checkRuntime(ctx) {
  const results = [];
  const { binDir } = ctx;

  // 21. Stale sessions
  const sessionsDir = resolve(homedir(), ".superclaw/state/sessions");
  let staleSessions = [];
  try {
    if (existsSync(sessionsDir)) {
      const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        try {
          const data = JSON.parse(readFileSync(resolve(sessionsDir, f), "utf8"));
          if (typeof data.pid === "number") {
            let alive = false;
            try { process.kill(data.pid, 0); alive = true; } catch (e) { alive = e.code === "EPERM"; }
            if (!alive) staleSessions.push({ file: f, ...data });
          }
        } catch { /* skip corrupt */ }
      }
    }
    if (staleSessions.length === 0) {
      results.push(PASS("stale-sessions", "No stale sessions"));
    } else {
      results.push(WARN("stale-sessions", `${staleSessions.length} stale session(s) found (--fix to clean)`, () => {
        for (const s of staleSessions) {
          const fp = resolve(sessionsDir, s.file);
          const hb = resolve(sessionsDir, s.file.replace(".json", ".heartbeat"));
          try { unlinkSync(fp); } catch { /* ignore */ }
          try { unlinkSync(hb); } catch { /* ignore */ }
        }
      }));
    }
  } catch {
    results.push(PASS("stale-sessions", "No sessions directory"));
  }

  // 22. Orphan config dirs
  const configRoot = resolve(binDir, "state/claude-config");
  try {
    if (existsSync(configRoot)) {
      const dirs = readdirSync(configRoot);
      const now = Date.now();
      const stale = dirs.filter((d) => {
        try {
          const s = statSync(resolve(configRoot, d));
          return (now - s.mtimeMs) > 7 * 24 * 60 * 60 * 1000;
        } catch { return false; }
      });
      if (dirs.length > 32 || stale.length > 0) {
        results.push(WARN("config-dirs", `${dirs.length} config dirs (${stale.length} stale >7d) -- --fix to prune`, () => {
          for (const d of stale) {
            try {
              execSync(`rm -rf ${JSON.stringify(resolve(configRoot, d))}`, { timeout: 5000 });
            } catch { /* ignore */ }
          }
        }));
      } else {
        results.push(PASS("config-dirs", `${dirs.length} config dirs (all within limits)`));
      }
    } else {
      results.push(PASS("config-dirs", "No config dirs yet"));
    }
  } catch {
    results.push(PASS("config-dirs", "Config dir check skipped"));
  }

  // 23. tool_log.jsonl size
  const logPath = resolve(homedir(), ".superclaw/state/tool_log.jsonl");
  try {
    const stat = statSync(logPath);
    const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
    if (stat.size > 50 * 1024 * 1024) {
      results.push(WARN("tool-log", `tool_log.jsonl is ${sizeMB}MB (>50MB) -- --fix to rotate`, () => {
        const oldPath = logPath + ".old";
        try { unlinkSync(oldPath); } catch { /* ignore */ }
        renameSync(logPath, oldPath);
      }));
    } else {
      results.push(PASS("tool-log", `tool_log.jsonl ${sizeMB}MB`));
    }
  } catch {
    results.push(PASS("tool-log", "No tool log yet"));
  }

  // 24. Session manifest readable
  const manifestPath = resolve(binDir, "state/sessions.json");
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.version === 1) {
      results.push(PASS("manifest", `Session manifest OK (${Object.keys(manifest.sessions || {}).length} sessions)`));
    } else {
      results.push(WARN("manifest", `Unknown manifest version: ${manifest.version}`));
    }
  } catch {
    results.push(PASS("manifest", "No session manifest yet"));
  }

  return results;
}

// ─── Category 5: Connectivity ────────────────────────────────────────────────

function checkConnectivity(ctx) {
  const results = [];

  // 25. ACPX available
  try {
    const probe = spawnSync("acpx", ["--version"], { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
    if (!probe.error && probe.status === 0) {
      results.push(PASS("acpx", "ACPX available"));
    } else {
      // Try npx fallback
      const npx = spawnSync("npx", ["--version"], { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
      if (!npx.error) {
        results.push(PASS("acpx", "ACPX not installed, npx fallback available"));
      } else {
        results.push(WARN("acpx", "Neither acpx nor npx available"));
      }
    }
  } catch {
    results.push(WARN("acpx", "ACPX check failed"));
  }

  // 26. API endpoint reachable
  const baseUrl = process.env.ANTHROPIC_BASE_URL || "";
  if (baseUrl) {
    try {
      const result = spawnSync("curl", ["-sf", "-o", "/dev/null", "-w", "%{http_code}", "--connect-timeout", "3", baseUrl], {
        encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"],
      });
      const code = result.stdout?.trim();
      if (code && !code.startsWith("0")) {
        results.push(PASS("api-endpoint", `API endpoint reachable (${baseUrl} -> HTTP ${code})`));
      } else {
        results.push(WARN("api-endpoint", `API endpoint unreachable: ${baseUrl}`));
      }
    } catch {
      results.push(WARN("api-endpoint", `Cannot reach API endpoint: ${baseUrl}`));
    }
  } else {
    results.push(WARN("api-endpoint", "ANTHROPIC_BASE_URL not set, skipping connectivity check"));
  }

  // 27. OpenClaw gateway
  try {
    const result = spawnSync("curl", ["-sf", "-o", "/dev/null", "-w", "%{http_code}", "--connect-timeout", "2", "http://127.0.0.1:18789"], {
      encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
    });
    const code = result.stdout?.trim();
    if (code && !code.startsWith("0")) {
      results.push(PASS("gateway", `OpenClaw gateway reachable (HTTP ${code})`));
    } else {
      results.push(WARN("gateway", "OpenClaw gateway not reachable at localhost:18789"));
    }
  } catch {
    results.push(WARN("gateway", "OpenClaw gateway check failed"));
  }

  return results;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runDoctor(opts) {
  const { fix = false, verbose = false, binDir, repoDir, installedJsonPath } = opts;

  // Read installed.json for version display
  let version = "unknown";
  try {
    const data = JSON.parse(readFileSync(installedJsonPath, "utf8"));
    version = data.version || "unknown";
  } catch { /* ignore */ }

  console.log(`superclaw doctor v${version}`);
  console.log("------------------------");
  console.log("");

  // Load .env into process.env (best-effort, don't fail)
  const envPath = resolve(binDir, ".env");
  try {
    readFileSync(envPath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .forEach((l) => {
        const idx = l.indexOf("=");
        const key = l.slice(0, idx).trim();
        const val = l.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      });
  } catch { /* ignore */ }

  const ctx = { binDir, repoDir, installedJsonPath, installed: null };

  const categories = [
    ["Prerequisites", checkPrerequisites(ctx)],
    ["Installation", checkInstallation(ctx)],
    ["Configuration", checkConfiguration(ctx)],
    ["Runtime", checkRuntime(ctx)],
    ["Connectivity", checkConnectivity(ctx)],
  ];

  const failCount = printResults(categories, verbose);

  if (fix) {
    console.log("");
    applyFixes(categories);
  }

  return failCount;
}
