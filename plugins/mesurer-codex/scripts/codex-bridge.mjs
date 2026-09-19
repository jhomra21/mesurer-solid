#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const DEFAULT_PORT = 47365;
const DEFAULT_BRIDGE = `http://127.0.0.1:${DEFAULT_PORT}`;
const BRIDGE_NAME = "mesurer-codex";
const BRIDGE_PROTOCOL_VERSION = 1;
const BRIDGE_SOURCE_HASH = createHash("sha256")
  .update(await readFile(new URL(import.meta.url)))
  .digest("hex");
const BRIDGE_IDENTITY = Object.freeze({
  name: BRIDGE_NAME,
  protocol: BRIDGE_PROTOCOL_VERSION,
  sourceHash: BRIDGE_SOURCE_HASH,
  pid: process.pid,
  canShutdown: true,
});
const MAX_MESSAGE_BYTES = 64 * 1024;
const CODEX_TIMEOUT_MS = 30_000;
const APP_SERVER_TIMEOUT_MS = 5_000;
const DAEMON_RESUME_TIMEOUT_MS = 10_000;
const DAEMON_START_TIMEOUT_MS = 15_000;
const DELIVERY_STATE_VERSION = 1;
const MAX_DISCOVERED_THREADS = 10;
const MAX_DELIVERIES = 100;
const TERMINAL_DELIVERY_TTL_MS = 10 * 60_000;
const DELIVERY_TTL_MS = 2 * 60 * 60_000;
const DESKTOP_LIFECYCLE_POLL_MS = 1_000;
const DESKTOP_TURN_HISTORY_LIMIT = 10;
const DELIVERY_TURN_START_SKEW_MS = 60_000;

const usage = `Usage:
  mesurer-codex [--thread <session-id-or-name>] [options]
  mesurer-codex --register-current [--bridge <url>]
  mesurer-codex --register <session-id-or-name> [--bridge <url>]

Server options:
  --thread <value>    Initial Codex session UUID or exact session name.
                      Defaults to CODEX_THREAD_ID when launched by Codex.
  --cwd <path>        Project directory used to scope recent-thread discovery.
                      Defaults to the current working directory.
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
Browser pages may send to locally registered threads and same-project recent threads returned by Codex app-server discovery.
`;

