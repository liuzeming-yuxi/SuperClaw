#!/usr/bin/env node
// cc-delegate.mjs — Claude Code delegate wrapper for OpenClaw
// Inspired by Agora's acpx-delegate.mjs, adapted for our environment.
// Handles: root→testclaude user switching, env injection, acpx orchestration,
//          session management, Opus model bootstrap, and session manifest tracking.

import {
  existsSync, mkdirSync, readFileSync, readdirSync,
  rmSync, statSync, writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir, userInfo } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

// ─── Constants ───────────────────────────────────────────────────────────────

const DELEGATE_USER = "testclaude";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(SCRIPT_DIR, ".env");
const STATE_DIR = resolve(SCRIPT_DIR, "state");
const CONFIG_ROOT = resolve(STATE_DIR, "claude-config");
const MANIFEST_PATH = resolve(STATE_DIR, "sessions.json");
const CONFIG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CONFIG_MAX_DIRS = 32;
const MANIFEST_VERSION = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fail(msg, code = 1) {
  process.stderr.write(`[cc-delegate] Error: ${msg}\n`);
  process.exit(code);
}

function info(msg) {
  process.stderr.write(`[cc-delegate] ${msg}\n`);
}

/** Strip surrounding quotes (single or double) from a value string. */
function stripQuotes(val) {
  if (val.length >= 2) {
    if ((val[0] === '"' && val.at(-1) === '"') || (val[0] === "'" && val.at(-1) === "'")) {
      return val.slice(1, -1);
    }
  }
  return val;
}

/** Reject .env values that contain shell metacharacters to prevent injection. */
const SHELL_META_RE = /[;|`$(){}!<>&\n\r]/;
function validateEnvValue(key, val) {
  if (SHELL_META_RE.test(val)) {
    throw new Error(`Unsafe character in .env value for ${key}. Remove shell metacharacters (;|$\`&<>(){}) from the value.`);
  }
}

// ─── Root → testclaude re-exec ───────────────────────────────────────────────

function reExecAsDelegate() {
  // Load .env for env injection
  let envExports = "";
  if (existsSync(ENV_FILE)) {
    envExports = readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        const key = l.slice(0, idx);
        const val = stripQuotes(l.slice(idx + 1));
        validateEnvValue(key, val);
        // Wrap value in single quotes to prevent shell expansion
        return `export ${key}='${val.replace(/'/g, "'\\''")}'`;
      })
      .join("; ");
  }
  if (!envExports) {
    fail("No .env file found or it's empty. Create " + ENV_FILE);
  }

  const scriptPath = fileURLToPath(import.meta.url);
  const escapedArgs = process.argv.slice(2).map((a) => {
    // Shell-escape each argument
    if (/^[a-zA-Z0-9_./:@=,-]+$/.test(a)) return a;
    return "'" + a.replace(/'/g, "'\\''") + "'";
  });

  const cmd = `${envExports}; exec node ${scriptPath} ${escapedArgs.join(" ")}`;

  const child = spawn("su", ["-", DELEGATE_USER, "-c", cmd], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("error", (err) => {
    fail(`Failed to switch to ${DELEGATE_USER}: ${err.message}`);
  });
  child.on("exit", (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 1);
  });
}

// ─── .env loader (for when already running as testclaude) ────────────────────

function ensureEnv() {
  const required = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    // Try loading from .env directly (fallback for non-root invocations)
    if (existsSync(ENV_FILE)) {
      readFileSync(ENV_FILE, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .forEach((l) => {
          const idx = l.indexOf("=");
          const key = l.slice(0, idx);
          const val = stripQuotes(l.slice(idx + 1));
          validateEnvValue(key, val);
          if (!process.env[key]) {
            process.env[key] = val;
          }
        });
    }
    const stillMissing = required.filter((k) => !process.env[k]);
    if (stillMissing.length > 0) {
      fail(`Missing env vars: ${stillMissing.join(", ")}. Check ${ENV_FILE}`);
    }
  }
}

// ─── ACPX resolution ─────────────────────────────────────────────────────────

