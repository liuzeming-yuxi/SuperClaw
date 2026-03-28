#!/usr/bin/env node
// Unit tests for cc-delegate.mjs pure logic functions
// Uses node:test and node:assert (Node.js 18+)

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, classifyPromptState, scopeKey, stripQuotes, validateEnvValue } from "../../cc-delegate/cc-delegate.mjs";

// ─── stripQuotes ────────────────────────────────────────────────────────────

describe("stripQuotes", () => {
  it("strips double quotes", () => {
    assert.equal(stripQuotes('"hello"'), "hello");
  });

  it("strips single quotes", () => {
    assert.equal(stripQuotes("'hello'"), "hello");
  });

  it("leaves unquoted values alone", () => {
    assert.equal(stripQuotes("hello"), "hello");
  });

  it("leaves mismatched quotes alone", () => {
    assert.equal(stripQuotes("\"hello'"), "\"hello'");
  });

  it("handles empty string", () => {
    assert.equal(stripQuotes(""), "");
  });

  it("handles single-char string", () => {
    assert.equal(stripQuotes("x"), "x");
  });

  it("strips quotes from URL value", () => {
    assert.equal(stripQuotes('"https://api.anthropic.com"'), "https://api.anthropic.com");
  });
});

// ─── validateEnvValue ───────────────────────────────────────────────────────

describe("validateEnvValue", () => {
  it("accepts clean values", () => {
    assert.doesNotThrow(() => validateEnvValue("KEY", "sk-abc123"));
  });

  it("accepts URLs", () => {
    assert.doesNotThrow(() => validateEnvValue("URL", "https://api.anthropic.com"));
  });

  it("rejects semicolons", () => {
    assert.throws(() => validateEnvValue("KEY", "val;rm -rf /"), { message: /Unsafe character/ });
  });

  it("rejects pipe", () => {
    assert.throws(() => validateEnvValue("KEY", "val|evil"), { message: /Unsafe character/ });
  });

  it("rejects backtick", () => {
    assert.throws(() => validateEnvValue("KEY", "`whoami`"), { message: /Unsafe character/ });
  });

  it("rejects dollar sign", () => {
    assert.throws(() => validateEnvValue("KEY", "${HOME}"), { message: /Unsafe character/ });
  });

  it("rejects ampersand", () => {
    assert.throws(() => validateEnvValue("KEY", "a&b"), { message: /Unsafe character/ });
  });
});

// ─── parseArgs ──────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("parses exec with --prompt", () => {
    const opts = parseArgs(["exec", "--prompt", "hello world"]);
    assert.equal(opts.command, "exec");
    assert.equal(opts.mode, "exec");
    assert.equal(opts.prompt, "hello world");
  });

  it("parses exec with all flags", () => {
    const opts = parseArgs([
      "exec", "--cwd", "/tmp", "--model", "sonnet",
      "--format", "json", "--max-turns", "5", "--timeout", "60",
      "--prompt", "do stuff",
    ]);
    assert.equal(opts.command, "exec");
    assert.equal(opts.cwd, "/tmp");
    assert.equal(opts.model, "sonnet");
    assert.equal(opts.format, "json");
    assert.equal(opts.maxTurns, "5");
    assert.equal(opts.timeout, "60");
    assert.equal(opts.prompt, "do stuff");
  });

  it("parses session start", () => {
    const opts = parseArgs(["session", "start", "--name", "my-session", "--prompt", "init"]);
    assert.equal(opts.command, "session");
    assert.equal(opts.subcommand, "start");
    assert.equal(opts.mode, "session");
    assert.equal(opts.sessionName, "my-session");
    assert.equal(opts.prompt, "init");
    assert.equal(opts.freshSession, true);
  });

  it("parses session continue", () => {
    const opts = parseArgs(["session", "continue", "--name", "my-session", "--prompt", "next"]);
    assert.equal(opts.command, "session");
    assert.equal(opts.subcommand, "continue");
    assert.equal(opts.freshSession, false);
    assert.equal(opts.prompt, "next");
  });

  it("parses session list", () => {
    const opts = parseArgs(["session", "list"]);
    assert.equal(opts.command, "session");
    assert.equal(opts.subcommand, "list");
  });

  it("parses status", () => {
    const opts = parseArgs(["status"]);
    assert.equal(opts.command, "status");
  });

  it("defaults model to opus", () => {
    const opts = parseArgs(["exec", "--prompt", "test"]);
    assert.equal(opts.model, "opus");
  });

  it("defaults format to text", () => {
    const opts = parseArgs(["exec", "--prompt", "test"]);
    assert.equal(opts.format, "text");
  });

  it("treats trailing args as prompt", () => {
    const opts = parseArgs(["exec", "this is a prompt"]);
    assert.equal(opts.prompt, "this is a prompt");
  });

  it("returns null command for empty args", () => {
    const opts = parseArgs([]);
    assert.equal(opts.command, null);
  });

  it("parses --resume-session", () => {
    const opts = parseArgs(["session", "continue", "--name", "s", "--resume-session", "abc123", "--prompt", "go"]);
    assert.equal(opts.resumeSession, "abc123");
  });
});

