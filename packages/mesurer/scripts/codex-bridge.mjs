#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { parseArgs } from "node:util";

const DEFAULT_PORT = 47365;
const MAX_MESSAGE_BYTES = 64 * 1024;
const CODEX_TIMEOUT_MS = 30_000;

const usage = `Usage: mesurer-codex --thread <session-id-or-name> [options]

Options:
  --thread <value>    Codex session UUID or exact session name (required)
  --port <number>     Loopback port (default: ${DEFAULT_PORT}; use 0 for any free port)
  --origin <origin>   Additional allowed browser Origin. Repeatable.
  --codex <path>      Codex executable (default: CODEX_BIN or codex)
  --once              Exit after one successful queued message
  --help              Show this help

Loopback browser origins such as http://localhost:* and http://127.0.0.1:* are allowed by default.
For file:// or Electron pages, pass --origin null explicitly.
`;

const { values } = parseArgs({
  options: {
    thread: { type: "string" },
    port: { type: "string", default: String(DEFAULT_PORT) },
    origin: { type: "string", multiple: true },
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

const thread = values.thread?.trim();
if (!thread) {
  process.stderr.write(`${usage}\nMissing required --thread.\n`);
  process.exit(2);
}

const parsedPort = Number(values.port);
if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
  process.stderr.write(`Invalid --port: ${values.port}\n`);
  process.exit(2);
}

const codexBin = values.codex?.trim() || process.env.CODEX_BIN?.trim() || "codex";
const additionalOrigins = new Set(values.origin ?? []);

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

const runCodexQueue = (message) => new Promise((resolve, reject) => {
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

let successfulSends = 0;
const server = createServer(async (request, response) => {
  const origin = [request.headers.origin].flat().find(Boolean);
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
    writeJson(response, 200, { ok: true, thread }, origin);
    return;
  }

  if (request.method !== "POST" || request.url !== "/send") {
    writeJson(response, 404, { ok: false, error: "Not found." }, origin);
    return;
  }

  try {
    const body = await readJsonBody(request);
    const message = body?.message?.trim?.() ?? "";
    if (!message) {
      writeJson(response, 400, { ok: false, error: "message must be a non-empty string." }, origin);
      return;
    }

    const output = await runCodexQueue(message);
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
  console.log(`Target Codex thread: ${thread}`);
  console.log(`BRIDGE_URL=${url}`);
  console.log(`BRIDGE_THREAD=${thread}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