function resolveAcpx() {
  const probe = spawnSync("acpx", ["--version"], { stdio: "ignore" });
  if (!probe.error && probe.status === 0) {
    return { command: "acpx", args: [] };
  }
  const npxProbe = spawnSync("npx", ["--version"], { stdio: "ignore" });
  if (!npxProbe.error && npxProbe.status === 0) {
    return { command: "npx", args: ["-y", "acpx@latest"] };
  }
  fail("Neither `acpx` nor `npx` is available.");
}

// ─── Process spawners ────────────────────────────────────────────────────────

function spawnChecked(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) return reject(new Error(`Killed by ${signal}`));
      resolve(code ?? 1);
    });
  });
}

function spawnObserved(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["inherit", "pipe", "pipe"],
      env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) return reject(new Error(`Killed by ${signal}`));
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function spawnCaptured(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) return reject(new Error(`Killed by ${signal}`));
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

// ─── Session manifest ────────────────────────────────────────────────────────

function readManifest() {
  try {
    const raw = readFileSync(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.version === MANIFEST_VERSION && typeof parsed.sessions === "object") {
      return parsed;
    }
  } catch { /* ignore */ }
  return { version: MANIFEST_VERSION, sessions: {} };
}

function writeManifest(manifest) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function scopeKey(cwd, sessionName) {
  const scope = JSON.stringify({
    cwd: resolve(cwd || process.cwd()),
    sessionName: sessionName || "__default__",
  });
  return createHash("sha1").update(scope).digest("hex").slice(0, 16);
}

function rememberSession(opts, record) {
  if (!record?.acpxRecordId || !record?.acpSessionId || !opts.sessionName || !opts.model) return;
  const manifest = readManifest();
  manifest.sessions[scopeKey(opts.cwd, opts.sessionName)] = {
    model: opts.model,
    cwd: resolve(opts.cwd || process.cwd()),
    sessionName: opts.sessionName,
    acpxRecordId: record.acpxRecordId,
    acpSessionId: record.acpSessionId,
    updatedAt: new Date().toISOString(),
  };
  writeManifest(manifest);
}

function getRememberedSession(opts) {
  const manifest = readManifest();
  return manifest.sessions[scopeKey(opts.cwd, opts.sessionName)] ?? null;
}

// ─── CLAUDE_CONFIG_DIR bootstrap (for model pinning) ─────────────────────────

function buildConfigOverride(opts) {
  if (opts.mode !== "session" || !opts.model) return null;

  const scope = JSON.stringify({
    cwd: resolve(opts.cwd || process.cwd()),
    sessionName: opts.sessionName || "__default__",
    model: opts.model,
  });
  const digest = createHash("sha1").update(scope).digest("hex").slice(0, 12);
  const configDir = resolve(CONFIG_ROOT, digest);
  const settingsPath = resolve(configDir, "settings.json");
  return { configDir, settingsPath, settings: { model: opts.model } };
}

function prepareInvocationEnv(opts) {
  const env = { ...process.env };
  const override = buildConfigOverride(opts);
  if (!override) return env;

  mkdirSync(dirname(override.settingsPath), { recursive: true });
  writeFileSync(override.settingsPath, JSON.stringify(override.settings, null, 2) + "\n", "utf8");
  pruneConfigOverrides(override.configDir);
  env.CLAUDE_CONFIG_DIR = override.configDir;
  return env;
}

