import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const APP_SERVER_TIMEOUT_MS = 10_000;

const DAEMON_START_TIMEOUT_MS = 10_000;

const MAX_DISCOVERED_THREADS = 10;

const TURN_HISTORY_LIMIT = 100;

const DELIVERY_TTL_MS = 24 * 60 * 60_000;

const TERMINAL_DELIVERY_TTL_MS = 10 * 60_000;

const DELIVERY_TURN_START_SKEW_MS = 5_000;

const MAX_DELIVERIES = 100;

const deliveries = new Map();

let deliveryStateLoadPromise = null;

const normalizeString = (value) => {
  if (value?.constructor !== String) return null;

  const text = value.trim();

  return text || null;
};

const normalizeTitle = (value) => {
  const title = normalizeString(value)?.replace(/\s+/g, " ");

  if (!title) return null;

  return title.length > 80 ? `${title.slice(0, 79)}…` : title;
};

const normalizeTimestamp = (value) => Number.isFinite(value) ? Number(value) : null;

const shortThread = (thread) => thread.length > 16
  ? `${thread.slice(0, 8)}…${thread.slice(-4)}`
  : thread;

const codexHome = (options) =>
  options.codexHome?.trim()
  || process.env.CODEX_HOME?.trim()
  || join(homedir(), ".codex");

const explicitCodexBin = (options) =>
  options.codex?.trim()
  || process.env.CODEX_BIN?.trim()
  || null;

const codexExecutableName = () => process.platform === "win32" ? "codex.exe" : "codex";

const packagedCodexBins = (options) => {
  const home = codexHome(options);
  const executable = codexExecutableName();

  return [
    join(home, "packages", "app-server-daemon", "current", "bin", executable),
    join(home, "packages", "standalone", "current", executable),
    join(home, "packages", "standalone", "current", "bin", executable),
  ];
};

const canExecute = async (path) => {
  try {
    await access(
      path,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );

    return true;
  } catch {
    return false;
  }
};

const resolvePathCodex = async () => {
  const pathValue = process.env.PATH?.trim();

  if (!pathValue) return null;

  const executableNames = process.platform === "win32"
    ? ["codex.exe", "codex.com"]
    : ["codex"];

  for (const directory of pathValue.split(delimiter)) {
    const root = directory.trim().replace(/^"(.*)"$/, "$1");

    if (!root) continue;

    for (const executable of executableNames) {
      const candidate = join(root, executable);

      if (!await canExecute(candidate)) continue;

      try {
        return await realpath(candidate);
      } catch {
        return candidate;
      }
    }
  }

  return null;
};

const desktopBundledCodex = (path) => {
  const value = path.replaceAll("\\", "/").toLowerCase();

  if (value.includes(".app/contents/resources/")) return true;

  return value.includes("/windowsapps/")
    && (value.includes("openai.codex") || value.includes("chatgpt"));
};

const daemonStartBin = async (options) => {
  const explicit = explicitCodexBin(options);

  if (explicit) return explicit;

  for (const candidate of packagedCodexBins(options)) {
    if (await canExecute(candidate)) return candidate;
  }

  const fromPath = await resolvePathCodex();

  if (!fromPath || desktopBundledCodex(fromPath)) return null;

  return fromPath;
};

const codexEnv = (options) => {
  const env = { ...process.env };
  const home = options.codexHome?.trim();

  if (home) env.CODEX_HOME = home;

  return env;
};

const controlSocketPath = (options) =>
  join(codexHome(options), "app-server-control", "app-server-control.sock");

const deliveryStatePath = (options) =>
  join(codexHome(options), "mesurer", "codex-deliveries.json");

const missingDaemonSocket = (cause) => {
  if (!(cause instanceof Error)) return false;

  return cause.code === "ENOENT"
    || cause.code === "ECONNREFUSED"
    || cause.message.includes("No such file or directory")
    || cause.message.includes("ENOENT")
    || cause.message.includes("ECONNREFUSED")
    || cause.message.includes("os error 2");
};

