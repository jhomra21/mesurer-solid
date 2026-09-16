#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { parseArgs } from "node:util";

const DEFAULT_PORT = 47365;
const DEFAULT_BRIDGE = `http://127.0.0.1:${DEFAULT_PORT}`;
const MAX_MESSAGE_BYTES = 64 * 1024;
const CODEX_TIMEOUT_MS = 30_000;

const usage = `Usage:
  mesurer-codex [--thread <session-id-or-name>] [options]
  mesurer-codex --register-current [--bridge <url>]
  mesurer-codex --register <session-id-or-name> [--bridge <url>]

Server options:
  --thread <value>    Initial Codex session UUID or exact session name.
                      Defaults to CODEX_THREAD_ID when launched by Codex.
  --port <number>     Loopback port (default: ${DEFAULT_PORT}; use 0 for any free port)
  --origin <origin>   Additional allowed browser Origin. Repeatable.
  --codex <path>      Codex executable (default: CODEX_BIN or codex)
  --once              Exit after one successful queued message

Thread registration:
  --register-current  Register CODEX_THREAD_ID with a running bridge and make it active.
  --register <value>  Register a specific existing/newly-created Codex thread and make it active.
  --bridge <url>      Running bridge URL for registration (default: ${DEFAULT_BRIDGE})

Other:
  --help              Show this help

Loopback browser origins such as http://localhost:* and http://127.0.0.1:* are allowed by default.
For file:// or Electron pages, pass --origin null explicitly.
Browser pages may target only threads that a local Codex process/user has registered with the bridge.
`;

const { values } = parseArgs({
  options: {
    thread: { type: "string" },
    port: { type: "string", default: String(DEFAULT_PORT) },
    origin: { type: "string", multiple: true },
    codex: { type: "string" },
    once: { type: "boolean", default: false },
    register: { type: "string" },
    "register-current": { type: "boolean", default: false },
    bridge: { type: "string", default: DEFAULT_BRIDGE },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
  strict: true,
});

if (values.help) {
  process.stdout.write(usage);
  process.exit(0);
}

const normalizeThread = (value) => value?.trim() || null;
const envThread = normalizeThread(process.env.CODEX_THREAD_ID);
const requestedRegistration = normalizeThread(values.register);
const registerCurrent = values["register-current"];

if (requestedRegistration && registerCurrent) {
  process.stderr.write("Use either --register or --register-current, not both.\n");
  process.exit(2);
}

const registrationThread = registerCurrent ? envThread : requestedRegistration;
if (registerCurrent && !registrationThread) {
  process.stderr.write("--register-current requires CODEX_THREAD_ID. Run it from a Codex shell/tool command or use --register <thread>.\n");
  process.exit(2);
}

if (registrationThread) {
  const bridge = values.bridge?.trim() || DEFAULT_BRIDGE;
  let response;
  try {
    response = await fetch(new URL("threads/register", bridge.endsWith("/") ? bridge : `${bridge}/`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread: registrationThread }),
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write(`Could not reach Mesurer Codex bridge at ${bridge}: ${error}\n`);
    process.exit(1);
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }
  if (!response.ok || payload.ok === false) {
    process.stderr.write(`${payload.error || `Mesurer Codex bridge returned HTTP ${response.status}.`}\n`);
    process.exit(1);
  }

  console.log(`Registered Codex thread: ${registrationThread}`);
  console.log(`BRIDGE_THREAD=${registrationThread}`);
  process.exit(0);
}

const parsedPort = Number(values.port);
if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
  process.stderr.write(`Invalid --port: ${values.port}\n`);
  process.exit(2);
}

const initialThread = normalizeThread(values.thread) ?? envThread;
const codexBin = values.codex?.trim() || process.env.CODEX_BIN?.trim() || "codex";
const additionalOrigins = new Set(values.origin ?? []);
const registeredThreads = new Set();
let activeThread = null;
if (initialThread) {
  registeredThreads.add(initialThread);
  activeThread = initialThread;
}

const isLoopbackOrigin = (origin) => {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname === "::1"
      || url.hostname === "[::1]";
  } catch {
    return false;
  }
};

const originAllowed = (origin) => {
  if (!origin) return true;
  return additionalOrigins.has(origin) || isLoopbackOrigin(origin);
};

const corsHeaders = (origin) => origin && originAllowed(origin)
  ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Vary": "Origin",
    }
  : {};

const writeJson = (response, status, payload, origin) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(origin),
  });
  response.end(`${JSON.stringify(payload)}\n`);
};

const readJsonBody = async (request) => {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_MESSAGE_BYTES) throw new Error("Mesurer Codex message is too large.");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text);
};