function pruneConfigOverrides(keepDir = null) {
  let entries = [];
  try {
    entries = readdirSync(CONFIG_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const p = resolve(CONFIG_ROOT, e.name);
        return { path: p, mtimeMs: statSync(p).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch { return; }

  const now = Date.now();
  entries.forEach((entry, i) => {
    if (keepDir && entry.path === keepDir) return;
    if (now - entry.mtimeMs > CONFIG_MAX_AGE_MS || i >= CONFIG_MAX_DIRS) {
      rmSync(entry.path, { recursive: true, force: true });
    }
  });
}

// ─── Opus session guardrail ──────────────────────────────────────────────────

function enforceOpusGuardrail(opts) {
  if (opts.mode !== "session" || opts.model !== "opus") return;
  if (opts.freshSession || opts.resumeSession) return;

  const remembered = getRememberedSession(opts);
  if (!remembered) {
    fail("Opus session requires --fresh-session for first use so the wrapper can bind it.");
  }
  if (remembered.model !== "opus") {
    fail("Remembered session was not Opus. Start fresh with: session start --name <name>");
  }
}

// ─── Read acpx session record ────────────────────────────────────────────────

async function readSessionRecord(acpx, opts, env) {
  if (opts.mode !== "session" || !opts.sessionName) return null;
  const args = [
    ...acpx.args,
    "--cwd", resolve(opts.cwd || process.cwd()),
    "--format", "json",
    "--json-strict",
    "claude", "sessions", "show", opts.sessionName,
  ];
  const result = await spawnCaptured(acpx.command, args, env);
  if (result.code !== 0) return null;
  const lines = result.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  try { return JSON.parse(lines.at(-1)); } catch { return null; }
}

// ─── Retry logic for Claude session reconnect ────────────────────────────────

function promptSignature(prompt) {
  return prompt.replace(/\s+/g, " ").trim().slice(0, 120);
}

function classifyPromptState(sessionRecord, prompt) {
  const sig = promptSignature(prompt);
  if (!sig || !sessionRecord?.messages) return "unknown";

  const messages = sessionRecord.messages.flatMap((m) => {
    if (m?.User?.content) {
      const text = m.User.content.filter((i) => typeof i.Text === "string").map((i) => i.Text).join("\n").trim();
      return text ? [{ role: "user", text }] : [];
    }
    if (m?.Agent?.content) {
      const text = m.Agent.content.filter((i) => typeof i.Text === "string").map((i) => i.Text).join("\n").trim();
      return text ? [{ role: "assistant", text }] : [];
    }
    return [];
  });

  let userIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    const ms = promptSignature(messages[i].text);
    if (ms === sig || sig.startsWith(ms) || ms.startsWith(sig)) {
      userIdx = i;
      break;
    }
  }
  if (userIdx === -1) return "unknown";
  for (let i = userIdx + 1; i < messages.length; i++) {
    if (messages[i].role === "assistant" && messages[i].text.trim()) return "answered";
  }
  return "pending";
}

function shouldRetry(opts, result, sessionRecord, prompt) {
  if (opts.mode !== "session" || result.code !== 0) return false;
  return classifyPromptState(sessionRecord, prompt) === "pending";
}

// ─── Arg builder helpers ─────────────────────────────────────────────────────

function buildCommonArgs(opts, { includeModel = true } = {}) {
  const args = [];
  if (opts.cwd) args.push("--cwd", opts.cwd);
  args.push("--approve-all");
  args.push("--auth-policy", "fail");
  args.push("--non-interactive-permissions", "fail");
  args.push("--format", opts.format);
  if (includeModel && opts.model) args.push("--model", opts.model);
  if (opts.maxTurns) args.push("--max-turns", opts.maxTurns);
  if (opts.timeout) args.push("--timeout", opts.timeout);
  if (opts.format === "json") args.push("--json-strict");
  return args;
}

function buildBootstrapArgs(acpxArgs, opts, commonArgs) {
  if (opts.mode !== "session" || !opts.sessionName) return null;
  const args = [
    ...acpxArgs, ...commonArgs,
    "claude", "sessions",
    opts.freshSession ? "new" : "ensure",
    "--name", opts.sessionName,
  ];
  if (opts.resumeSession) args.push("--resume-session", opts.resumeSession);
  return args;
}

// ─── CLI parsing ─────────────────────────────────────────────────────────────

function printUsage() {
  process.stderr.write([
    "",
    "cc-delegate — Claude Code delegate for OpenClaw",
    "",
    "Usage:",
    "  cc-delegate exec [--cwd <path>] [--model opus|sonnet] [--max-turns N] [--timeout S] [--format text|json|quiet] --prompt <text>",
    "  cc-delegate session start --name <n> [--cwd <path>] [--model opus|sonnet] --prompt <text>",
    "  cc-delegate session continue --name <n> [--cwd <path>] --prompt <text>",
    "  cc-delegate session list",
    "  cc-delegate status",
    "",
    "Environment:",
    "  Reads .env from script directory for ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, etc.",
    "  Auto-switches to testclaude user when run as root.",
    "",
  ].join("\n"));
}

function parseArgs(argv) {
  const args = [...argv];
  const opts = {
    command: null,        // "exec" | "session" | "status"
    subcommand: null,     // "start" | "continue" | "list" (for session)
    cwd: null,
    model: "opus",        // default to opus
    format: "text",
    sessionName: null,
    prompt: null,
    file: null,
    maxTurns: null,
    timeout: null,
    freshSession: false,
    resumeSession: null,
    mode: null,           // derived: "exec" | "session"
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) continue;

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    // Top-level commands
    if (arg === "exec") {
      opts.command = "exec";
      opts.mode = "exec";
      continue;
    }
    if (arg === "session") {
      opts.command = "session";
      opts.mode = "session";
      // Next arg should be subcommand
      const sub = args[0];
      if (sub === "start" || sub === "continue" || sub === "list") {
        opts.subcommand = args.shift();
        if (opts.subcommand === "start") opts.freshSession = true;
      }
      continue;
    }
    if (arg === "status") {
      opts.command = "status";
      continue;
    }

    // Flags
    if (arg === "--cwd") { opts.cwd = args.shift(); continue; }
    if (arg === "--model") { opts.model = args.shift(); continue; }
    if (arg === "--format") { opts.format = args.shift(); continue; }
    if (arg === "--name") { opts.sessionName = args.shift(); continue; }
    if (arg === "--prompt") { opts.prompt = args.shift(); continue; }
    if (arg === "--file") { opts.file = args.shift(); continue; }
    if (arg === "--max-turns") { opts.maxTurns = args.shift(); continue; }
    if (arg === "--timeout") { opts.timeout = args.shift(); continue; }
    if (arg === "--resume-session") { opts.resumeSession = args.shift(); continue; }

    // Treat unknown as prompt text
    const rest = [arg, ...args];
    if (!opts.prompt) {
      opts.prompt = rest.join(" ");
    }
    break;
  }

  // Read prompt from file if specified
  if (opts.file && !opts.prompt) {
    opts.prompt = readFileSync(resolve(opts.file), "utf8").trim();
    if (!opts.prompt) fail("Prompt file is empty.");
  }

  return opts;
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdStatus(acpx) {
  const manifest = readManifest();
  const sessionCount = Object.keys(manifest.sessions).length;
  const sessions = Object.values(manifest.sessions);

  console.log("cc-delegate status");
  console.log("─".repeat(40));
  console.log(`  acpx: ${acpx.command} ${acpx.args.join(" ")}`);
  console.log(`  user: ${userInfo().username}`);
  console.log(`  state: ${STATE_DIR}`);
  console.log(`  sessions: ${sessionCount}`);

  if (sessionCount > 0) {
    console.log("");
    for (const s of sessions) {
      console.log(`  [${s.sessionName}] model=${s.model} cwd=${s.cwd}`);
      console.log(`    acpx=${s.acpxRecordId} updated=${s.updatedAt}`);
    }
  }
  console.log("");
}

async function cmdSessionList() {
  const manifest = readManifest();
  const sessions = Object.values(manifest.sessions);
  if (sessions.length === 0) {
    console.log("No tracked sessions.");
    return;
  }
  console.log("Tracked sessions:");
  for (const s of sessions) {
    console.log(`  ${s.sessionName} | model=${s.model} | cwd=${s.cwd} | updated=${s.updatedAt}`);
  }
}

async function cmdExec(opts, acpx) {
  if (!opts.prompt) fail("exec requires --prompt <text>");

  const env = prepareInvocationEnv(opts);
  const commonArgs = buildCommonArgs(opts);
  const runArgs = [
    ...acpx.args, ...commonArgs,
    "claude", "exec", opts.prompt,
  ];

  info(`exec | model=${opts.model} | cwd=${opts.cwd || process.cwd()}`);
  const result = await spawnObserved(acpx.command, runArgs, env);
  process.exit(result.code);
}

async function cmdSessionStart(opts, acpx) {
  if (!opts.sessionName) fail("session start requires --name <name>");
  if (!opts.prompt) fail("session start requires --prompt <text>");

  const env = prepareInvocationEnv(opts);
  const commonArgs = buildCommonArgs(opts, { includeModel: false });

  // Bootstrap session
  const bootstrapArgs = buildBootstrapArgs(acpx.args, opts, commonArgs);
  if (bootstrapArgs) {
    info(`bootstrapping session: ${opts.sessionName}`);
    const code = await spawnChecked(acpx.command, bootstrapArgs, env);
    if (code !== 0) process.exit(code);
  }

  // Record session
  const record = await readSessionRecord(acpx, opts, env);
  if (record) rememberSession(opts, record);

  // Send prompt
  const runArgs = [
    ...acpx.args, ...commonArgs,
    "claude", "-s", opts.sessionName, opts.prompt,
  ];

  info(`session start | name=${opts.sessionName} | model=${opts.model}`);
  const result = await spawnObserved(acpx.command, runArgs, env);

  // Update manifest after run
  const postRecord = await readSessionRecord(acpx, opts, env);
  if (postRecord) rememberSession(opts, postRecord);

  // Retry on reconnect
  if (shouldRetry(opts, result, postRecord, opts.prompt)) {
    info("Session reconnect detected, retrying prompt once...");
    const retry = await spawnObserved(acpx.command, runArgs, env);
    const retryRecord = await readSessionRecord(acpx, opts, env);
    if (retryRecord) rememberSession(opts, retryRecord);
    process.exit(retry.code);
  }

  process.exit(result.code);
}

async function cmdSessionContinue(opts, acpx) {
  if (!opts.sessionName) fail("session continue requires --name <name>");
  if (!opts.prompt) fail("session continue requires --prompt <text>");

  // Enforce Opus guardrail
  enforceOpusGuardrail(opts);

  const env = prepareInvocationEnv(opts);
  const commonArgs = buildCommonArgs(opts, { includeModel: false });

  // Ensure session exists
  const bootstrapArgs = buildBootstrapArgs(acpx.args, opts, commonArgs);
  if (bootstrapArgs) {
    const code = await spawnChecked(acpx.command, bootstrapArgs, env);
    if (code !== 0) process.exit(code);
  }

  // Validate for Opus
  if (opts.model === "opus") {
    const record = await readSessionRecord(acpx, opts, env);
    const remembered = getRememberedSession(opts);
    if (!remembered || !record || remembered.acpxRecordId !== record.acpxRecordId) {
      fail("Opus follow-up refused: session not tracked by wrapper. Use 'session start' to create a new one.");
    }
    if (record) rememberSession(opts, record);
  }

  // Send prompt
  const runArgs = [
    ...acpx.args, ...commonArgs,
    "claude", "-s", opts.sessionName, opts.prompt,
  ];

  info(`session continue | name=${opts.sessionName} | model=${opts.model}`);
  const result = await spawnObserved(acpx.command, runArgs, env);

  const postRecord = await readSessionRecord(acpx, opts, env);
  if (postRecord) rememberSession(opts, postRecord);

  if (shouldRetry(opts, result, postRecord, opts.prompt)) {
    info("Session reconnect detected, retrying prompt once...");
    const retry = await spawnObserved(acpx.command, runArgs, env);
    const retryRecord = await readSessionRecord(acpx, opts, env);
    if (retryRecord) rememberSession(opts, retryRecord);
    process.exit(retry.code);
  }

  process.exit(result.code);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Step 1: If running as root, re-exec as testclaude
  if (userInfo().username === "root") {
    reExecAsDelegate();
    return; // never reached, reExecAsDelegate takes over the process
  }

  // Step 2: Ensure env vars are set
  ensureEnv();

  // Step 3: Parse args
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.command) {
    printUsage();
    process.exit(1);
  }

  // Step 4: Resolve acpx
  const acpx = resolveAcpx();

  // Step 5: Dispatch
  switch (opts.command) {
    case "status":
      await cmdStatus(acpx);
      break;

    case "exec":
      await cmdExec(opts, acpx);
      break;

    case "session":
      if (opts.subcommand === "list") {
        await cmdSessionList();
      } else if (opts.subcommand === "start") {
        await cmdSessionStart(opts, acpx);
      } else if (opts.subcommand === "continue") {
        await cmdSessionContinue(opts, acpx);
      } else {
        fail("Unknown session subcommand. Use: start, continue, list");
      }
      break;

    default:
      printUsage();
      process.exit(1);
  }
}

// ─── Exports (for testing) ───────────────────────────────────────────────────

export { parseArgs, ensureEnv, classifyPromptState, scopeKey, stripQuotes, validateEnvValue };

// Only run main() when executed directly (not when imported for testing)
const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
}
