#!/usr/bin/env node
// superclaw.mjs — Claude Code delegate wrapper for OpenClaw
// Inspired by Agora's acpx-delegate.mjs, adapted for our environment.
// Handles: env injection, acpx orchestration, IS_SANDBOX=1 yolo mode,
//          session management, Opus model bootstrap, and session manifest tracking.

import {
  existsSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { execSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

// ─── Constants ───────────────────────────────────────────────────────────────

// SCRIPT_DIR must resolve to the *installed* location (where .env and state/ live),
// not the repo source (which import.meta.url resolves to when symlinked).
// process.argv[1] is the path the wrapper passes (e.g. /root/.openclaw/workspace/bin/superclaw.mjs),
// which is the symlink path — dirname gives us the install directory.
// SCRIPT_DIR = installed location (where .env and state/ live).
// REPO_DIR = source repo location (where package.json lives).
// When symlinked, process.argv[1] gives the install path, import.meta.url gives the repo path.
const SCRIPT_DIR = process.argv[1] ? dirname(resolve(process.argv[1])) : dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = dirname(SOURCE_DIR); // cli/ → repo root
const ENV_FILE = resolve(SCRIPT_DIR, ".env");
const STATE_DIR = resolve(SCRIPT_DIR, "state");
const CONFIG_ROOT = resolve(STATE_DIR, "claude-config");
const MANIFEST_PATH = resolve(STATE_DIR, "sessions.json");
const DEFAULT_SESSIONS_DIR = resolve(homedir(), ".superclaw", "state", "sessions");
const CONFIG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CONFIG_MAX_DIRS = 32;
const MANIFEST_VERSION = 1;
const BUFFER_MAX_BYTES = 64 * 1024 * 1024; // 64 MiB cap for captured stdout/stderr
const INSTALLED_JSON_PATH = resolve(homedir(), ".superclaw", "installed.json");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fail(msg, code = 1) {
  process.stderr.write(`[superclaw] Error: ${msg}\n`);
  process.exit(code);
}

function info(msg) {
  process.stderr.write(`[superclaw] ${msg}\n`);
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

/** Reject .env keys that aren't valid identifiers. */
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function validateEnvKey(key) {
  if (!ENV_KEY_RE.test(key)) {
    throw new Error(`Invalid .env key "${key}". Keys must match [A-Za-z_][A-Za-z0-9_]*.`);
  }
}

/** Reject .env values that contain shell metacharacters to prevent injection. */
const SHELL_META_RE = /[;|`$(){}!<>&\\\n\r]/;
function validateEnvValue(key, val) {
  if (SHELL_META_RE.test(val)) {
    throw new Error(`Unsafe character in .env value for ${key}. Remove shell metacharacters (;|\\$\`&<>(){}\\) from the value.`);
  }
}

// ─── .env loader ─────────────────────────────────────────────────────────────

function ensureEnv() {
  // Always load .env (not just when required vars are missing) so that
  // SUPERCLAW_* and other optional vars are available to child processes.
  if (existsSync(ENV_FILE)) {
    readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .forEach((l) => {
        const idx = l.indexOf("=");
        const key = l.slice(0, idx).trim();
        const val = stripQuotes(l.slice(idx + 1));
        validateEnvKey(key);
        validateEnvValue(key, val);
        if (!process.env[key]) {
          process.env[key] = val;
        }
      });
  }
  const required = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"];
  const stillMissing = required.filter((k) => !process.env[k]);
  if (stillMissing.length > 0) {
    fail(`Missing env vars: ${stillMissing.join(", ")}. Check ${ENV_FILE}`);
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

/** Track active child processes for signal forwarding. */
const activeChildren = new Set();

function trackChild(child) {
  activeChildren.add(child);
  child.on("exit", () => activeChildren.delete(child));
}

// Forward SIGTERM/SIGINT to all active children (detached process groups), then exit.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    for (const child of activeChildren) {
      try {
        // Kill the child's entire process group (negative PID)
        process.kill(-child.pid, sig);
      } catch {
        // Process may have already exited
      }
    }
    // Give children a moment to exit, then force-quit
    setTimeout(() => process.exit(1), 5000).unref();
  });
}

