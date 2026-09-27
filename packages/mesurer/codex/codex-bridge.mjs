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

const DAEMON_START_TIMEOUT_MS = 15_000;

const DELIVERY_STATE_VERSION = 1;

const MAX_DISCOVERED_THREADS = 10;

const MAX_DELIVERIES = 100;

const TERMINAL_DELIVERY_TTL_MS = 10 * 60_000;

const DELIVERY_TTL_MS = 2 * 60 * 60_000;

const TURN_HISTORY_LIMIT = 10;

const DELIVERY_TURN_START_SKEW_MS = 60_000;

const CLIENT_LEASE_TTL_MS = 15_000;

const CLIENT_LEASE_POLL_MS = 5_000;

const STARTUP_CLIENT_GRACE_MS = 15_000;

const LAST_CLIENT_SHUTDOWN_DELAY_MS = 1_000;

const OWNED_CHILD_SHUTDOWN_GRACE_MS = 250;

const usage = `Usage:
  mesurer-codex [options]

Options:
  --thread <value>    Preferred Codex session UUID or exact session name.
                      The bridge normally discovers loaded threads from Codex directly.
  --cwd <path>        Optional project directory used to scope recent-thread discovery.
  --port <number>     Loopback port (default: ${DEFAULT_PORT}; use 0 for any free port)
  --origin <origin>   Additional allowed browser Origin. Repeatable.
  --codex <path>      Codex executable (default: CODEX_BIN or codex)
  --once              Exit after one successful queued message
  --help              Show this help

Loopback browser origins such as http://localhost:* and http://127.0.0.1:* are allowed by default.
For file:// or Electron pages, pass --origin null explicitly.
The bridge discovers live Codex threads through Codex's shared local app-server daemon.
`;

