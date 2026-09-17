#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const DEFAULT_BRIDGE = "http://127.0.0.1:47365";
const START_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 100;

const usage = `Usage:
  mesurer-codex-connect [options]

Ensures the Mesurer Codex bridge is running, then registers one Codex session
and makes that session the active Mesurer destination.

Options:
  --thread <value>   Codex session UUID or exact session name
  --session-start    Read a Codex SessionStart hook event from stdin
  --bridge <url>     Bridge URL (default: ${DEFAULT_BRIDGE})
  --codex <path>     Codex executable passed to a newly-started bridge
  --once             Start a new bridge with --once (primarily useful for tests)
  --quiet            Suppress success output
  --help             Show this help

Without --thread or --session-start, CODEX_THREAD_ID is used when available.
`;

const { values } = parseArgs({
  options: {
    thread: { type: "string" },
    "session-start": { type: "boolean", default: false },
    bridge: { type: "string", default: DEFAULT_BRIDGE },
    codex: { type: "string" },
    once: { type: "boolean", default: false },
    quiet: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
  strict: true,
});

if (values.help) {
  process.stdout.write(usage);
  process.exit(0);
}

const fail = (message, code = 1) => {
  process.stderr.write(`${message}\n`);
  process.exit(code);
};

const readStdin = async () => {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
};

const explicitThread = values.thread?.trim() || null;
const fromSessionStart = values["session-start"];
if (explicitThread && fromSessionStart) {
  fail("Use either --thread or --session-start, not both.", 2);
}

let thread = explicitThread ?? process.env.CODEX_THREAD_ID?.trim() ?? null;
if (fromSessionStart) {
  const input = await readStdin();
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    fail("--session-start requires one Codex SessionStart JSON event on stdin.", 2);
  }
  if (event?.hook_event_name !== "SessionStart") {
    fail(`Expected hook_event_name SessionStart, got ${event?.hook_event_name ?? "<missing>"}.`, 2);
  }
  thread = event?.session_id?.trim?.() || null;
}

if (!thread) {
  fail(
    fromSessionStart
      ? "Codex SessionStart input did not include a session_id."
      : "mesurer-codex-connect requires --thread, CODEX_THREAD_ID, or --session-start.",
    2,
  );
}

const quiet = values.quiet || fromSessionStart;
const bridge = values.bridge?.trim() || DEFAULT_BRIDGE;
const bridgeUrl = new URL(bridge.endsWith("/") ? bridge : `${bridge}/`);

const isLoopbackHost = (hostname) =>
  hostname === "127.0.0.1"
  || hostname === "localhost"
  || hostname === "::1"
  || hostname === "[::1]";

if (bridgeUrl.protocol !== "http:" || !isLoopbackHost(bridgeUrl.hostname)) {
  fail(`Automatic bridge startup requires a loopback HTTP URL, got ${bridge}.`, 2);
}
if (bridgeUrl.pathname !== "/" || bridgeUrl.search || bridgeUrl.hash) {
  fail(`Automatic bridge startup requires a root bridge URL, got ${bridge}.`, 2);
}

const port = bridgeUrl.port ? Number(bridgeUrl.port) : 80;
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  fail(`Invalid bridge port in ${bridge}.`, 2);
}

const readPayload = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const health = async () => {
  let response;
  try {
    response = await fetch(new URL("health", bridgeUrl));
  } catch {
    return null;
  }
  const payload = await readPayload(response);
  if (!response.ok || payload.ok !== true) {
    throw new Error(
      payload.error || `Unexpected service at ${bridgeUrl.origin}: HTTP ${response.status}.`,
    );
  }
  return payload;
};

const waitForBridge = async () => {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const payload = await health();
    if (payload) return payload;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Mesurer Codex bridge did not become ready at ${bridgeUrl.origin}.`);
};

let current;
try {
  current = await health();
} catch (cause) {
  fail(cause instanceof Error ? cause.message : String(cause));
}

if (!current) {
  const bridgeScript = fileURLToPath(new URL("./codex-bridge.mjs", import.meta.url));
  const args = [bridgeScript, "--port", String(port), "--thread", thread];
  if (values.codex?.trim()) args.push("--codex", values.codex.trim());
  if (values.once) args.push("--once");

  const child = spawn(process.execPath, args, {
    detached: true,
    env: process.env,
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  try {
    current = await waitForBridge();
  } catch (cause) {
    fail(cause instanceof Error ? cause.message : String(cause));
  }
}

let response;
try {
  response = await fetch(new URL("threads/register", bridgeUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread }),
  });
} catch (cause) {
  const error = cause instanceof Error ? cause.message : String(cause);
  fail(`Could not register Codex thread with ${bridgeUrl.origin}: ${error}`);
}

const payload = await readPayload(response);
if (!response.ok || payload.ok === false) {
  fail(payload.error || `Mesurer Codex bridge returned HTTP ${response.status}.`);
}

if (!quiet) {
  console.log(`Mesurer Codex bridge ready: ${bridgeUrl.origin}`);
  console.log(`Registered Codex thread: ${thread}`);
  console.log(`BRIDGE_URL=${bridgeUrl.origin}`);
  console.log(`BRIDGE_THREAD=${thread}`);
}