function spawnChecked(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env, detached: true });
    trackChild(child);
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
      detached: true,
    });
    trackChild(child);
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      process.stdout.write(text);
      stdoutBytes += chunk.length;
      if (stdoutBytes <= BUFFER_MAX_BYTES) stdout += text;
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      process.stderr.write(text);
      stderrBytes += chunk.length;
      if (stderrBytes <= BUFFER_MAX_BYTES) stderr += text;
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
      detached: true,
    });
    trackChild(child);
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= BUFFER_MAX_BYTES) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= BUFFER_MAX_BYTES) stderr += chunk.toString("utf8");
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

// ─── Active session tracking (for heartbeat hooks) ───────────────────────────

function writeActiveSession(opts, childPid, sessionsDir = DEFAULT_SESSIONS_DIR) {
  mkdirSync(sessionsDir, { recursive: true });
  const name = opts.sessionName || `exec-${childPid}`;
  const filePath = resolve(sessionsDir, `${name}.json`);
  const data = {
    session_name: name,
    cwd: resolve(opts.cwd || process.cwd()),
    model: opts.model || null,
    pid: childPid,
    start_time: new Date().toISOString(),
  };
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  return filePath;
}

function removeActiveSession(opts, childPid, sessionsDir = DEFAULT_SESSIONS_DIR) {
  const name = opts.sessionName || `exec-${childPid}`;
  const filePath = resolve(sessionsDir, `${name}.json`);
  const heartbeatPath = resolve(sessionsDir, `${name}.heartbeat`);
  rmSync(filePath, { force: true });
  rmSync(heartbeatPath, { force: true });
  stopDelegateHeartbeat();
}

// ─── Session status utilities ─────────────────────────────────────────────────

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === "EPERM"; }
}

function isPidOurs(pid, expectedStartTime) {
  if (!isPidAlive(pid)) return false;
  if (!expectedStartTime) return true;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const startTicks = parseInt(stat.split(" ")[21], 10);
    const uptime = parseFloat(readFileSync("/proc/uptime", "utf8").split(" ")[0]);
    const bootTimeSec = Date.now() / 1000 - uptime;
    const procStartMs = (bootTimeSec + startTicks / 100) * 1000;
    const expectedMs = new Date(expectedStartTime).getTime();
    return Math.abs(procStartMs - expectedMs) < 2000;
  } catch {
    return true;
  }
}

function formatUptime(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function readAllActiveSessions(sessionsDir = DEFAULT_SESSIONS_DIR) {
  if (!existsSync(sessionsDir)) return [];
  const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
  const results = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(resolve(sessionsDir, f), "utf8"));
      const alive = typeof data.pid === "number" && isPidOurs(data.pid, data.start_time);
      results.push({ ...data, fileName: f, alive, uptime: alive && data.start_time ? formatUptime(data.start_time) : "-" });
    } catch { /* skip corrupt files */ }
  }
  return results;
}

// ─── Delegate-level heartbeat (independent of CC hooks) ───────────────────────
// Covers the blind spot where CC is in a long thinking phase with no tool calls,
// so the PostToolUse hook never fires and the hook-based heartbeat stays silent.

let heartbeatTimer = null;

function startDelegateHeartbeat(opts) {
  const intervalMs = parseInt(process.env.SUPERCLAW_HEARTBEAT_INTERVAL || "300", 10) * 1000;
  const target = process.env.SUPERCLAW_FEISHU_TARGET;
  const account = process.env.SUPERCLAW_FEISHU_ACCOUNT || "default";
  const oclawPath = process.env.SUPERCLAW_OPENCLAW_PATH || "openclaw";

  if (!target) return; // No Feishu target → skip

  const sessionName = opts.sessionName || `exec-${process.pid}`;
  const cwdBase = basename(resolve(opts.cwd || process.cwd()));
  const startTime = Date.now();

  heartbeatTimer = setInterval(() => {
    const elapsedMin = Math.round((Date.now() - startTime) / 60000);

    const message = `📡 CC 进度 | ${sessionName} | ${cwdBase}\n⏱ 已运行 ${elapsedMin}m`;

    // Fire and forget — don't block the event loop
    const cp = spawn(oclawPath, [
      "message", "send",
      "--channel", "feishu",
      "--account", account,
      "--target", target,
      "--message", message,
    ], { stdio: "ignore", detached: true });
    cp.unref();
  }, intervalMs);

  heartbeatTimer.unref(); // Don't prevent Node from exiting
}

function stopDelegateHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
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
  // Enable sandbox mode so Claude Code allows root execution
  env.IS_SANDBOX = "1";
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
    // Allow model upgrade (e.g. sonnet → opus) — just warn and update the manifest.
    info(`Session "${opts.sessionName}" was ${remembered.model}, upgrading to opus.`);
    remembered.model = "opus";
    const manifest = readManifest();
    const key = scopeKey(opts.cwd, opts.sessionName);
    if (manifest.sessions[key]) {
      manifest.sessions[key].model = "opus";
      writeManifest(manifest);
    }
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
    "superclaw — Claude Code delegate for OpenClaw",
    "",
    "Usage:",
    "  superclaw exec [--cwd <path>] [--model opus|sonnet] [--max-turns N] [--timeout S] [--format text|json|quiet] --prompt <text>",
    "  superclaw session start --name <n> [--cwd <path>] [--model opus|sonnet] --prompt <text>",
    "  superclaw session continue --name <n> [--cwd <path>] --prompt <text>",
    "  superclaw session show --name <n> [--cwd <path>] [--last N]",
    "  superclaw session delete --name <n>",
    "  superclaw session list",
    "  superclaw session ps [--cwd <path>]",
    "  superclaw session stop --name <n> [--signal SIGTERM|SIGKILL]",
    "  superclaw session clean [--dry-run]",
    "  superclaw status",
    "  superclaw version",
    "  superclaw update [--check]",
    "",
    "Environment:",
    "  Reads .env from script directory for ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, etc.",
    "  Runs as root with IS_SANDBOX=1 (yolo mode).",
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
    last: null,            // --last N: show only last N turns
    mode: null,           // derived: "exec" | "session"
    checkOnly: false,     // --check (for update)
    signal: null,         // --signal SIGTERM|SIGKILL (for session stop)
    dryRun: false,        // --dry-run (for session clean)
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
      if (["start", "continue", "list", "show", "delete", "ps", "stop", "clean"].includes(sub)) {
        opts.subcommand = args.shift();
        if (opts.subcommand === "start") opts.freshSession = true;
      }
      continue;
    }
    if (arg === "status") {
      opts.command = "status";
      continue;
    }
    if (arg === "version") {
      opts.command = "version";
      continue;
    }
    if (arg === "update") {
      opts.command = "update";
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
    if (arg === "--last") { opts.last = parseInt(args.shift(), 10); continue; }
    if (arg === "--check") { opts.checkOnly = true; continue; }
    if (arg === "--signal") { opts.signal = args.shift(); continue; }
    if (arg === "--dry-run") { opts.dryRun = true; continue; }

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

  console.log("superclaw status");
  console.log("─".repeat(40));
  console.log(`  acpx: ${acpx.command} ${acpx.args.join(" ")}`);
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

async function cmdSessionList(opts) {
  const manifest = readManifest();
  let sessions = Object.values(manifest.sessions);
  if (sessions.length === 0) {
    console.log("No tracked sessions.");
    return;
  }
  if (opts.cwd) {
    const targetCwd = resolve(opts.cwd);
    sessions = sessions.filter((s) => s.cwd === targetCwd);
    if (sessions.length === 0) {
      console.log(`No sessions for cwd: ${targetCwd}`);
      return;
    }
  }
  const activeSessions = readAllActiveSessions();
  const activeByName = new Map(activeSessions.map((s) => [s.session_name, s]));
  console.log("Tracked sessions:");
  for (const s of sessions) {
    const active = activeByName.get(s.sessionName);
    let status = "stopped";
    if (active) status = active.alive ? "running" : "stale";
    console.log(`  ${s.sessionName} | model=${s.model} | status=${status} | cwd=${s.cwd} | updated=${s.updatedAt}`);
  }
}

async function cmdSessionDelete(opts) {
  if (!opts.sessionName) fail("session delete requires --name <name>");

  const manifest = readManifest();
  const key = Object.keys(manifest.sessions).find(
    (k) => manifest.sessions[k].sessionName === opts.sessionName,
  );

  if (!key) {
    fail(`Session "${opts.sessionName}" not found in manifest.`);
  }

  const session = manifest.sessions[key];
  delete manifest.sessions[key];
  writeManifest(manifest);

  // Also clean up active session files if they exist
  removeActiveSession(opts, 0);

  info(`Deleted session: ${opts.sessionName} (cwd=${session.cwd}, model=${session.model})`);
}

async function cmdSessionPs(opts) {
  const manifest = readManifest();
  const activeSessions = readAllActiveSessions();
  const activeByName = new Map(activeSessions.map((s) => [s.session_name, s]));
  let entries = Object.values(manifest.sessions);
  if (opts.cwd) {
    const targetCwd = resolve(opts.cwd);
    entries = entries.filter((s) => s.cwd === targetCwd);
  }
  if (entries.length === 0 && activeSessions.length === 0) {
    console.log("No sessions found.");
    return;
  }
  const rows = [];
  const seen = new Set();
  for (const s of entries) {
    const active = activeByName.get(s.sessionName);
    let status, pid, uptime;
    if (active) {
      seen.add(s.sessionName);
      status = active.alive ? "running" : "stale";
      pid = String(active.pid);
      uptime = active.uptime;
    } else {
      status = "stopped";
      pid = "-";
      uptime = "-";
    }
    rows.push({ name: s.sessionName, model: s.model, status, pid, uptime, cwd: s.cwd });
  }
  for (const a of activeSessions) {
    if (!seen.has(a.session_name)) {
      rows.push({ name: a.session_name, model: a.model || "?", status: a.alive ? "running" : "stale", pid: String(a.pid), uptime: a.uptime, cwd: a.cwd });
    }
  }
  const hdr = { name: "NAME", model: "MODEL", status: "STATUS", pid: "PID", uptime: "UPTIME", cwd: "CWD" };
  const cols = ["name", "model", "status", "pid", "uptime", "cwd"];
  const widths = {};
  for (const c of cols) widths[c] = Math.max(hdr[c].length, ...rows.map((r) => String(r[c]).length));
  const pad = (s, w) => String(s).padEnd(w);
  console.log("  " + cols.map((c) => pad(hdr[c], widths[c])).join("  "));
  for (const r of rows) {
    console.log("  " + cols.map((c) => pad(r[c], widths[c])).join("  "));
  }
}

async function cmdSessionStop(opts) {
  if (!opts.sessionName) fail("session stop requires --name <name>");
  const activeSessions = readAllActiveSessions();
  const active = activeSessions.find((s) => s.session_name === opts.sessionName);
  if (!active) {
    const manifest = readManifest();
    const inManifest = Object.values(manifest.sessions).find((s) => s.sessionName === opts.sessionName);
    if (inManifest) {
      console.log(`Session "${opts.sessionName}" exists but is not currently running.`);
    } else {
      fail(`Session "${opts.sessionName}" not found.`);
    }
    return;
  }
  if (!active.alive) {
    removeActiveSession(opts, active.pid);
    info(`Session "${opts.sessionName}" was not running (stale PID ${active.pid}). Cleaned up.`);
    return;
  }
  const sig = opts.signal === "SIGKILL" ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(-active.pid, sig);
    info(`Sent ${sig} to session "${opts.sessionName}" (PID ${active.pid})`);
  } catch (e) {
    if (e.code === "ESRCH") {
      info(`Process already exited.`);
    } else {
      try { process.kill(active.pid, sig); info(`Sent ${sig} to PID ${active.pid}`); }
      catch (e2) { if (e2.code !== "ESRCH") fail(`Cannot kill PID ${active.pid}: ${e2.message}`); }
    }
  }
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (!isPidAlive(active.pid)) break;
  }
  if (isPidAlive(active.pid)) {
    if (sig !== "SIGKILL") {
      console.log(`Process still alive after 5s. Try: superclaw session stop --name ${opts.sessionName} --signal SIGKILL`);
    } else {
      console.log(`Warning: PID ${active.pid} still alive after SIGKILL.`);
    }
  } else {
    removeActiveSession(opts, active.pid);
    info(`Stopped session: ${opts.sessionName} (PID ${active.pid})`);
  }
}