const { values } = parseArgs({
  options: {
    thread: { type: "string" },
    cwd: { type: "string" },
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
const normalizeCwd = (value) => value?.trim() || null;
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
  const cwd = normalizeCwd(values.cwd) ?? process.cwd();
  let response;
  try {
    response = await fetch(new URL("threads/register", bridge.endsWith("/") ? bridge : `${bridge}/`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread: registrationThread, cwd }),
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
const initialCwd = initialThread ? (normalizeCwd(values.cwd) ?? process.cwd()) : null;
const initialAppToolsPipe = normalizeThread(process.env.CODEX_APP_TOOLS_PIPE_PATH);
const initialCodexHome = normalizeCwd(process.env.CODEX_HOME);
const codexBin = values.codex?.trim() || process.env.CODEX_BIN?.trim() || "codex";
const additionalOrigins = new Set(values.origin ?? []);
const registeredThreads = new Map();
const discoveredThreads = new Map();
const deliveries = new Map();
const terminalTurnEvents = new Map();
const desktopDispatchTimers = new Map();
const desktopLifecycleChecks = new Map();
const desktopLifecycleLastCheckedAt = new Map();
let activeThread = null;
let activeCwd = null;

const registerThread = (thread, cwd, registration = {}) => {
  const previous = registeredThreads.get(thread);
  const nextCwd = normalizeCwd(cwd) ?? previous?.cwd ?? null;
  const appToolsPipe = normalizeThread(registration.appToolsPipe) ?? previous?.appToolsPipe ?? null;
  const codexHome = normalizeCwd(registration.codexHome) ?? previous?.codexHome ?? null;
  registeredThreads.set(thread, {
    id: thread,
    cwd: nextCwd,
    appToolsPipe,
    codexHome,
    seenAt: Date.now(),
  });
  activeThread = thread;
  if (nextCwd) activeCwd = nextCwd;
};

if (initialThread) {
  registerThread(initialThread, initialCwd, {
    appToolsPipe: initialAppToolsPipe,
    codexHome: initialCodexHome,
  });
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

const defaultCodexHome = normalizeCwd(process.env.CODEX_HOME) ?? join(homedir(), ".codex");
const deliveryStatePath = join(defaultCodexHome, "mesurer", "codex-deliveries.json");
let deliveryStateWrite = Promise.resolve();

const persistedDelivery = (delivery) => ({
  id: delivery.id,
  thread: delivery.thread,
  message: delivery.message,
  messageHash: delivery.messageHash,
  transport: delivery.transport,
  status: delivery.status,
  turnId: delivery.turnId,
  queuedSubmissionId: delivery.queuedSubmissionId,
  dispatch: delivery.dispatch,
  dispatchError: delivery.dispatchError,
  createdAt: delivery.createdAt,
  updatedAt: delivery.updatedAt,
});

const persistDeliveryState = () => {
  const state = {
    version: DELIVERY_STATE_VERSION,
    deliveries: [...deliveries.values()]
      .filter((delivery) => delivery.transport === "desktop-app")
      .map(persistedDelivery),
  };
  deliveryStateWrite = deliveryStateWrite.then(async () => {
    const directory = join(defaultCodexHome, "mesurer");
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${deliveryStatePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, "utf8");
    await rename(temporaryPath, deliveryStatePath);
  });
  return deliveryStateWrite;
};

const persistDeliveryStateSoon = () => {
  void persistDeliveryState().catch((cause) => {
    const error = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write(`Mesurer Codex bridge could not persist delivery state: ${error}\n`);
  });
};

const loadDeliveryState = async () => {
  let text;
  try {
    text = await readFile(deliveryStatePath, "utf8");
  } catch (cause) {
    if (cause?.code === "ENOENT") return;
    throw cause;
  }

  const state = JSON.parse(text);
  if (state?.version !== DELIVERY_STATE_VERSION || !Array.isArray(state.deliveries)) return;
  const now = Date.now();
  for (const value of state.deliveries) {
    const id = normalizeThread(value?.id);
    const thread = normalizeThread(value?.thread);
    const message = value?.message == null ? "" : String(value.message);
    const transport = value?.transport === "desktop-app" ? "desktop-app" : "codex-queue";
    const status = value?.status;
    const createdAt = Number(value?.createdAt);
    const updatedAt = Number(value?.updatedAt);
    if (!id || !thread || !message.trim()) continue;
    if (!["queued", "working", "completed", "interrupted"].includes(status)) continue;
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) continue;
    const terminal = status === "completed" || status === "interrupted";
    if (now - updatedAt > (terminal ? TERMINAL_DELIVERY_TTL_MS : DELIVERY_TTL_MS)) continue;
    deliveries.set(id, {
      id,
      thread,
      message,
      messageHash: normalizeThread(value?.messageHash) ?? createHash("sha256").update(message).digest("hex"),
      transport,
      status,
      turnId: normalizeThread(value?.turnId),
      queuedSubmissionId: normalizeThread(value?.queuedSubmissionId),
      dispatch: normalizeThread(value?.dispatch) ?? "persisted",
      dispatchError: normalizeThread(value?.dispatchError),
      createdAt,
      updatedAt,
    });
  }
};

const queuedSubmissionFromOutput = (output, thread) => {
  const match = output.match(/Queued message (\S+) for thread (\S+)\.?/);
  if (!match) return null;
  const queuedThread = match[2].replace(/\.$/, "");
  return queuedThread === thread ? match[1] : null;
};

const codexControlSocketPath = () => {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
  return join(codexHome, "app-server-control", "app-server-control.sock");
};

const runCodexDaemonStart = () => new Promise((resolve, reject) => {
  const child = spawn(codexBin, ["app-server", "daemon", "start"], {
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
    finish(new Error(`codex app-server daemon start failed: ${detail}`));
  });

  timeout = setTimeout(() => {
    child.kill("SIGTERM");
    finish(new Error(`codex app-server daemon start timed out after ${DAEMON_START_TIMEOUT_MS}ms.`));
  }, DAEMON_START_TIMEOUT_MS);
});

const missingDaemonSocket = (cause) => {
  if (!(cause instanceof Error)) return false;
  return cause.message.includes("No such file or directory")
    || cause.message.includes("ENOENT")
    || cause.message.includes("os error 2");
};

const resumeColdCodexThreadViaDaemon = (thread) => new Promise((resolve, reject) => {
  if (process.platform === "win32") {
    resolve({ action: "unsupported", threadStatus: null });
    return;
  }

  const child = spawn(codexBin, ["stdio-to-uds", codexControlSocketPath()], {
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdoutBuffer = "";
  let stderr = "";
  let settled = false;
  let timeout;

  const finish = (error, result) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (child.exitCode === null) child.kill("SIGTERM");
    if (error) reject(error);
    else resolve(result);
  };

  const send = (message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const handleMessage = (message) => {
    if (message?.id === "mesurer-daemon-init") {
      if (message.error) {
        finish(new Error(message.error.message || "Codex daemon initialize failed."));
        return;
      }
      send({ method: "initialized" });
      send({
        id: "mesurer-thread-read",
        method: "thread/read",
        params: {
          threadId: thread,
          includeTurns: false,
        },
      });
      return;
    }

    if (message?.id === "mesurer-thread-read") {
      if (message.error) {
        finish(new Error(message.error.message || "Codex daemon thread/read failed."));
        return;
      }
      const threadStatus = message.result?.thread?.status?.type ?? null;
      if (threadStatus !== "notLoaded") {
        finish(null, { action: "already-loaded", threadStatus });
        return;
      }
      send({
        id: "mesurer-thread-resume",
        method: "thread/resume",
        params: { threadId: thread },
      });
      return;
    }

    if (message?.id === "mesurer-thread-resume") {
      if (message.error) {
        finish(new Error(message.error.message || "Codex daemon thread/resume failed."));
        return;
      }
      finish(null, { action: "resumed", threadStatus: "notLoaded" });
    }
  };

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    while (true) {
      const newline = stdoutBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        handleMessage(JSON.parse(line));
      } catch {
        // The relay carries app-server JSONL. Ignore unrelated stdout defensively.
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8_192);
  });
  child.on("error", (error) => finish(error));
  child.on("close", (code, signal) => {
    if (settled) return;
    const detail = stderr.trim() || `exit code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;
    finish(new Error(`Codex daemon relay exited before thread resume check completed: ${detail}`));
  });

  timeout = setTimeout(() => {
    child.kill("SIGTERM");
    finish(new Error(`Codex daemon resume check timed out after ${DAEMON_RESUME_TIMEOUT_MS}ms.`));
  }, DAEMON_RESUME_TIMEOUT_MS);

  send({
    id: "mesurer-daemon-init",
    method: "initialize",
    params: {
      clientInfo: {
        name: "mesurer-solid",
        title: "Mesurer Solid",
        version: "1",
      },
      capabilities: {
        experimentalApi: false,
      },
    },
  });
});

const resumeColdCodexThread = async (thread) => {
  try {
    return await resumeColdCodexThreadViaDaemon(thread);
  } catch (cause) {
    if (!missingDaemonSocket(cause)) throw cause;
    await runCodexDaemonStart();
    return resumeColdCodexThreadViaDaemon(thread);
  }
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

const runCodexThreadList = (cwd, limit) => new Promise((resolve, reject) => {
  const child = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdoutBuffer = "";
  let stderr = "";
  let settled = false;
  let timeout;

  const finish = (error, result) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (child.exitCode === null) child.kill("SIGTERM");
    if (error) reject(error);
    else resolve(result);
  };

  const send = (message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const handleMessage = (message) => {
    if (message?.id === "mesurer-init") {
      if (message.error) {
        finish(new Error(message.error.message || "Codex app-server initialize failed."));
        return;
      }
      send({ method: "initialized" });
      send({
        id: "mesurer-thread-list",
        method: "thread/list",
        params: {
          limit,
          sortKey: "recency_at",
          sortDirection: "desc",
          cwd,
        },
      });
      return;
    }
    if (message?.id === "mesurer-thread-list") {
      if (message.error) {
        finish(new Error(message.error.message || "Codex app-server thread/list failed."));
        return;
      }
      finish(null, message.result ?? {});
    }
  };

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    while (true) {
      const newline = stdoutBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        handleMessage(JSON.parse(line));
      } catch {
        // App-server protocol is JSONL; ignore unrelated stdout defensively.
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8_192);
  });
  child.on("error", (error) => finish(error));
  child.on("close", (code, signal) => {
    if (settled) return;
    const detail = stderr.trim() || `exit code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;
    finish(new Error(`Codex app-server exited before thread/list completed: ${detail}`));
  });

  timeout = setTimeout(() => {
    child.kill("SIGTERM");
    finish(new Error(`Codex app-server thread/list timed out after ${APP_SERVER_TIMEOUT_MS}ms.`));
  }, APP_SERVER_TIMEOUT_MS);

  send({
    id: "mesurer-init",
    method: "initialize",
    params: {
      clientInfo: {
        name: "mesurer-solid",
        title: "Mesurer Solid",
        version: "1",
      },
      capabilities: {
        experimentalApi: false,
      },
    },
  });
});

const runCodexQueueLookup = (thread, queuedSubmissionId = null) => new Promise((resolve, reject) => {
  const child = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdoutBuffer = "";
  let stderr = "";
  let settled = false;
  let timeout;
  let cursor = null;
  let page = 0;

  const finish = (error, result) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (child.exitCode === null) child.kill("SIGTERM");
    if (error) reject(error);
    else resolve(result);
  };

  const send = (message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const requestPage = () => {
    page += 1;
    const params = {
      threadId: thread,
      limit: queuedSubmissionId ? 100 : 2,
    };
    if (cursor) params.cursor = cursor;
    send({
      id: `mesurer-queue-list-${page}`,
      method: "thread/queue/list",
      params,
    });
  };

  const handleMessage = (message) => {
    if (message?.id === "mesurer-queue-init") {
      if (message.error) {
        finish(new Error(message.error.message || "Codex app-server initialize failed."));
        return;
      }
      send({ method: "initialized" });
      requestPage();
      return;
    }

    const messageId = message?.id == null ? "" : String(message.id);
    if (!messageId.startsWith("mesurer-queue-list-")) return;
    if (message.error) {
      finish(new Error(message.error.message || "Codex app-server thread/queue/list failed."));
      return;
    }

    const data = Array.isArray(message.result?.data) ? message.result.data : [];
    const nextCursor = normalizeThread(message.result?.nextCursor);
    if (queuedSubmissionId) {
      const submission = data.find((candidate) => candidate?.id === queuedSubmissionId);
      if (submission) {
        finish(null, { submission, ambiguous: false });
        return;
      }
      if (nextCursor) {
        cursor = nextCursor;
        requestPage();
        return;
      }
      finish(null, { submission: null, ambiguous: false });
      return;
    }

    if (data.length === 1 && !nextCursor) {
      finish(null, { submission: data[0], ambiguous: false });
      return;
    }
    finish(null, {
      submission: null,
      ambiguous: data.length > 1 || Boolean(nextCursor),
    });
  };

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    while (true) {
      const newline = stdoutBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        handleMessage(JSON.parse(line));
      } catch {
        // App-server protocol is JSONL; ignore unrelated stdout defensively.
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8_192);
  });
  child.on("error", (error) => finish(error));
  child.on("close", (code, signal) => {
    if (settled) return;
    const detail = stderr.trim() || `exit code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;
    finish(new Error(`Codex app-server exited before thread/queue/list completed: ${detail}`));
  });

  timeout = setTimeout(() => {
    child.kill("SIGTERM");
    finish(new Error(`Codex app-server thread/queue/list timed out after ${APP_SERVER_TIMEOUT_MS}ms.`));
  }, APP_SERVER_TIMEOUT_MS);

  send({
    id: "mesurer-queue-init",
    method: "initialize",
    params: {
      clientInfo: {
        name: "mesurer-solid",
        title: "Mesurer Solid",
        version: "1",
      },
      capabilities: {
        experimentalApi: true,
      },
    },
  });
});

const queuedSubmissionMessage = (submission) => {
  if (!Array.isArray(submission?.input) || submission.input.length !== 1) return null;
  const input = submission.input[0];
  const text = String(input?.text ?? "");
  return input?.type === "text" && text.trim() ? text : null;
};

const runCodexTurnHistory = (thread) => new Promise((resolve, reject) => {
  const child = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdoutBuffer = "";
  let stderr = "";
  let settled = false;
  let timeout;

  const finish = (error, turns) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (child.exitCode === null) child.kill("SIGTERM");
    if (error) reject(error);
    else resolve(turns);
  };

  const send = (message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const handleMessage = (message) => {
    if (message?.id === "mesurer-history-init") {
      if (message.error) {
        finish(new Error(message.error.message || "Codex app-server initialize failed."));
        return;
      }
      send({ method: "initialized" });
      send({
        id: "mesurer-history-turns",
        method: "thread/turns/list",
        params: {
          threadId: thread,
          limit: DESKTOP_TURN_HISTORY_LIMIT,
          sortDirection: "desc",
          itemsView: "summary",
        },
      });
      return;
    }

    if (message?.id === "mesurer-history-turns") {
      if (message.error) {
        send({
          id: "mesurer-history-read",
          method: "thread/read",
          params: {
            threadId: thread,
            includeTurns: true,
          },
        });
        return;
      }
      finish(null, Array.isArray(message.result?.data) ? message.result.data : []);
      return;
    }

    if (message?.id === "mesurer-history-read") {
      if (message.error) {
        finish(new Error(message.error.message || "Codex app-server thread history read failed."));
        return;
      }
      finish(null, Array.isArray(message.result?.thread?.turns) ? message.result.thread.turns : []);
    }
  };

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    while (true) {
      const newline = stdoutBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        handleMessage(JSON.parse(line));
      } catch {
        // App-server protocol is JSONL; ignore unrelated stdout defensively.
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8_192);
  });
  child.on("error", (error) => finish(error));
  child.on("close", (code, signal) => {
    if (settled) return;
    const detail = stderr.trim() || `exit code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;
    finish(new Error(`Codex app-server exited before lifecycle history completed: ${detail}`));
  });

  timeout = setTimeout(() => {
    child.kill("SIGTERM");
    finish(new Error(`Codex app-server lifecycle history timed out after ${APP_SERVER_TIMEOUT_MS}ms.`));
  }, APP_SERVER_TIMEOUT_MS);

  send({
    id: "mesurer-history-init",
    method: "initialize",
    params: {
      clientInfo: {
        name: "mesurer-solid",
        title: "Mesurer Solid",
        version: "1",
      },
      capabilities: {
        experimentalApi: true,
      },
    },
  });
});

const openDesktopThread = (thread) => new Promise((resolveOpen, rejectOpen) => {
  const url = `codex://threads/${thread}`;
  const override = process.env.MESURER_CODEX_DESKTOP_OPEN_BIN?.trim();
  let command;
  let args;

  if (override) {
    command = override;
    args = [url];
  } else if (process.platform === "darwin") {
    command = "/usr/bin/open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "powershell.exe";
    const quotedUrl = url.replaceAll("'", "''");
    args = [
      "-NoProfile",
      "-Command",
      `Start-Process -FilePath '${quotedUrl}'`,
    ];
  } else {
    rejectOpen(new Error(
      `Codex Desktop thread wake is unsupported on platform ${process.platform}.`,
    ));
    return;
  }

  const child = spawn(command, args, {
    env: process.env,
    shell: false,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  let settled = false;
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
    if (settled) return;
    settled = true;
    rejectOpen(new Error("Codex Desktop thread open timed out."));
  }, APP_SERVER_TIMEOUT_MS);

  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8_192);
  });
  child.on("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    rejectOpen(error);
  });
  child.on("close", (code, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (code === 0) {
      resolveOpen({ url });
      return;
    }
    const detail = stderr.trim()
      || `exit code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;
    rejectOpen(new Error(`Codex Desktop thread open failed: ${detail}`));
  });
});

let maybeDispatchDesktopThread = async (_thread) => {};

const scheduleDesktopDispatch = (thread, delay = 0) => {
  if (desktopDispatchTimers.has(thread)) return;
  const timer = setTimeout(() => {
    desktopDispatchTimers.delete(thread);
    void maybeDispatchDesktopThread(thread);
  }, delay);
  desktopDispatchTimers.set(thread, timer);
};

maybeDispatchDesktopThread = async (thread) => {
  const record = registeredThreads.get(thread);
  if (!record?.appToolsPipe) return;
  const delivery = [...deliveries.values()]
    .filter((candidate) =>
      candidate.thread === thread
      && candidate.transport === "desktop-app"
      && candidate.status === "queued"
      && candidate.dispatch !== "desktop-opened")
    .sort((left, right) => left.createdAt - right.createdAt)[0];
  if (!delivery) return;

  try {
    if (!delivery.queuedSubmissionId) {
      const output = await runCodexQueue(thread, delivery.message);
      delivery.queuedSubmissionId = queuedSubmissionFromOutput(output, thread);
      if (!delivery.queuedSubmissionId) {
        throw new Error("Codex queue succeeded but did not return a queued submission id.");
      }
      delivery.dispatch = "persisted";
      delivery.dispatchError = null;
      delivery.updatedAt = Date.now();
      await persistDeliveryState();
    }

    await openDesktopThread(thread);
    delivery.dispatch = "desktop-opened";
    delivery.dispatchError = null;
    delivery.updatedAt = Date.now();
    persistDeliveryStateSoon();
  } catch (cause) {
    delivery.dispatch = "desktop-wait-failed";
    delivery.dispatchError = cause instanceof Error ? cause.message : String(cause);
    delivery.updatedAt = Date.now();
    persistDeliveryStateSoon();
  }
};

const normalizeTitle = (value) => {
  if (value == null) return null;
  const title = String(value).replace(/\s+/g, " ").trim();
  if (!title) return null;
  return title.length > 80 ? `${title.slice(0, 79)}…` : title;
};

const normalizeTimestamp = (value) => Number.isFinite(value) ? Number(value) : null;
const shortThread = (thread) => thread.length > 16 ? `${thread.slice(0, 8)}…${thread.slice(-4)}` : thread;

const appServerSummary = (thread, cwd) => {
  const id = normalizeThread(thread?.id);
  if (!id) return null;
  const title = normalizeTitle(thread?.name)
    ?? normalizeTitle(thread?.preview)
    ?? `Codex ${shortThread(id)}`;
  return {
    id,
    title,
    updatedAt: normalizeTimestamp(thread?.recencyAt ?? thread?.updatedAt),
    connected: registeredThreads.has(id),
    cwd,
  };
};

const registeredSummary = (record) => ({
  id: record.id,
  title: `Codex ${shortThread(record.id)}`,
  updatedAt: Math.floor(record.seenAt / 1_000),
  connected: true,
  cwd: record.cwd,
});

const listThreadSummaries = async (scopeThread, limit) => {
  const scopeRecord = scopeThread
    ? registeredThreads.get(scopeThread) ?? discoveredThreads.get(scopeThread)
    : activeThread
      ? registeredThreads.get(activeThread) ?? discoveredThreads.get(activeThread)
      : null;
  const scopeCwd = scopeRecord?.cwd ?? activeCwd;
  const preferredThread = scopeThread ?? activeThread;
  const summaries = [];
  let appHasMore = false;

  if (scopeCwd) {
    try {
      const listed = await runCodexThreadList(scopeCwd, MAX_DISCOVERED_THREADS);
      const data = Array.isArray(listed?.data) ? listed.data : [];
      appHasMore = Boolean(listed?.nextCursor);
      for (const item of data) {
        const summary = appServerSummary(item, scopeCwd);
        if (!summary) continue;
        discoveredThreads.set(summary.id, summary);
        summaries.push(summary);
      }
    } catch {
      // Discovery is optional. Registered SessionStart destinations still work without app-server listing.
    }
  }

  const byId = new Map(summaries.map((summary) => [summary.id, summary]));
  const ordered = [];
  const seen = new Set();
  const push = (summary) => {
    if (!summary || seen.has(summary.id)) return;
    seen.add(summary.id);
    ordered.push({
      id: summary.id,
      title: summary.title,
      updatedAt: summary.updatedAt,
      connected: registeredThreads.has(summary.id),
    });
  };

  if (preferredThread) {
    push(byId.get(preferredThread)
      ?? (registeredThreads.get(preferredThread) ? registeredSummary(registeredThreads.get(preferredThread)) : null)
      ?? discoveredThreads.get(preferredThread));
  }
  for (const summary of summaries) push(summary);
  for (const record of registeredThreads.values()) {
    if (scopeCwd && record.cwd && record.cwd !== scopeCwd) continue;
    push(byId.get(record.id) ?? registeredSummary(record));
  }

  return {
    thread: preferredThread,
    threadDetails: ordered.slice(0, limit),
    hasMore: appHasMore || ordered.length > limit,
  };
};

const threadPayload = () => ({
  thread: activeThread,
  threads: [...registeredThreads.keys()],
});

const hashMessage = (message) => createHash("sha256").update(message).digest("hex");
const turnKey = (thread, turnId) => `${thread}:${turnId}`;
const publicDelivery = (delivery) => ({
  deliveryId: delivery.id,
  thread: delivery.thread,
  transport: delivery.transport,
  status: delivery.status,
  turnId: delivery.turnId,
  queuedSubmissionId: delivery.queuedSubmissionId,
  dispatch: delivery.dispatch,
  dispatchError: delivery.dispatchError,
  createdAt: delivery.createdAt,
  updatedAt: delivery.updatedAt,
});

const pruneDeliveries = () => {
  const now = Date.now();
  for (const [id, delivery] of deliveries) {
    const terminal = delivery.status === "completed" || delivery.status === "interrupted";
    if (now - delivery.updatedAt > (terminal ? TERMINAL_DELIVERY_TTL_MS : DELIVERY_TTL_MS)) {
      deliveries.delete(id);
      desktopLifecycleChecks.delete(id);
      desktopLifecycleLastCheckedAt.delete(id);
    }
  }
  for (const [key, event] of terminalTurnEvents) {
    if (now - event.at > TERMINAL_DELIVERY_TTL_MS) terminalTurnEvents.delete(key);
  }
  if (deliveries.size <= MAX_DELIVERIES) return;
  const oldest = [...deliveries.values()].sort((a, b) => a.updatedAt - b.updatedAt);
  for (const delivery of oldest.slice(0, deliveries.size - MAX_DELIVERIES)) {
    deliveries.delete(delivery.id);
  }
};

const createDelivery = (thread, message, transport = "codex-queue") => {
  pruneDeliveries();
  const now = Date.now();
  const delivery = {
    id: randomUUID(),
    thread,
    message,
    messageHash: hashMessage(message),
    transport,
    status: "queued",
    turnId: null,
    queuedSubmissionId: null,
    dispatch: "persisting",
    dispatchError: null,
    createdAt: now,
    updatedAt: now,
  };
  deliveries.set(delivery.id, delivery);
  if (delivery.transport === "desktop-app") persistDeliveryStateSoon();
  return delivery;
};

const xmlEscape = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const promptMatchesDelivery = (delivery, prompt) => {
  if (delivery.messageHash === hashMessage(prompt)) return true;
  if (delivery.transport !== "desktop-app" || !delivery.message) return false;
  return prompt.includes(delivery.message)
    || prompt.includes(`<input>${xmlEscape(delivery.message)}</input>`);
};

const turnUserMessages = (turn) => {
  if (!Array.isArray(turn?.items)) return [];
  return turn.items.flatMap((item) => {
    if (item?.type !== "userMessage" || !Array.isArray(item.content)) return [];
    const text = item.content
      .filter((input) => input?.type === "text")
      .map((input) => String(input.text ?? ""))
      .join("\n")
      .trim();
    return text ? [text] : [];
  });
};

const deliveryTurn = (delivery, turns) => {
  if (delivery.turnId) {
    return turns.find((turn) => normalizeThread(turn?.id) === delivery.turnId) ?? null;
  }

  const earliestStartedAt = delivery.createdAt - DELIVERY_TURN_START_SKEW_MS;
  const matches = turns.filter((turn) => {
    const turnId = normalizeThread(turn?.id);
    const startedAt = Number(turn?.startedAt);
    if (!turnId || !Number.isFinite(startedAt) || startedAt * 1_000 < earliestStartedAt) {
      return false;
    }
    return turnUserMessages(turn).some((prompt) => promptMatchesDelivery(delivery, prompt));
  });
  return matches.length === 1 ? matches[0] : null;
};

const reconcileDesktopDelivery = async (delivery) => {
  if (delivery.transport !== "desktop-app"
    || delivery.dispatch !== "desktop-opened"
    || (delivery.status !== "queued" && delivery.status !== "working")) {
    return;
  }

  const turns = await runCodexTurnHistory(delivery.thread);
  if (deliveries.get(delivery.id) !== delivery) return;
  const turn = deliveryTurn(delivery, turns);
  if (!turn) return;

  const turnId = normalizeThread(turn.id);
  let nextStatus = null;
  if (turn.status === "inProgress") nextStatus = "working";
  if (turn.status === "completed") nextStatus = "completed";
  if (turn.status === "interrupted" || turn.status === "failed") nextStatus = "interrupted";
  if (!turnId || !nextStatus) return;

  const failed = turn.status === "failed";
  const failureMessage = normalizeThread(turn?.error?.message) ?? "Codex turn failed.";
  const changed = delivery.turnId !== turnId
    || delivery.status !== nextStatus
    || (failed && delivery.dispatchError !== failureMessage);
  if (!changed) return;

  delivery.turnId = turnId;
  delivery.status = nextStatus;
  if (failed) delivery.dispatchError = failureMessage;
  delivery.updatedAt = Date.now();
  await persistDeliveryState();
};

const scheduleDesktopLifecycleCheck = (delivery) => {
  if (delivery.transport !== "desktop-app"
    || delivery.dispatch !== "desktop-opened"
    || (delivery.status !== "queued" && delivery.status !== "working")
    || desktopLifecycleChecks.has(delivery.id)) {
    return;
  }

  const now = Date.now();
  const lastCheckedAt = desktopLifecycleLastCheckedAt.get(delivery.id) ?? 0;
  if (now - lastCheckedAt < DESKTOP_LIFECYCLE_POLL_MS) return;
  desktopLifecycleLastCheckedAt.set(delivery.id, now);

  const check = reconcileDesktopDelivery(delivery)
    .catch(() => undefined)
    .finally(() => {
      if (desktopLifecycleChecks.get(delivery.id) === check) {
        desktopLifecycleChecks.delete(delivery.id);
      }
    });
  desktopLifecycleChecks.set(delivery.id, check);
};

const markPromptStarted = (thread, turnId, prompt) => {
  const delivery = [...deliveries.values()]
    .filter((candidate) =>
      candidate.thread === thread
      && promptMatchesDelivery(candidate, prompt)
      && candidate.status === "queued")
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!delivery) return null;
  delivery.status = "working";
  delivery.turnId = turnId;
  delivery.updatedAt = Date.now();
  if (delivery.transport === "desktop-app") persistDeliveryStateSoon();
  const terminal = terminalTurnEvents.get(turnKey(thread, turnId));
  if (terminal) {
    delivery.status = terminal.status;
    delivery.updatedAt = Math.max(delivery.updatedAt, terminal.at);
    terminalTurnEvents.delete(turnKey(thread, turnId));
    if (delivery.transport === "desktop-app") persistDeliveryStateSoon();
  }
  return delivery;
};

const markTurnTerminal = (thread, turnId, status) => {
  const delivery = [...deliveries.values()].find((candidate) =>
    candidate.thread === thread
    && candidate.turnId === turnId
    && candidate.status === "working");
  if (delivery) {
    delivery.status = status;
    delivery.updatedAt = Date.now();
    if (delivery.transport === "desktop-app") persistDeliveryStateSoon();
    return delivery;
  }
  terminalTurnEvents.set(turnKey(thread, turnId), { status, at: Date.now() });
  return null;
};

await loadDeliveryState();

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

  if (request.method === "POST" && request.url === "/shutdown") {
    if (originHeaderPresent) {
      writeJson(response, 403, { ok: false, error: "Bridge shutdown is local-process-only." }, origin);
      return;
    }
    response.setHeader("Connection", "close");
    response.once("finish", () => {
      server.close();
      server.closeAllConnections?.();
      setImmediate(() => process.exit(0));
    });
    writeJson(response, 200, { ok: true }, origin);
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, { ok: true, bridge: BRIDGE_IDENTITY, ...threadPayload() }, origin);
    return;
  }

  if (request.method === "GET" && request.url?.startsWith("/deliveries/")) {
    pruneDeliveries();
    const url = new URL(request.url, DEFAULT_BRIDGE);
    const prefix = "/deliveries/";
    const deliveryId = decodeURIComponent(url.pathname.slice(prefix.length));
    const delivery = deliveries.get(deliveryId);
    if (!delivery) {
      writeJson(response, 404, { ok: false, error: `Codex delivery is not available: ${deliveryId}` }, origin);
      return;
    }
    scheduleDesktopLifecycleCheck(delivery);
    writeJson(response, 200, { ok: true, ...publicDelivery(delivery) }, origin);
    return;
  }

  if (request.method === "POST" && request.url === "/deliveries/restore") {
    try {
      const body = await readJsonBody(request);
      const deliveryId = normalizeThread(body?.deliveryId);
      const thread = normalizeThread(body?.thread);
      const queuedSubmissionId = normalizeThread(body?.queuedSubmissionId);
      if (!deliveryId || !thread) {
        writeJson(response, 400, { ok: false, error: "deliveryId and thread are required." }, origin);
        return;
      }
      if (!registeredThreads.has(thread) && !discoveredThreads.has(thread)) {
        writeJson(response, 409, {
          ok: false,
          error: `Codex thread is not available to this bridge: ${thread}`,
        }, origin);
        return;
      }

      const existing = deliveries.get(deliveryId);
      if (existing) {
        if (existing.transport === "desktop-app") scheduleDesktopDispatch(existing.thread);
        writeJson(response, 200, { ok: true, restored: false, ...publicDelivery(existing) }, origin);
        return;
      }

      const lookup = await runCodexQueueLookup(thread, queuedSubmissionId);
      if (!lookup.submission) {
        const error = lookup.ambiguous
          ? "Multiple queued Codex submissions exist for this thread; an exact queuedSubmissionId is required to restore the delivery safely."
          : queuedSubmissionId
            ? `Codex queued submission is not available: ${queuedSubmissionId}`
            : "No queued Codex submission is available to restore for this thread.";
        writeJson(response, 409, { ok: false, error }, origin);
        return;
      }

      const message = queuedSubmissionMessage(lookup.submission);
      if (!message) {
        writeJson(response, 409, {
          ok: false,
          error: "The queued Codex submission is not a single text message and cannot be restored safely.",
        }, origin);
        return;
      }

      pruneDeliveries();
      const now = Date.now();
      const record = registeredThreads.get(thread);
      const transport = record?.appToolsPipe ? "desktop-app" : "codex-queue";
      const delivery = {
        id: deliveryId,
        thread,
        message,
        messageHash: hashMessage(message),
        transport,
        status: "queued",
        turnId: null,
        queuedSubmissionId: lookup.submission.id,
        dispatch: "persisted",
        dispatchError: null,
        createdAt: now,
        updatedAt: now,
      };
      deliveries.set(delivery.id, delivery);
      await persistDeliveryState();

      if (transport === "desktop-app") {
        delivery.dispatch = "persisted";
        delivery.updatedAt = Date.now();
        await persistDeliveryState();
        scheduleDesktopDispatch(thread);
      } else {
        try {
          const wake = await resumeColdCodexThread(thread);
          delivery.dispatch = wake.action;
          delivery.updatedAt = Date.now();
        } catch (cause) {
          delivery.dispatch = "wake-failed";
          delivery.dispatchError = cause instanceof Error ? cause.message : String(cause);
          delivery.updatedAt = Date.now();
        }
        persistDeliveryStateSoon();
      }

      writeJson(response, 200, {
        ok: true,
        restored: true,
        ...publicDelivery(delivery),
      }, origin);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      writeJson(response, 502, { ok: false, error }, origin);
    }
    return;
  }

  if (request.method === "GET" && request.url?.startsWith("/threads")) {
    const url = new URL(request.url, DEFAULT_BRIDGE);
    if (url.pathname !== "/threads") {
      writeJson(response, 404, { ok: false, error: "Not found." }, origin);
      return;
    }
    const requestedLimit = Number(url.searchParams.get("limit") ?? "5");
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(MAX_DISCOVERED_THREADS, Math.max(1, requestedLimit))
      : 5;
    const scopeThread = normalizeThread(url.searchParams.get("thread")) ?? activeThread;
    if (scopeThread && !registeredThreads.has(scopeThread) && !discoveredThreads.has(scopeThread)) {
      writeJson(response, 409, { ok: false, error: `Codex thread is not known to this bridge: ${scopeThread}` }, origin);
      return;
    }
    const payload = await listThreadSummaries(scopeThread, limit);
    writeJson(response, 200, { ok: true, ...payload }, origin);
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
      const cwd = normalizeCwd(body?.cwd);
      const appToolsPipe = normalizeThread(body?.appToolsPipe);
      const codexHome = normalizeCwd(body?.codexHome);
      if (!thread) {
        writeJson(response, 400, { ok: false, error: "thread must be a non-empty string." }, origin);
        return;
      }
      registerThread(thread, cwd, { appToolsPipe, codexHome });
      if (appToolsPipe) scheduleDesktopDispatch(thread);
      writeJson(response, 200, { ok: true, ...threadPayload() }, origin);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      writeJson(response, 400, { ok: false, error }, origin);
    }
    return;
  }

  if (request.method === "POST" && request.url === "/lifecycle") {
    if (originHeaderPresent) {
      writeJson(response, 403, {
        ok: false,
        error: "Codex lifecycle updates are available only to a local process, not a browser Origin.",
      }, origin);
      return;
    }
    try {
      const body = await readJsonBody(request);
      const event = body?.event;
      const thread = normalizeThread(body?.sessionId);
      const turnId = normalizeThread(body?.turnId);
      if (!thread || !turnId) {
        writeJson(response, 400, { ok: false, error: "sessionId and turnId are required." }, origin);
        return;
      }

      let delivery = null;
      if (event === "UserPromptSubmit") {
        const prompt = body?.prompt?.trim?.() ?? "";
        if (!prompt) {
          writeJson(response, 400, { ok: false, error: "UserPromptSubmit requires prompt." }, origin);
          return;
        }
        delivery = markPromptStarted(thread, turnId, prompt);
      } else if (event === "Stop") {
        delivery = markTurnTerminal(thread, turnId, "completed");
        scheduleDesktopDispatch(thread);
      } else if (event === "Interrupt") {
        delivery = markTurnTerminal(thread, turnId, "interrupted");
        scheduleDesktopDispatch(thread);
      } else {
        writeJson(response, 400, { ok: false, error: `Unsupported Codex lifecycle event: ${event ?? "<missing>"}` }, origin);
        return;
      }
      pruneDeliveries();
      if (delivery) {
        writeJson(response, 200, {
          ok: true,
          matched: true,
          ...publicDelivery(delivery),
        }, origin);
      } else {
        writeJson(response, 200, { ok: true, matched: false }, origin);
      }
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
      const record = registeredThreads.get(thread);
      if (!record) {
        writeJson(response, 409, {
          ok: false,
          error: `Codex thread is not registered with this bridge: ${thread}`,
        }, origin);
        return;
      }
      activeThread = thread;
      if (record.cwd) activeCwd = record.cwd;
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
    if (!registeredThreads.has(thread) && !discoveredThreads.has(thread)) {
      writeJson(response, 409, {
        ok: false,
        error: `Codex thread is not available to this bridge: ${thread}`,
      }, origin);
      return;
    }

    const record = registeredThreads.get(thread);
    if (record?.appToolsPipe) {
      const delivery = createDelivery(thread, message, "desktop-app");
      let output;
      try {
        output = await runCodexQueue(thread, message);
      } catch (cause) {
        deliveries.delete(delivery.id);
        persistDeliveryStateSoon();
        throw cause;
      }
      delivery.queuedSubmissionId = queuedSubmissionFromOutput(output, thread);
      if (!delivery.queuedSubmissionId) {
        deliveries.delete(delivery.id);
        persistDeliveryStateSoon();
        throw new Error("Codex queue succeeded but did not return a queued submission id.");
      }
      delivery.dispatch = "persisted";
      delivery.updatedAt = Date.now();
      await persistDeliveryState();
      scheduleDesktopDispatch(thread);
      successfulSends += 1;
      writeJson(response, 200, {
        ok: true,
        thread,
        output,
        delivery: "queued",
        ...publicDelivery(delivery),
      }, origin);
      if (values.once && successfulSends >= 1) setImmediate(() => server.close());
      return;
    }

    const delivery = createDelivery(thread, message, "codex-queue");
    let output;
    try {
      output = await runCodexQueue(thread, message);
    } catch (cause) {
      deliveries.delete(delivery.id);
      persistDeliveryStateSoon();
      throw cause;
    }
    delivery.queuedSubmissionId = queuedSubmissionFromOutput(output, thread);
    delivery.dispatch = "persisted";
    delivery.updatedAt = Date.now();

    if (delivery.queuedSubmissionId) {
      try {
        const wake = await resumeColdCodexThread(thread);
        delivery.dispatch = wake.action;
        delivery.updatedAt = Date.now();
      } catch (cause) {
        delivery.dispatch = "wake-failed";
        delivery.dispatchError = cause instanceof Error ? cause.message : String(cause);
        delivery.updatedAt = Date.now();
      }
    } else {
      delivery.dispatch = "untracked";
      delivery.dispatchError = "Codex queue succeeded but did not return a queued submission id.";
      delivery.updatedAt = Date.now();
    }
    persistDeliveryStateSoon();

    successfulSends += 1;
    writeJson(response, 200, {
      ok: true,
      thread,
      output,
      delivery: "queued",
      ...publicDelivery(delivery),
    }, origin);
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
  for (const [thread, record] of registeredThreads) {
    if (record.appToolsPipe) scheduleDesktopDispatch(thread);
  }
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