// ─── classifyPromptState ────────────────────────────────────────────────────

describe("classifyPromptState", () => {
  it("returns 'unknown' for null session record", () => {
    assert.equal(classifyPromptState(null, "hello"), "unknown");
  });

  it("returns 'unknown' for empty prompt", () => {
    assert.equal(classifyPromptState({ messages: [] }, ""), "unknown");
  });

  it("returns 'unknown' when prompt not found in messages", () => {
    const record = {
      messages: [
        { User: { content: [{ Text: "different prompt" }] } },
        { Agent: { content: [{ Text: "response" }] } },
      ],
    };
    assert.equal(classifyPromptState(record, "hello world"), "unknown");
  });

  it("returns 'answered' when assistant responded after matching prompt", () => {
    const record = {
      messages: [
        { User: { content: [{ Text: "hello world" }] } },
        { Agent: { content: [{ Text: "Hi there!" }] } },
      ],
    };
    assert.equal(classifyPromptState(record, "hello world"), "answered");
  });

  it("returns 'pending' when no assistant response after matching prompt", () => {
    const record = {
      messages: [
        { User: { content: [{ Text: "hello world" }] } },
      ],
    };
    assert.equal(classifyPromptState(record, "hello world"), "pending");
  });

  it("handles prefix matching (prompt starts with message)", () => {
    const record = {
      messages: [
        { User: { content: [{ Text: "implement the feature" }] } },
        { Agent: { content: [{ Text: "Done!" }] } },
      ],
    };
    assert.equal(classifyPromptState(record, "implement the feature now"), "answered");
  });

  it("returns 'unknown' for record with no messages array", () => {
    assert.equal(classifyPromptState({}, "hello"), "unknown");
  });
});

// ─── scopeKey ───────────────────────────────────────────────────────────────

describe("scopeKey", () => {
  it("returns a 16-char hex string", () => {
    const key = scopeKey("/tmp", "my-session");
    assert.match(key, /^[0-9a-f]{16}$/);
  });

  it("produces different keys for different cwds", () => {
    const key1 = scopeKey("/tmp/a", "session");
    const key2 = scopeKey("/tmp/b", "session");
    assert.notEqual(key1, key2);
  });

  it("produces different keys for different session names", () => {
    const key1 = scopeKey("/tmp", "session-a");
    const key2 = scopeKey("/tmp", "session-b");
    assert.notEqual(key1, key2);
  });

  it("produces same key for same inputs", () => {
    const key1 = scopeKey("/tmp", "session");
    const key2 = scopeKey("/tmp", "session");
    assert.equal(key1, key2);
  });

  it("uses __default__ for null session name", () => {
    const key1 = scopeKey("/tmp", null);
    const key2 = scopeKey("/tmp", "__default__");
    assert.equal(key1, key2);
  });
});