async function cmdSessionClean(opts) {
  const activeSessions = readAllActiveSessions();
  const stale = activeSessions.filter((s) => !s.alive);
  if (stale.length === 0) {
    console.log("No stale sessions found.");
    return;
  }
  for (const s of stale) {
    if (opts.dryRun) {
      console.log(`  [stale] ${s.session_name} (PID ${s.pid}, started ${s.start_time})`);
    } else {
      const sOpts = { sessionName: s.session_name };
      removeActiveSession(sOpts, s.pid);
      console.log(`  Cleaned: ${s.session_name} (PID ${s.pid})`);
    }
  }
  if (opts.dryRun) {
    console.log(`\nWould clean ${stale.length} stale session(s). Run without --dry-run to apply.`);
  } else {
    console.log(`\nCleaned ${stale.length} stale session(s).`);
  }
}

async function cmdSessionShow(opts, acpx) {
  if (!opts.sessionName) fail("session show requires --name <name>");

  // Auto-resolve --cwd from manifest if not provided
  if (!opts.cwd) {
    const manifest = readManifest();
    const match = Object.values(manifest.sessions).find((s) => s.sessionName === opts.sessionName);
    if (match) {
      opts.cwd = match.cwd;
    } else {
      fail(`Session "${opts.sessionName}" not found in manifest. Provide --cwd explicitly.`);
    }
  }

  // We need mode=session for readSessionRecord
  opts.mode = "session";
  const env = prepareInvocationEnv(opts);
  const record = await readSessionRecord(acpx, opts, env);

  if (!record) {
    fail(`Session "${opts.sessionName}" not found or not readable.`);
  }

  if (!record.messages || record.messages.length === 0) {
    console.log("(empty session — no messages)");
    return;
  }

  // Parse messages into flat turn entries (text + tool calls)
  const turns = record.messages.flatMap((m) => {
    // Tool results (may appear in User messages as ToolResult)
    if (m?.User?.content) {
      const textParts = [];
      const toolParts = [];
      for (const item of m.User.content) {
        if (typeof item.Text === "string") {
          textParts.push(item.Text);
        }
        if (item.ToolResult) {
          const tr = item.ToolResult;
          const content = typeof tr.content === "string" ? tr.content
            : Array.isArray(tr.content) ? tr.content.map((c) => c.Text || c.text || "").join("\n")
            : "";
          const truncated = content.length > 200 ? content.slice(0, 200) + "..." : (content || "(no output)");
          toolParts.push({ role: "tool-result", text: `[result] ${tr.name || "tool"}\n  ${truncated}` });
        }
      }
      const text = textParts.join("\n").trim();
      const result = [];
      if (text) result.push({ role: "user", text });
      result.push(...toolParts);
      return result;
    }
    if (m?.Agent?.content) {
      const parts = [];
      let text = "";
      for (const item of m.Agent.content) {
        if (typeof item.Text === "string") {
          text += (text ? "\n" : "") + item.Text;
        }
        // Tool calls: ToolUse field from acpx session record
        if (item.ToolUse) {
          const tc = item.ToolUse;
          const name = tc.name || "unknown";
          const input = tc.input || tc.raw_input || {};
          const inputStr = typeof input === "string" ? input : JSON.stringify(input);
          const truncated = inputStr.length > 120 ? inputStr.slice(0, 120) + "..." : inputStr;
          parts.push({ role: "tool", text: `[tool] ${name}\n  input: ${truncated}` });
        }
      }
      if (text.trim()) {
        parts.unshift({ role: "assistant", text: text.trim() });
      }
      return parts.length > 0 ? parts : [];
    }
    return [];
  });

  if (turns.length === 0) {
    console.log("(session has messages but no readable text content)");
    return;
  }

  // Apply --last filter
  const display = opts.last && opts.last > 0 ? turns.slice(-opts.last) : turns;
  const skipped = turns.length - display.length;

  // Output header
  const remembered = getRememberedSession(opts);
  console.log(`# Session: ${opts.sessionName}`);
  if (remembered) {
    console.log(`- **Model**: ${remembered.model}`);
    console.log(`- **CWD**: ${remembered.cwd}`);
    console.log(`- **Updated**: ${remembered.updatedAt}`);
  }
  console.log(`- **Turns**: ${turns.length}`);
  if (skipped > 0) {
    console.log(`- _(showing last ${display.length}, skipped ${skipped})_`);
  }
  console.log("");

  // Output conversation
  for (const turn of display) {
    if (turn.role === "user") {
      console.log(`## 🧑 User\n`);
      console.log(turn.text);
      console.log("\n---\n");
    } else if (turn.role === "assistant") {
      console.log(`## 🤖 Assistant\n`);
      console.log(turn.text);
      console.log("\n---\n");
    } else if (turn.role === "tool") {
      console.log(turn.text);
      console.log("");
    } else if (turn.role === "tool-result") {
      console.log(turn.text);
      console.log("");
    }
  }
}