const runCodexQueue = (thread, message) => new Promise((resolve, reject) => {
  const child = spawn(codexBin, ["queue", "--thread", thread, "--message", message], {
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  let settled = false;
  let timeout;

  const finish = (error, output) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (error) reject(error);
    else resolve(output);
  };

  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("error", (error) => finish(error));
  child.on("close", (code, signal) => {
    if (code === 0) {
      finish(null, stdout.trim());
      return;
    }
    const detail = stderr.trim() || stdout.trim() || `exit code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;
    finish(new Error(`codex queue failed: ${detail}`));
  });

  timeout = setTimeout(() => {
    child.kill("SIGTERM");
    finish(new Error(`codex queue timed out after ${CODEX_TIMEOUT_MS}ms.`));
  }, CODEX_TIMEOUT_MS);
});

const threadPayload = () => ({
  thread: activeThread,
  threads: [...registeredThreads],
});

let successfulSends = 0;
const server = createServer(async (request, response) => {
  const originHeaderPresent = Object.hasOwn(request.headers, "origin");
  const origin = [request.headers.origin].flat().find((value) => value !== undefined);
  if (!originAllowed(origin)) {
    writeJson(response, 403, { ok: false, error: `Origin is not allowed: ${origin}` }, origin);
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, { ok: true, ...threadPayload() }, origin);
    return;
  }

  if (request.method === "POST" && request.url === "/threads/register") {
    if (originHeaderPresent) {
      writeJson(response, 403, {
        ok: false,
        error: "Thread registration is available only to a local process, not a browser Origin.",
      }, origin);
      return;
    }
    try {
      const body = await readJsonBody(request);
      const thread = normalizeThread(body?.thread);
      if (!thread) {
        writeJson(response, 400, { ok: false, error: "thread must be a non-empty string." }, origin);
        return;
      }
      registeredThreads.add(thread);
      activeThread = thread;
      writeJson(response, 200, { ok: true, ...threadPayload() }, origin);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      writeJson(response, 400, { ok: false, error }, origin);
    }
    return;
  }

  if (request.method === "POST" && request.url === "/target") {
    try {
      const body = await readJsonBody(request);
      const thread = normalizeThread(body?.thread);
      if (!thread) {
        writeJson(response, 400, { ok: false, error: "thread must be a non-empty string." }, origin);
        return;
      }
      if (!registeredThreads.has(thread)) {
        writeJson(response, 409, {
          ok: false,
          error: `Codex thread is not registered with this bridge: ${thread}`,
        }, origin);
        return;
      }
      activeThread = thread;
      writeJson(response, 200, { ok: true, ...threadPayload() }, origin);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      writeJson(response, 400, { ok: false, error }, origin);
    }
    return;
  }

  if (request.method !== "POST" || request.url !== "/send") {
    writeJson(response, 404, { ok: false, error: "Not found." }, origin);
    return;
  }

  try {
    const body = await readJsonBody(request);
    const message = body?.message?.trim?.() ?? "";
    const requestedThread = normalizeThread(body?.thread);
    const thread = requestedThread ?? activeThread;
    if (!message) {
      writeJson(response, 400, { ok: false, error: "message must be a non-empty string." }, origin);
      return;
    }
    if (!thread) {
      writeJson(response, 409, {
        ok: false,
        error: "No Codex thread is registered. Start the bridge from Codex, pass --thread, or run mesurer-codex --register-current.",
      }, origin);
      return;
    }
    if (!registeredThreads.has(thread)) {
      writeJson(response, 409, {
        ok: false,
        error: `Codex thread is not registered with this bridge: ${thread}`,
      }, origin);
      return;
    }

    const output = await runCodexQueue(thread, message);
    successfulSends += 1;
    writeJson(response, 200, { ok: true, thread, output }, origin);
    if (values.once && successfulSends >= 1) setImmediate(() => server.close());
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    writeJson(response, 502, { ok: false, error }, origin);
  }
});

server.on("error", (error) => {
  process.stderr.write(`Mesurer Codex bridge failed: ${error.message}\n`);
  process.exitCode = 1;
});

server.listen(parsedPort, "127.0.0.1", () => {
  const address = server.address();
  const port = address?.port ?? parsedPort;
  const url = `http://127.0.0.1:${port}`;
  console.log(`Mesurer Codex bridge listening on ${url}`);
  if (activeThread) console.log(`Active Codex thread: ${activeThread}`);
  else console.log("No Codex thread is registered yet.");
  console.log(`BRIDGE_URL=${url}`);
  if (activeThread) console.log(`BRIDGE_THREAD=${activeThread}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