const { values } = parseArgs({
  options: {
    thread: { type: "string" },
    cwd: { type: "string" },
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

const normalizeThread = (value) => value?.trim() || null;

const normalizeCwd = (value) => value?.trim() || null;

const parsedPort = Number(values.port);

if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
  process.stderr.write(`Invalid --port: ${values.port}\n`);
  process.exit(2);
}

const initialThread = normalizeThread(values.thread) ?? normalizeThread(process.env.CODEX_THREAD_ID);

const codexBin = values.codex?.trim() || process.env.CODEX_BIN?.trim() || "codex";

const additionalOrigins = new Set(values.origin ?? []);

const discoveredThreads = new Map();

const loadedThreadIds = new Set();

const browserClients = new Map();

const deliveries = new Map();

const ownedChildren = new Set();

let activeThread = initialThread;

let idleShutdownTimer = null;

let clientLeaseTimer = null;

let startupShutdownTimer = null;

let hasEverClient = false;

let server = null;

let shutdownStarted = false;

const spawnOwned = (...args) => {
  const child = spawn(...args);
  ownedChildren.add(child);

  const release = () => ownedChildren.delete(child);
  child.once("close", release);
  child.once("error", release);

  return child;
};

const cancelIdleShutdown = () => {
  if (!idleShutdownTimer) return;
  clearTimeout(idleShutdownTimer);
  idleShutdownTimer = null;
};

const scheduleIdleShutdown = () => {
  if (shutdownStarted || !hasEverClient || browserClients.size > 0 || idleShutdownTimer) return;

  idleShutdownTimer = setTimeout(() => {
    idleShutdownTimer = null;

    if (browserClients.size === 0) void shutdownBridge();
  }, LAST_CLIENT_SHUTDOWN_DELAY_MS);
  idleShutdownTimer.unref?.();
};

const touchClient = (clientId) => {
  hasEverClient = true;
  cancelIdleShutdown();

  if (startupShutdownTimer) {
    clearTimeout(startupShutdownTimer);
    startupShutdownTimer = null;
  }

  browserClients.set(clientId, Date.now());
};

const releaseClient = (clientId) => {
  const removed = browserClients.delete(clientId);

  if (browserClients.size === 0) scheduleIdleShutdown();

  return removed;
};

const pruneExpiredClients = () => {
  const cutoff = Date.now() - CLIENT_LEASE_TTL_MS;

  for (const [clientId, seenAt] of browserClients) {
    if (seenAt < cutoff) browserClients.delete(clientId);
  }

  if (browserClients.size === 0) scheduleIdleShutdown();
};

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
  const persistedDeliveries = [...deliveries.values()].map(persistedDelivery);

  const state = {
    version: DELIVERY_STATE_VERSION,
    deliveries: persistedDeliveries,
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
    const transport = "codex-queue";
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
  const child = spawnOwned(codexBin, ["app-server", "daemon", "start"], {
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

const runCodexDaemonRequestOnce = (
  method,
  params = {},
  { timeoutMs = APP_SERVER_TIMEOUT_MS, experimentalApi = false } = {},
) => new Promise((resolve, reject) => {
  const child = spawnOwned(codexBin, ["stdio-to-uds", codexControlSocketPath()], {
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const requestId = `mesurer-daemon-${randomUUID()}`;
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
    if (message?.id === `${requestId}-init`) {
      if (message.error) {
        finish(new Error(message.error.message || "Codex daemon initialize failed."));

        return;
      }

      send({ method: "initialized" });
      send({ id: requestId, method, params });

      return;
    }

    if (message?.id !== requestId) return;

    if (message.error) {
      finish(new Error(message.error.message || `Codex daemon ${method} failed.`));

      return;
    }

    finish(null, message.result ?? {});
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
    finish(new Error(`Codex daemon relay exited before ${method} completed: ${detail}`));
  });

  timeout = setTimeout(() => {
    child.kill("SIGTERM");
    finish(new Error(`Codex daemon ${method} timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  send({
    id: `${requestId}-init`,
    method: "initialize",
    params: {
      clientInfo: {
        name: "mesurer-solid",
        title: "Mesurer Solid",
        version: "1",
      },
      capabilities: {
        experimentalApi,
      },
    },
  });
});

const runCodexDaemonRequest = async (method, params = {}, options = {}) => {
  try {
    return await runCodexDaemonRequestOnce(method, params, options);
  } catch (cause) {
    if (!missingDaemonSocket(cause)) throw cause;
    await runCodexDaemonStart();

    return runCodexDaemonRequestOnce(method, params, options);
  }
};

const runCodexQueue = (thread, message) => new Promise((resolve, reject) => {
  const child = spawnOwned(codexBin, ["queue", "--thread", thread, "--message", message], {
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

const runCodexThreadList = (cwd, limit) => {
  const params = {
    limit,
    sortKey: "recency_at",
    sortDirection: "desc",
  };

  if (cwd) params.cwd = cwd;

  return runCodexDaemonRequest("thread/list", params);
};

const runCodexLoadedThreadList = (limit) =>
  runCodexDaemonRequest("thread/loaded/list", { limit });

const runCodexQueueLookup = async (thread, queuedSubmissionId = null) => {
  let cursor = null;

  while (true) {
    const params = {
      threadId: thread,
      limit: queuedSubmissionId ? 100 : 2,
    };

    if (cursor) params.cursor = cursor;

    const result = await runCodexDaemonRequest(
      "thread/queue/list",
      params,
      { experimentalApi: true },
    );

    const data = Array.isArray(result?.data) ? result.data : [];
    const nextCursor = normalizeThread(result?.nextCursor);

    if (queuedSubmissionId) {
      const submission = data.find((candidate) => candidate?.id === queuedSubmissionId);

      if (submission) return { submission, ambiguous: false };

      if (nextCursor) {
        cursor = nextCursor;

        continue;
      }

      return { submission: null, ambiguous: false };
    }

    if (data.length === 1 && !nextCursor) {
      return { submission: data[0], ambiguous: false };
    }

    return {
      submission: null,
      ambiguous: data.length > 1 || Boolean(nextCursor),
    };
  }
};

const queuedSubmissionMessage = (submission) => {
  if (!Array.isArray(submission?.input) || submission.input.length !== 1) return null;
  const input = submission.input[0];
  const text = String(input?.text ?? "");

  return input?.type === "text" && text.trim() ? text : null;
};

const runCodexTurnHistory = async (thread) => {
  try {
    const result = await runCodexDaemonRequest(
      "thread/turns/list",
      {
        threadId: thread,
        limit: TURN_HISTORY_LIMIT,
        sortDirection: "desc",
        itemsView: "summary",
      },
      { experimentalApi: true },
    );

    return Array.isArray(result?.data) ? result.data : [];
  } catch {
    const result = await runCodexDaemonRequest(
      "thread/read",
      {
        threadId: thread,
        includeTurns: true,
      },
      { experimentalApi: true },
    );

    return Array.isArray(result?.thread?.turns) ? result.thread.turns : [];
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

const appServerSummary = (thread) => {
  const id = normalizeThread(thread?.id);

  if (!id) return null;

  const title = normalizeTitle(thread?.name)
    ?? normalizeTitle(thread?.preview)
    ?? `Codex ${shortThread(id)}`;

  return {
    id,
    title,
    updatedAt: normalizeTimestamp(thread?.recencyAt ?? thread?.updatedAt),
    connected: loadedThreadIds.has(id),
    cwd: normalizeCwd(thread?.cwd),
  };
};

const refreshDiscoveredThreads = async () => {
  const loaded = await runCodexLoadedThreadList(MAX_DISCOVERED_THREADS);

  const ids = Array.isArray(loaded?.data)
    ? loaded.data.map(normalizeThread).filter(Boolean)
    : [];

  loadedThreadIds.clear();

  for (const id of ids) loadedThreadIds.add(id);

  const summaries = [];
  const byId = new Map();

  try {
    const listed = await runCodexThreadList(null, Math.max(MAX_DISCOVERED_THREADS * 4, 40));

    for (const item of Array.isArray(listed?.data) ? listed.data : []) {
      const summary = appServerSummary(item);

      if (!summary || !loadedThreadIds.has(summary.id)) continue;
      byId.set(summary.id, summary);
    }
  } catch {
    // Loaded-thread discovery remains authoritative even if metadata listing is unavailable.
  }

  for (const id of loadedThreadIds) {
    let summary = byId.get(id);

    if (!summary) {
      try {
        const read = await runCodexDaemonRequest("thread/read", {
          threadId: id,
          includeTurns: false,
        });

        summary = appServerSummary(read?.thread);
      } catch {
        summary = {
          id,
          title: `Codex ${shortThread(id)}`,
          updatedAt: null,
          connected: true,
          cwd: null,
        };
      }
    }

    if (!summary) continue;
    discoveredThreads.set(id, summary);
    summaries.push(summary);
  }

  for (const id of discoveredThreads.keys()) {
    if (!loadedThreadIds.has(id)) discoveredThreads.delete(id);
  }

  summaries.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));

  if (!activeThread || !loadedThreadIds.has(activeThread)) {
    activeThread = summaries[0]?.id ?? null;
  }

  return summaries;
};

const listThreadSummaries = async (scopeThread, limit) => {
  const summaries = await refreshDiscoveredThreads();

  const preferredThread = scopeThread && loadedThreadIds.has(scopeThread)
    ? scopeThread
    : activeThread;

  const ordered = [];

  const seen = new Set();

  const push = (summary) => {
    if (!summary || seen.has(summary.id)) return;
    seen.add(summary.id);
    ordered.push({
      id: summary.id,
      title: summary.title,
      updatedAt: summary.updatedAt,
      connected: true,
    });
  };

  if (preferredThread) push(discoveredThreads.get(preferredThread));

  for (const summary of summaries) push(summary);

  return {
    thread: preferredThread,
    threadDetails: ordered.slice(0, limit),
    hasMore: ordered.length > limit,
  };
};

const threadPayload = () => ({
  thread: activeThread,
  threads: [...loadedThreadIds],
});

const hashMessage = (message) => createHash("sha256").update(message).digest("hex");

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
    }
  }

  if (deliveries.size <= MAX_DELIVERIES) return;
  const oldest = [...deliveries.values()].sort((a, b) => a.updatedAt - b.updatedAt);

  for (const delivery of oldest.slice(0, deliveries.size - MAX_DELIVERIES)) {
    deliveries.delete(delivery.id);
  }
};

const createDelivery = (thread, message) => {
  pruneDeliveries();

  const now = Date.now();

  const delivery = {
    id: randomUUID(),
    thread,
    message,
    messageHash: hashMessage(message),
    transport: "codex-queue",
    status: "queued",
    turnId: null,
    queuedSubmissionId: null,
    dispatch: "persisting",
    dispatchError: null,
    createdAt: now,
    updatedAt: now,
  };

  deliveries.set(delivery.id, delivery);
  persistDeliveryStateSoon();

  return delivery;
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

    return turnUserMessages(turn).some((prompt) =>
      hashMessage(prompt) === delivery.messageHash
      || prompt.includes(delivery.message));
  });

  return matches.length === 1 ? matches[0] : null;
};

const reconcileDelivery = async (delivery) => {
  if (delivery.status === "completed" || delivery.status === "interrupted") return;

  const turns = await runCodexTurnHistory(delivery.thread);

  if (deliveries.get(delivery.id) !== delivery) return;
  const turn = deliveryTurn(delivery, turns);

  if (!turn) return;
  const turnId = normalizeThread(turn.id);
  const ended = turn.completedAt != null && Number.isFinite(Number(turn.completedAt));
  let nextStatus = null;

  if (turn.status === "inProgress") nextStatus = "working";

  if (turn.status === "interrupted" && !ended) nextStatus = "working";

  if (turn.status === "completed") nextStatus = "completed";

  if ((turn.status === "interrupted" && ended) || turn.status === "failed") {
    nextStatus = "interrupted";
  }

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

await loadDeliveryState();

let successfulSends = 0;

server = createServer(async (request, response) => {
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

  if (request.method === "POST" && request.url === "/clients/acquire") {
    try {
      const body = await readJsonBody(request);
      const clientId = normalizeThread(body?.clientId);

      if (!clientId) {
        writeJson(response, 400, { ok: false, error: "clientId must be a non-empty string." }, origin);

        return;
      }

      touchClient(clientId);
      writeJson(response, 200, {
        ok: true,
        clientId,
        leaseTtlMs: CLIENT_LEASE_TTL_MS,
      }, origin);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      writeJson(response, 400, { ok: false, error }, origin);
    }

    return;
  }

  if (request.method === "POST" && request.url === "/clients/heartbeat") {
    try {
      const body = await readJsonBody(request);
      const clientId = normalizeThread(body?.clientId);

      if (!clientId) {
        writeJson(response, 400, { ok: false, error: "clientId must be a non-empty string." }, origin);

        return;
      }

      touchClient(clientId);
      writeJson(response, 200, { ok: true, clientId }, origin);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      writeJson(response, 400, { ok: false, error }, origin);
    }

    return;
  }

  if (request.method === "POST" && request.url === "/clients/release") {
    try {
      const body = await readJsonBody(request);
      const clientId = normalizeThread(body?.clientId);

      if (!clientId) {
        writeJson(response, 400, { ok: false, error: "clientId must be a non-empty string." }, origin);

        return;
      }

      const removed = releaseClient(clientId);
      writeJson(response, 200, { ok: true, clientId, removed }, origin);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      writeJson(response, 400, { ok: false, error }, origin);
    }

    return;
  }

  if (request.method === "POST" && request.url === "/shutdown") {
    if (originHeaderPresent) {
      writeJson(response, 403, { ok: false, error: "Bridge shutdown is local-process-only." }, origin);

      return;
    }

    response.setHeader("Connection", "close");
    response.once("finish", () => {
      void shutdownBridge();
    });
    writeJson(response, 200, { ok: true }, origin);

    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, {
      ok: true,
      bridge: BRIDGE_IDENTITY,
      clients: browserClients.size,
      ...threadPayload(),
    }, origin);

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

    await reconcileDelivery(delivery).catch(() => undefined);
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

      await refreshDiscoveredThreads();

      if (!loadedThreadIds.has(thread)) {
        writeJson(response, 409, {
          ok: false,
          error: `Codex thread is not loaded: ${thread}`,
        }, origin);

        return;
      }

      const existing = deliveries.get(deliveryId);

      if (existing) {
        await reconcileDelivery(existing).catch(() => undefined);
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

      const delivery = {
        id: deliveryId,
        thread,
        message,
        messageHash: hashMessage(message),
        transport: "codex-queue",
        status: "queued",
        turnId: null,
        queuedSubmissionId: lookup.submission.id,
        dispatch: "persisted",
        dispatchError: null,
        createdAt: now,
        updatedAt: now,
      };

      deliveries.set(delivery.id, delivery);
      delivery.dispatch = "persisted";
      delivery.updatedAt = Date.now();
      await persistDeliveryState();

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
    const payload = await listThreadSummaries(scopeThread, limit);
    writeJson(response, 200, { ok: true, ...payload }, origin);

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

      await refreshDiscoveredThreads();

      if (!loadedThreadIds.has(thread)) {
        writeJson(response, 409, {
          ok: false,
          error: `Codex thread is not loaded: ${thread}`,
        }, origin);

        return;
      }

      activeThread = thread;
      writeJson(response, 200, { ok: true, ...threadPayload() }, origin);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      writeJson(response, 502, { ok: false, error }, origin);
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

    if (!message) {
      writeJson(response, 400, { ok: false, error: "message must be a non-empty string." }, origin);

      return;
    }

    await refreshDiscoveredThreads();
    const thread = requestedThread ?? activeThread;

    if (!thread) {
      writeJson(response, 409, {
        ok: false,
        error: "No loaded Codex thread is available. Open a Codex thread and retry.",
      }, origin);

      return;
    }

    if (!loadedThreadIds.has(thread)) {
      writeJson(response, 409, {
        ok: false,
        error: `Codex thread is not loaded: ${thread}`,
      }, origin);

      return;
    }

    const delivery = createDelivery(thread, message);
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

    successfulSends += 1;
    writeJson(response, 200, {
      ok: true,
      thread,
      output,
      delivery: "queued",
      ...publicDelivery(delivery),
    }, origin);

    if (values.once && successfulSends >= 1) setImmediate(() => void shutdownBridge());
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
  console.log("Codex threads are discovered from the shared local app-server daemon.");
  console.log(`BRIDGE_URL=${url}`);

  clientLeaseTimer = setInterval(pruneExpiredClients, CLIENT_LEASE_POLL_MS);
  clientLeaseTimer.unref?.();

  startupShutdownTimer = setTimeout(() => {
    startupShutdownTimer = null;

    if (!hasEverClient && browserClients.size === 0) void shutdownBridge();
  }, STARTUP_CLIENT_GRACE_MS);
  startupShutdownTimer.unref?.();

  void refreshDiscoveredThreads().catch(() => undefined);
});

async function shutdownBridge() {
  if (shutdownStarted) return;

  shutdownStarted = true;
  cancelIdleShutdown();

  if (clientLeaseTimer) {
    clearInterval(clientLeaseTimer);
    clientLeaseTimer = null;
  }

  if (startupShutdownTimer) {
    clearTimeout(startupShutdownTimer);
    startupShutdownTimer = null;
  }

  const children = [...ownedChildren];

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  }

  const closeServer = new Promise((resolve) => {
    if (!server?.listening) {
      resolve();

      return;
    }

    server.close(() => resolve());
    server.closeAllConnections?.();
  });

  const childExit = Promise.allSettled(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();

      return;
    }

    child.once("close", resolve);
    child.once("error", resolve);
  })));

  await Promise.race([
    Promise.all([closeServer, childExit]),
    new Promise((resolve) => setTimeout(resolve, OWNED_CHILD_SHUTDOWN_GRACE_MS)),
  ]);

  for (const child of ownedChildren) {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
  }

  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdownBridge();
});

process.on("SIGTERM", () => {
  void shutdownBridge();
});