// ─── Version drift detection ────────────────────────────────────────────────

let _driftChecked = false;

function checkVersionDrift() {
  if (_driftChecked) return;
  _driftChecked = true;
  try {
    if (!existsSync(INSTALLED_JSON_PATH)) return;
    const installed = JSON.parse(readFileSync(INSTALLED_JSON_PATH, "utf8"));
    const installedCommit = (installed.commitFull || installed.commit || "").trim();
    if (!installedCommit) return;
    const repoDir = installed.repoPath || REPO_DIR;
    const currentCommit = execSync("git rev-parse HEAD", {
      cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (installedCommit !== currentCommit && !currentCommit.startsWith(installedCommit) && !installedCommit.startsWith(currentCommit)) {
      process.stderr.write(
        `[superclaw] warning: installed (${installedCommit.slice(0, 7)}) != repo (${currentCommit.slice(0, 7)}). Run 'superclaw update'.\n`
      );
    }
  } catch { /* best-effort */ }
}

// ─── version / update commands ──────────────────────────────────────────────

async function cmdVersion() {
  // Read installed info
  let installed = null;
  try {
    if (existsSync(INSTALLED_JSON_PATH)) {
      installed = JSON.parse(readFileSync(INSTALLED_JSON_PATH, "utf8"));
    }
  } catch { /* ignore */ }

  // Read repo package.json for current version
  const pkgPath = resolve(REPO_DIR, "package.json");
  let repoVersion = "unknown";
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    repoVersion = pkg.version || "unknown";
  } catch { /* ignore */ }

  // Get current repo commit
  const repoDir = (installed && installed.repoPath) || REPO_DIR;
  let currentCommit = "unknown";
  try {
    currentCommit = execSync("git rev-parse --short HEAD", {
      cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { /* ignore */ }

  // Display installed info
  if (installed) {
    const iVer = installed.version || "?";
    const iCommit = (installed.commit || "?").slice(0, 7);
    const iDate = installed.date || installed.installedAt || "?";
    console.log(`installed: v${iVer} (${iCommit}) on ${iDate}`);
  } else {
    console.log("installed: no install metadata found (~/.superclaw/installed.json missing)");
  }

  // Compare and display repo info
  if (installed && (installed.commitFull || installed.commit)) {
    const installedFull = (installed.commitFull || installed.commit).trim();
    let currentFull = "";
    try {
      currentFull = execSync("git rev-parse HEAD", {
        cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch { /* ignore */ }

    if (installedFull === currentFull || currentFull.startsWith(installedFull) || installedFull.startsWith(currentFull)) {
      console.log(`repo:      v${repoVersion} (${currentCommit}) — up to date`);
    } else {
      // Count commits ahead
      let aheadCount = "?";
      try {
        aheadCount = execSync(`git rev-list --count ${installedFull}..HEAD`, {
          cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch { /* ignore */ }
      const plural = aheadCount === "1" ? "" : "s";
      console.log(`repo:      v${repoVersion} (${currentCommit}) — ${aheadCount} commit${plural} ahead, run 'superclaw update'`);
    }
  } else {
    console.log(`repo:      v${repoVersion} (${currentCommit})`);
  }
}

async function cmdUpdate(opts) {
  // Read installed.json for repoPath
  let repoDir = REPO_DIR;
  try {
    if (existsSync(INSTALLED_JSON_PATH)) {
      const installed = JSON.parse(readFileSync(INSTALLED_JSON_PATH, "utf8"));
      if (installed.repoPath) repoDir = installed.repoPath;
    }
  } catch { /* ignore */ }

  // Fetch latest from origin
  info("fetching origin main...");
  try {
    execSync("git fetch origin main", {
      cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    fail(`git fetch failed: ${err.message}`);
  }

  // Compare local HEAD vs origin/main
  let localHead, remoteHead;
  try {
    localHead = execSync("git rev-parse HEAD", {
      cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    remoteHead = execSync("git rev-parse origin/main", {
      cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (err) {
    fail(`git rev-parse failed: ${err.message}`);
  }

  if (localHead === remoteHead) {
    info("already up to date.");
    return;
  }

  // Show diff info
  let behindCount = "?";
  try {
    behindCount = execSync(`git rev-list --count ${localHead}..origin/main`, {
      cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { /* ignore */ }
  const plural = behindCount === "1" ? "" : "s";
  info(`${behindCount} new commit${plural} on origin/main`);

  // Show recent commits
  try {
    const log = execSync(`git log --oneline ${localHead}..origin/main`, {
      cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (log) console.log(log);
  } catch { /* ignore */ }

  if (opts.checkOnly) {
    info("run 'superclaw update' (without --check) to apply.");
    return;
  }

  // Pull and re-install
  info("pulling origin main...");
  try {
    execSync("git pull origin main", {
      cwd: repoDir, encoding: "utf8", stdio: "inherit",
    });
  } catch (err) {
    fail(`git pull failed: ${err.message}`);
  }

  info("running install.sh...");
  const installScript = resolve(repoDir, "scripts", "install.sh");
  if (!existsSync(installScript)) {
    fail(`install script not found: ${installScript}`);
  }

  const { status } = spawnSync("bash", [installScript], {
    cwd: repoDir, stdio: "inherit", env: process.env,
  });
  process.exit(status ?? 0);
}

/** Auto-clean stale active session files (dead PIDs from crashes/reboots). */
function autoCleanStaleSessions() {
  try {
    const stale = readAllActiveSessions().filter((s) => !s.alive);
    for (const s of stale) {
      const sOpts = { sessionName: s.session_name };
      removeActiveSession(sOpts, s.pid);
    }
    if (stale.length > 0) info(`auto-cleaned ${stale.length} stale session(s)`);
  } catch { /* best-effort */ }
}

async function cmdExec(opts, acpx) {
  if (!opts.prompt) fail("exec requires --prompt <text>");
  autoCleanStaleSessions();
  checkVersionDrift();

  const env = prepareInvocationEnv(opts);
  const commonArgs = buildCommonArgs(opts);
  const runArgs = [
    ...acpx.args, ...commonArgs,
    "claude", "exec", opts.prompt,
  ];

  info(`exec | model=${opts.model} | cwd=${opts.cwd || process.cwd()}`);
  writeActiveSession(opts, process.pid);
  startDelegateHeartbeat(opts);
  try {
    const result = await spawnObserved(acpx.command, runArgs, env);
    removeActiveSession(opts, process.pid);
    process.exit(result.code);
  } finally {
    removeActiveSession(opts, process.pid);
  }
}

async function cmdSessionStart(opts, acpx) {
  if (!opts.sessionName) fail("session start requires --name <name>");
  if (!opts.prompt) fail("session start requires --prompt <text>");
  autoCleanStaleSessions();
  checkVersionDrift();

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
  writeActiveSession(opts, process.pid);
  startDelegateHeartbeat(opts);
  try {
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
      removeActiveSession(opts, process.pid);
      process.exit(retry.code);
    }

    removeActiveSession(opts, process.pid);
    process.exit(result.code);
  } finally {
    removeActiveSession(opts, process.pid);
  }
}

async function cmdSessionContinue(opts, acpx) {
  if (!opts.sessionName) fail("session continue requires --name <name>");
  if (!opts.prompt) fail("session continue requires --prompt <text>");
  autoCleanStaleSessions();
  checkVersionDrift();

  // Auto-resolve --cwd from manifest if not provided
  if (!opts.cwd) {
    const manifest = readManifest();
    const match = Object.values(manifest.sessions).find((s) => s.sessionName === opts.sessionName);
    if (match) {
      opts.cwd = match.cwd;
    }
  }

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
  writeActiveSession(opts, process.pid);
  startDelegateHeartbeat(opts);
  try {
    const result = await spawnObserved(acpx.command, runArgs, env);

    const postRecord = await readSessionRecord(acpx, opts, env);
    if (postRecord) rememberSession(opts, postRecord);

    if (shouldRetry(opts, result, postRecord, opts.prompt)) {
      info("Session reconnect detected, retrying prompt once...");
      const retry = await spawnObserved(acpx.command, runArgs, env);
      const retryRecord = await readSessionRecord(acpx, opts, env);
      if (retryRecord) rememberSession(opts, retryRecord);
      removeActiveSession(opts, process.pid);
      process.exit(retry.code);
    }

    removeActiveSession(opts, process.pid);
    process.exit(result.code);
  } finally {
    removeActiveSession(opts, process.pid);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Step 1: Ensure env vars are set
  ensureEnv();

  // Step 2: Parse args
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.command) {
    printUsage();
    process.exit(1);
  }

  // Step 3: Resolve acpx
  const acpx = resolveAcpx();

  // Step 4: Dispatch
  switch (opts.command) {
    case "status":
      await cmdStatus(acpx);
      break;

    case "version":
      await cmdVersion();
      break;

    case "update":
      await cmdUpdate(opts);
      break;

    case "exec":
      await cmdExec(opts, acpx);
      break;

    case "session":
      if (opts.subcommand === "list") {
        await cmdSessionList(opts);
      } else if (opts.subcommand === "show") {
        await cmdSessionShow(opts, acpx);
      } else if (opts.subcommand === "delete") {
        await cmdSessionDelete(opts);
      } else if (opts.subcommand === "ps") {
        await cmdSessionPs(opts);
      } else if (opts.subcommand === "stop") {
        await cmdSessionStop(opts);
      } else if (opts.subcommand === "clean") {
        await cmdSessionClean(opts);
      } else if (opts.subcommand === "start") {
        await cmdSessionStart(opts, acpx);
      } else if (opts.subcommand === "continue") {
        await cmdSessionContinue(opts, acpx);
      } else {
        fail("Unknown session subcommand. Use: start, continue, show, delete, list, ps, stop, clean");
      }
      break;

    default:
      printUsage();
      process.exit(1);
  }
}

// ─── Exports (for testing) ───────────────────────────────────────────────────

export { parseArgs, ensureEnv, classifyPromptState, scopeKey, stripQuotes, validateEnvKey, validateEnvValue, prepareInvocationEnv, writeActiveSession, removeActiveSession, isPidAlive, isPidOurs, formatUptime, readAllActiveSessions };

// Only run main() when executed directly (not when imported for testing)
const isMainModule = process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (isMainModule) {
  // ─── setsid self-re-exec ────────────────────────────────────────────────────
  // When running under a service manager (systemd), superclaw is in the
  // Gateway's cgroup.  If Gateway crashes, systemd sends SIGTERM to the entire
  // cgroup, killing superclaw and its children.  To isolate, we re-exec
  // ourselves under `setsid` so the whole process tree is in its own session.
  //
  // Detection: SUPERCLAW_SETSID_DONE is set after the re-exec to avoid loops.
  // Skip for short commands (status, list, show) that don't spawn long-lived children.
  const needsIsolation = !process.env.SUPERCLAW_SETSID_DONE
    && process.argv.some((a) => a === "exec" || a === "session");
  const isShortSubcommand = process.argv.some(
    (a) => a === "status" || a === "list" || a === "show" || a === "ps" || a === "stop" || a === "clean" || a === "delete" || a === "version" || a === "update"
  );

  if (needsIsolation && !isShortSubcommand) {
    // Load .env BEFORE re-exec so SUPERCLAW_* vars are in the child's environment
    ensureEnv();

    // Check if setsid is available
    const setsidProbe = spawnSync("setsid", ["--version"], { stdio: "ignore" });
    if (!setsidProbe.error) {
      const scriptPath = fileURLToPath(import.meta.url);
      const childEnv = { ...process.env, SUPERCLAW_SETSID_DONE: "1" };
      const child = spawn("setsid", ["node", scriptPath, ...process.argv.slice(2)], {
        stdio: "inherit",
        env: childEnv,
        detached: false, // setsid already creates a new session
      });
      child.on("exit", (code) => process.exit(code ?? 1));
      child.on("error", (err) => {
        process.stderr.write(`[superclaw] setsid re-exec failed: ${err.message}\n`);
        process.exit(1);
      });
    } else {
      // setsid not available, run directly
      main().catch((err) => {
        fail(err instanceof Error ? err.message : String(err));
      });
    }
  } else {
    main().catch((err) => {
      fail(err instanceof Error ? err.message : String(err));
    });
  }
}
