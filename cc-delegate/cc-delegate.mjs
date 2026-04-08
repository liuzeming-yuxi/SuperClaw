#!/usr/bin/env node
// cc-delegate.mjs — Claude Code delegate wrapper for OpenClaw
// Inspired by Agora's acpx-delegate.mjs, adapted for our environment.
// Handles: env injection, acpx orchestration, IS_SANDBOX=1 yolo mode,
//          session management, Opus model bootstrap, and session manifest tracking.

import {
  existsSync, mkdirSync, readFileSync, readdirSync,
  rmSync, statSync, writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

// ─── Constants ───────────────────────────────────────────────────────────────

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(SCRIPT_DIR, ".env");
const STATE_DIR = resolve(SCRIPT_DIR, "state");
const CONFIG_ROOT = resolve(STATE_DIR, "claude-config");
const MANIFEST_PATH = resolve(STATE_DIR, "sessions.json");
const DEFAULT_SESSIONS_DIR = resolve(homedir(), ".superclaw", "state", "sessions");
const CONFIG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CONFIG_MAX_DIRS = 32;
const MANIFEST_VERSION = 1;
const BUFFER_MAX_BYTES = 64 * 1024 * 1024; // 64 MiB cap for captured stdout/stderr

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

    const message = `📡 CC 进度 | ${sessionName} | ${cwdBase}\n⏱ 已运行 ${elapsedMin}m\n💭 (cc-delegate heartbeat — CC 可能在 thinking)`;

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
    "cc-delegate — Claude Code delegate for OpenClaw",
    "",
    "Usage:",
    "  cc-delegate exec [--cwd <path>] [--model opus|sonnet] [--max-turns N] [--timeout S] [--format text|json|quiet] --prompt <text>",
    "  cc-delegate session start --name <n> [--cwd <path>] [--model opus|sonnet] --prompt <text>",
    "  cc-delegate session continue --name <n> [--cwd <path>] --prompt <text>",
    "  cc-delegate session show --name <n> [--cwd <path>] [--last N]",
    "  cc-delegate session list",
    "  cc-delegate status",
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
      if (sub === "start" || sub === "continue" || sub === "list" || sub === "show") {
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
    if (arg === "--last") { opts.last = parseInt(args.shift(), 10); continue; }

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
  // Filter by --cwd if provided
  if (opts.cwd) {
    const targetCwd = resolve(opts.cwd);
    sessions = sessions.filter((s) => s.cwd === targetCwd);
    if (sessions.length === 0) {
      console.log(`No sessions for cwd: ${targetCwd}`);
      return;
    }
  }
  console.log("Tracked sessions:");
  for (const s of sessions) {
    console.log(`  ${s.sessionName} | model=${s.model} | cwd=${s.cwd} | updated=${s.updatedAt}`);
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

async function cmdExec(opts, acpx) {
  if (!opts.prompt) fail("exec requires --prompt <text>");

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

    case "exec":
      await cmdExec(opts, acpx);
      break;

    case "session":
      if (opts.subcommand === "list") {
        await cmdSessionList(opts);
      } else if (opts.subcommand === "show") {
        await cmdSessionShow(opts, acpx);
      } else if (opts.subcommand === "start") {
        await cmdSessionStart(opts, acpx);
      } else if (opts.subcommand === "continue") {
        await cmdSessionContinue(opts, acpx);
      } else {
        fail("Unknown session subcommand. Use: start, continue, show, list");
      }
      break;

    default:
      printUsage();
      process.exit(1);
  }
}

// ─── Exports (for testing) ───────────────────────────────────────────────────

export { parseArgs, ensureEnv, classifyPromptState, scopeKey, stripQuotes, validateEnvKey, validateEnvValue, prepareInvocationEnv, writeActiveSession, removeActiveSession };

// Only run main() when executed directly (not when imported for testing)
const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  // ─── setsid self-re-exec ────────────────────────────────────────────────────
  // When running under a service manager (systemd), cc-delegate is in the
  // Gateway's cgroup.  If Gateway crashes, systemd sends SIGTERM to the entire
  // cgroup, killing cc-delegate and its children.  To isolate, we re-exec
  // ourselves under `setsid` so the whole process tree is in its own session.
  //
  // Detection: SUPERCLAW_SETSID_DONE is set after the re-exec to avoid loops.
  // Skip for short commands (status, list, show) that don't spawn long-lived children.
  const needsIsolation = !process.env.SUPERCLAW_SETSID_DONE
    && process.argv.some((a) => a === "exec" || a === "session");
  const isShortSubcommand = process.argv.some((a) => a === "status" || a === "list" || a === "show");

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
        process.stderr.write(`[cc-delegate] setsid re-exec failed: ${err.message}\n`);
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