const spawnCommand = (
  command,
  args,
  options,
  timeoutMs,
  label,
) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    env: codexEnv(options),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  let settled = false;

  const timeout = setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGTERM");

    if (settled) return;
    settled = true;
    reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  const finish = (error, output) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);

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

    const detail = stderr.trim()
      || stdout.trim()
      || `exit code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;

    finish(new Error(`${label} failed: ${detail}`));
  });
});

const startDaemon = async (options) => {
  const command = await daemonStartBin(options);

  if (!command) {
    throw new Error(
      "Codex shared app-server is not running. Mesurer found no standalone Codex installation that can start it. Codex Desktop's private app-server is not exposed through the shared local socket.",
    );
  }

  try {
    return await spawnCommand(
      command,
      ["app-server", "daemon", "start"],
      options,
      DAEMON_START_TIMEOUT_MS,
      "Codex app-server daemon start",
    );
  } catch (cause) {
    if (
      cause instanceof Error
      && (
        cause.message.includes("no complete local package")
        || cause.message.includes("install a packaged Codex CLI")
        || cause.message.includes("standalone installer")
      )
    ) {
      throw new Error(
        "Codex shared app-server is not running. The discovered Codex executable cannot provide a standalone daemon, so Mesurer did not start another Codex server. Codex Desktop's private app-server is not exposed through the shared local socket.",
        { cause },
      );
    }

    throw cause;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const daemonRequestOnce = (
  method,
  params,
  options,
  experimentalApi = true,
) => new Promise((resolve, reject) => {
  const socket = createConnection(controlSocketPath(options));
  const requestId = `mesurer-codex-${randomUUID()}`;
  let buffer = "";
  let settled = false;

  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    socket.destroy();
    reject(new Error(`Codex app-server ${method} timed out after ${APP_SERVER_TIMEOUT_MS}ms.`));
  }, APP_SERVER_TIMEOUT_MS);

  const finish = (error, result) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    socket.destroy();

    if (error) reject(error);
    else resolve(result);
  };

  const send = (message) => {
    socket.write(`${JSON.stringify(message)}\n`);
  };

  const handleMessage = (message) => {
    if (message?.id === `${requestId}-initialize`) {
      if (message.error) {
        finish(new Error(message.error.message || "Codex app-server initialize failed."));

        return;
      }

      send({ method: "initialized" });
      send({ id: requestId, method, params });

      return;
    }

    if (message?.id !== requestId) return;

    if (message.error) {
      finish(new Error(message.error.message || `Codex app-server ${method} failed.`));

      return;
    }

    finish(null, message.result ?? {});
  };

  socket.setEncoding("utf8");
  socket.on("connect", () => {
    send({
      id: `${requestId}-initialize`,
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

  socket.on("data", (chunk) => {
    buffer += chunk;

    while (true) {
      const newline = buffer.indexOf("\n");

      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);

      if (!line) continue;

      try {
        handleMessage(JSON.parse(line));
      } catch {
        // Codex app-server uses JSONL. Ignore unrelated malformed frames defensively.
      }
    }
  });

  socket.on("error", (error) => finish(error));
  socket.on("close", () => {
    if (!settled) finish(new Error(`Codex app-server socket closed during ${method}.`));
  });
});

const daemonRequest = async (
  method,
  params = {},
  options = {},
  experimentalApi = true,
) => {
  try {
    return await daemonRequestOnce(method, params, options, experimentalApi);
  } catch (cause) {
    if (!missingDaemonSocket(cause)) throw cause;
    await startDaemon(options);
  }

  const deadline = Date.now() + DAEMON_START_TIMEOUT_MS;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return await daemonRequestOnce(method, params, options, experimentalApi);
    } catch (cause) {
      if (!missingDaemonSocket(cause)) throw cause;
      lastError = cause;
      await sleep(50);
    }
  }

  throw lastError ?? new Error("Codex app-server daemon did not become available.");
};

const loadedThreadIds = async (options) => {
  const result = await daemonRequest(
    "thread/loaded/list",
    { limit: MAX_DISCOVERED_THREADS },
    options,
  );

  return Array.isArray(result?.data)
    ? result.data.map(normalizeString).filter(Boolean)
    : [];
};

const threadSummary = (thread, loadedIds) => {
  const id = normalizeString(thread?.id);

  if (!id || !loadedIds.has(id)) return null;

  return {
    id,
    title: normalizeTitle(thread?.name)
      ?? normalizeTitle(thread?.preview)
      ?? `Codex ${shortThread(id)}`,
    updatedAt: normalizeTimestamp(thread?.recencyAt ?? thread?.updatedAt),
    connected: true,
  };
};

const listLoadedThreads = async (options) => {
  const ids = await loadedThreadIds(options);
  const loadedIds = new Set(ids);
  const byId = new Map();

  try {
    const result = await daemonRequest(
      "thread/list",
      {
        limit: Math.max(MAX_DISCOVERED_THREADS * 4, 40),
        sortKey: "recency_at",
        sortDirection: "desc",
      },
      options,
    );

    for (const thread of Array.isArray(result?.data) ? result.data : []) {
      const summary = threadSummary(thread, loadedIds);

      if (summary) byId.set(summary.id, summary);
    }
  } catch {
    // Loaded-thread discovery remains authoritative if metadata listing fails.
  }

  for (const id of ids) {
    if (byId.has(id)) continue;

    try {
      const result = await daemonRequest(
        "thread/read",
        { threadId: id, includeTurns: false },
        options,
      );

      const summary = threadSummary(result?.thread, loadedIds);

      if (summary) byId.set(id, summary);
    } catch {
      byId.set(id, {
        id,
        title: `Codex ${shortThread(id)}`,
        updatedAt: null,
        connected: true,
      });
    }
  }

  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
};

const publicDelivery = (delivery) => ({
  deliveryId: delivery.id,
  thread: delivery.thread,
  status: delivery.status,
  turnId: delivery.turnId,
  queuedSubmissionId: delivery.queuedSubmissionId,
  dispatch: delivery.dispatch,
  dispatchError: delivery.dispatchError,
  createdAt: delivery.createdAt,
  updatedAt: delivery.updatedAt,
});

const persistedDelivery = (delivery) => ({
  id: delivery.id,
  thread: delivery.thread,
  message: delivery.message,
  messageHash: delivery.messageHash,
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
    const ttl = terminal ? TERMINAL_DELIVERY_TTL_MS : DELIVERY_TTL_MS;

    if (now - delivery.updatedAt > ttl) deliveries.delete(id);
  }

  if (deliveries.size <= MAX_DELIVERIES) return;

  const oldest = [...deliveries.values()].sort((left, right) => left.updatedAt - right.updatedAt);

  for (const delivery of oldest.slice(0, deliveries.size - MAX_DELIVERIES)) {
    deliveries.delete(delivery.id);
  }
};

const persistDeliveries = async (options) => {
  pruneDeliveries();
  const path = deliveryStatePath(options);
  const directory = join(path, "..");
  const tmp = `${path}.${process.pid}.tmp`;

  const payload = {
    version: 1,
    deliveries: [...deliveries.values()].map(persistedDelivery),
  };

  await mkdir(directory, { recursive: true });
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmp, path);
};

const loadDeliveries = async (options) => {
  try {
    const raw = await readFile(deliveryStatePath(options), "utf8");
    const parsed = JSON.parse(raw);

    if (parsed?.version !== 1 || !Array.isArray(parsed.deliveries)) return;

    for (const value of parsed.deliveries) {
      const id = normalizeString(value?.id);
      const thread = normalizeString(value?.thread);
      const message = normalizeString(value?.message);
      const messageHash = normalizeString(value?.messageHash);
      const status = normalizeString(value?.status);

      if (!id || !thread || !message || !messageHash) continue;

      if (!["queued", "working", "completed", "interrupted"].includes(status)) continue;

      deliveries.set(id, {
        id,
        thread,
        message,
        messageHash,
        status,
        turnId: normalizeString(value?.turnId),
        queuedSubmissionId: normalizeString(value?.queuedSubmissionId),
        dispatch: "persisted",
        dispatchError: normalizeString(value?.dispatchError),
        createdAt: Number.isFinite(value?.createdAt) ? Number(value.createdAt) : Date.now(),
        updatedAt: Number.isFinite(value?.updatedAt) ? Number(value.updatedAt) : Date.now(),
      });
    }

    pruneDeliveries();
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
  }
};

const ensureDeliveriesLoaded = (options) => {
  if (!deliveryStateLoadPromise) {
    deliveryStateLoadPromise = loadDeliveries(options).catch((cause) => {
      deliveryStateLoadPromise = null;
      throw cause;
    });
  }

  return deliveryStateLoadPromise;
};

const hashMessage = (message) => createHash("sha256").update(message).digest("hex");

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

const readTurnHistory = async (thread, options) => {
  try {
    const result = await daemonRequest(
      "thread/turns/list",
      {
        threadId: thread,
        limit: TURN_HISTORY_LIMIT,
        sortDirection: "desc",
        itemsView: "summary",
      },
      options,
    );

    return Array.isArray(result?.data) ? result.data : [];
  } catch {
    const result = await daemonRequest(
      "thread/read",
      { threadId: thread, includeTurns: true },
      options,
    );

    return Array.isArray(result?.thread?.turns) ? result.thread.turns : [];
  }
};

const matchingTurn = (delivery, turns) => {
  if (delivery.turnId) {
    return turns.find((turn) => normalizeString(turn?.id) === delivery.turnId) ?? null;
  }

  const earliestStartedAt = delivery.createdAt - DELIVERY_TURN_START_SKEW_MS;

  const matches = turns.filter((turn) => {
    const id = normalizeString(turn?.id);
    const startedAt = Number(turn?.startedAt);

    if (!id || !Number.isFinite(startedAt) || startedAt * 1_000 < earliestStartedAt) {
      return false;
    }

    return turnUserMessages(turn).some((prompt) =>
      hashMessage(prompt) === delivery.messageHash
      || prompt.includes(delivery.message));
  });

  return matches.length === 1 ? matches[0] : null;
};

const reconcileDelivery = async (delivery, options) => {
  if (delivery.status === "completed") return;

  const turns = await readTurnHistory(delivery.thread, options);
  const turn = matchingTurn(delivery, turns);

  if (!turn) return;

  const turnId = normalizeString(turn.id);
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

  const failureMessage = normalizeString(turn?.error?.message) ?? "Codex turn failed.";

  const changed = delivery.turnId !== turnId
    || delivery.status !== nextStatus
    || (failed && delivery.dispatchError !== failureMessage);

  if (!changed) return;

  delivery.turnId = turnId;
  delivery.status = nextStatus;

  if (failed) delivery.dispatchError = failureMessage;

  delivery.updatedAt = Date.now();
  await persistDeliveries(options);
};

const queueLookup = async (thread, queuedSubmissionId, options) => {
  let cursor = null;

  while (true) {
    const params = {
      threadId: thread,
      limit: queuedSubmissionId ? 100 : 2,
    };

    if (cursor) params.cursor = cursor;

    const result = await daemonRequest("thread/queue/list", params, options);
    const data = Array.isArray(result?.data) ? result.data : [];
    const nextCursor = normalizeString(result?.nextCursor);

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

const queuedMessage = (submission) => {
  if (!Array.isArray(submission?.input) || submission.input.length !== 1) return null;

  const input = submission.input[0];
  const text = normalizeString(input?.text);

  return input?.type === "text" ? text : null;
};

const validateLoadedThread = async (thread, options) => {
  const ids = await loadedThreadIds(options);

  if (!ids.includes(thread)) {
    throw new Error(`Codex thread is not loaded: ${thread}`);
  }

  return ids;
};

const health = async (preferredThread, options) => {
  const threads = await listLoadedThreads(options);

  const ids = threads.map((thread) => thread.id);

  const thread = preferredThread && ids.includes(preferredThread)
    ? preferredThread
    : ids[0] ?? null;

  return {
    ok: true,
    thread,
    threads: ids,
  };
};

const listThreads = async (request, options) => {
  const threads = await listLoadedThreads(options);

  const limit = Number.isInteger(request.limit)
    ? Math.min(MAX_DISCOVERED_THREADS, Math.max(1, request.limit))
    : 5;

  const ids = threads.map((thread) => thread.id);

  const preferred = normalizeString(request.thread);

  const selected = preferred && ids.includes(preferred)
    ? preferred
    : ids[0] ?? null;

  const ordered = selected
    ? [
        ...threads.filter((thread) => thread.id === selected),
        ...threads.filter((thread) => thread.id !== selected),
      ]
    : threads;

  return {
    ok: true,
    thread: selected,
    threadDetails: ordered.slice(0, limit),
    hasMore: ordered.length > limit,
  };
};

const queueMessage = async (request, options) => {
  const message = normalizeString(request.message);
  let thread = normalizeString(request.thread);

  if (!message) throw new Error("message must be a non-empty string.");

  if (!thread) {
    const ids = await loadedThreadIds(options);

    if (ids.length !== 1) {
      throw new Error("Choose a Codex thread before queueing feedback.");
    }

    [thread] = ids;
  } else {
    await validateLoadedThread(thread, options);
  }

  const result = await daemonRequest(
    "thread/queue/add",
    {
      threadId: thread,
      input: [{
        type: "text",
        text: message,
        textElements: [],
      }],
      clientUserMessageId: randomUUID(),
    },
    options,
    true,
  );

  const queuedSubmissionId = normalizeString(result?.queuedSubmission?.id);

  if (!queuedSubmissionId) {
    throw new Error("Codex app-server accepted the request without a queued submission id.");
  }

  const now = Date.now();

  const delivery = {
    id: randomUUID(),
    thread,
    message,
    messageHash: hashMessage(message),
    status: "queued",
    turnId: null,
    queuedSubmissionId,
    dispatch: "persisted",
    dispatchError: null,
    createdAt: now,
    updatedAt: now,
  };

  pruneDeliveries();
  deliveries.set(delivery.id, delivery);
  await persistDeliveries(options);

  return {
    ok: true,
    thread,
    output: `Queued message ${queuedSubmissionId} for thread ${thread}.`,
    delivery: "queued",
    ...publicDelivery(delivery),
  };
};

const readDelivery = async (request, options) => {
  const deliveryId = normalizeString(request.deliveryId);

  if (!deliveryId) throw new Error("deliveryId must be a non-empty string.");

  const delivery = deliveries.get(deliveryId);

  if (!delivery) throw new Error(`Codex delivery is not available: ${deliveryId}`);

  await reconcileDelivery(delivery, options).catch(() => undefined);

  return {
    ok: true,
    ...publicDelivery(delivery),
  };
};

const restoreDelivery = async (request, options) => {
  const deliveryId = normalizeString(request.deliveryId);
  const thread = normalizeString(request.thread);
  const queuedSubmissionId = normalizeString(request.queuedSubmissionId);

  if (!deliveryId || !thread) {
    throw new Error("deliveryId and thread are required.");
  }

  await validateLoadedThread(thread, options);

  const existing = deliveries.get(deliveryId);

  if (existing) {
    await reconcileDelivery(existing, options).catch(() => undefined);

    return {
      ok: true,
      restored: false,
      ...publicDelivery(existing),
    };
  }

  const lookup = await queueLookup(thread, queuedSubmissionId, options);

  if (!lookup.submission) {
    if (lookup.ambiguous) {
      throw new Error(
        "Multiple queued Codex submissions exist for this thread; an exact queuedSubmissionId is required to restore the delivery safely.",
      );
    }

    if (queuedSubmissionId) {
      throw new Error(`Codex queued submission is not available: ${queuedSubmissionId}`);
    }

    throw new Error("No queued Codex submission is available to restore for this thread.");
  }

  const message = queuedMessage(lookup.submission);

  if (!message) {
    throw new Error("The queued Codex submission is not a single text message and cannot be restored safely.");
  }

  const now = Date.now();

  const delivery = {
    id: deliveryId,
    thread,
    message,
    messageHash: hashMessage(message),
    status: "queued",
    turnId: null,
    queuedSubmissionId: normalizeString(lookup.submission.id),
    dispatch: "persisted",
    dispatchError: null,
    createdAt: now,
    updatedAt: now,
  };

  pruneDeliveries();
  deliveries.set(delivery.id, delivery);
  await persistDeliveries(options);

  return {
    ok: true,
    restored: true,
    ...publicDelivery(delivery),
  };
};

/**
 * Native Codex transport for Mesurer's Codex plugin.
 *
 * This helper runs inside the host process. It does not open a server or start a
 * second Electron process. Requests are relayed to Codex's shared local
 * app-server, and queue delivery uses thread/queue/add on that same daemon.
 */
export async function codexBridge(request, options = {}) {
  if (request?.constructor !== Object) {
    throw new Error("Codex Bridge request must be an object.");
  }

  await ensureDeliveriesLoaded(options);

  const action = normalizeString(request.action);

  if (action === "health") {
    return health(normalizeString(request.thread), options);
  }

  if (action === "threads") {
    return listThreads(request, options);
  }

  if (action === "target") {
    const thread = normalizeString(request.thread);

    if (!thread) throw new Error("thread must be a non-empty string.");

    const threads = await validateLoadedThread(thread, options);

    return {
      ok: true,
      thread,
      threads,
    };
  }

  if (action === "queue") {
    return queueMessage(request, options);
  }

  if (action === "delivery") {
    return readDelivery(request, options);
  }

  if (action === "restore") {
    return restoreDelivery(request, options);
  }

  throw new Error(`Unsupported Codex Bridge action: ${action ?? "<missing>"}`);
}
