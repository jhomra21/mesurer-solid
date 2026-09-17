#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const DEFAULT_BRIDGE = "http://127.0.0.1:47365";
const START_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 100;

const usage = `Usage:
  mesurer-codex-connect [options]

Ensures the Mesurer Codex bridge is running, then registers CODEX_THREAD_ID
and makes that thread the active Mesurer destination.

Options:
  --bridge <url>   Bridge URL (default: ${DEFAULT_BRIDGE})
  --codex <path>   Codex executable passed to a newly-started bridge
  --once           Start a new bridge with --once (primarily useful for tests)
  --help           Show this help

Run this from the Codex thread that should receive Mesurer feedback.
`;

const { values } = parseArgs({
  options: {
    bridge: { type: "string", default: DEFAULT_BRIDGE },
    codex: { type: "string" },
    once: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
  strict: true,
});

if (values.help) {
  process.stdout.write(usage);
  process.exit(0);
}

const thread = process.env.CODEX_THREAD_ID?.trim();
if (!thread) {
  process.stderr.write(
    "mesurer-codex-connect requires CODEX_THREAD_ID. Run it from a Codex shell/tool command.\n",
  );
  process.exit(2);
}

const bridge = values.bridge?.trim() || DEFAULT_BRIDGE;
const bridgeUrl = new URL(bridge.endsWith("/") ? bridge : `${bridge}/`);

const isLoopbackHost = (hostname) =>
  hostname === "127.0.0.1"
  || hostname === "localhost"
  || hostname === "::1"
  || hostname === "[::1]";

if (bridgeUrl.protocol !== "http:" || !isLoopbackHost(bridgeUrl.hostname)) {
  process.stderr.write(
    `Automatic bridge startup requires a loopback HTTP URL, got ${bridge}.\n`,
  );
  process.exit(2);
}
if (bridgeUrl.pathname !== "/" || bridgeUrl.search || bridgeUrl.hash) {
  process.stderr.write(
    `Automatic bridge startup requires a root bridge URL, got ${bridge}.\n`,
  );
  process.exit(2);
}

const port = bridgeUrl.port ? Number(bridgeUrl.port) : 80;
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  process.stderr.write(`Invalid bridge port in ${bridge}.\n`);
  process.exit(2);
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
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exit(1);
}

if (!current) {
  const bridgeScript = fileURLToPath(new URL("./codex-bridge.mjs", import.meta.url));
  const args = [bridgeScript, "--port", String(port)];
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
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exit(1);
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
  process.stderr.write(`Could not register Codex thread with ${bridgeUrl.origin}: ${error}\n`);
  process.exit(1);
}

const payload = await readPayload(response);
if (!response.ok || payload.ok === false) {
  process.stderr.write(
    `${payload.error || `Mesurer Codex bridge returned HTTP ${response.status}.`}\n`,
  );
  process.exit(1);
}

console.log(`Mesurer Codex bridge ready: ${bridgeUrl.origin}`);
console.log(`Registered Codex thread: ${thread}`);
console.log(`BRIDGE_URL=${bridgeUrl.origin}`);
console.log(`BRIDGE_THREAD=${thread}`);
