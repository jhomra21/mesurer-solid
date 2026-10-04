import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import {
  desktopSessionFromEnvironment,
  openDesktopThread,
  queueDesktopThread,
} from "./desktop.mjs";

const APP_SERVER_TIMEOUT_MS = 10_000;

const DAEMON_START_TIMEOUT_MS = 10_000;

const MAX_DISCOVERED_THREADS = 10;

const TURN_HISTORY_LIMIT = 100;

const DELIVERY_TTL_MS = 24 * 60 * 60_000;

const TERMINAL_DELIVERY_TTL_MS = 10 * 60_000;

const DELIVERY_TURN_START_SKEW_MS = 5_000;

const MAX_DELIVERIES = 100;

const deliveries = new Map();

const leases = new Map();

let deliveryStateLoadPromise = null;

let loadedDeliveryStatePath = null;

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

const bridgeClientId = (options) => normalizeString(options.clientId) ?? "direct";

const requireLease = (request, options) => {
  const leaseId = normalizeString(request.leaseId);

  if (!leaseId) throw new Error("Codex Bridge request requires an active lease.");

  const lease = leases.get(leaseId);

  if (!lease || lease.clientId !== bridgeClientId(options)) {
    throw new Error("Codex Bridge lease is not active for this host client.");
  }

  return lease;
};

const releaseCodexBridgeClient = (clientId) => {
  const normalized = normalizeString(clientId);

  if (!normalized) return 0;
  let released = 0;

  for (const [leaseId, lease] of leases) {
    if (lease.clientId !== normalized) continue;
    leases.delete(leaseId);
    released += 1;
  }

  return released;
};

const shortThread = (thread) => thread.length > 16
  ? `${thread.slice(0, 8)}…${thread.slice(-4)}`
  : thread;

const codexHome = (options) =>
  options.codexHome?.trim()
  || process.env.CODEX_HOME?.trim()
  || join(homedir(), ".codex");

const explicitCodexBin = (options) => options.codex?.trim() || null;

const environmentCodexBin = () => process.env.CODEX_BIN?.trim() || null;

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

const resolvePathCommand = async (command) => {
  const pathValue = process.env.PATH?.trim();

  if (!pathValue) return null;

  const executableNames = process.platform === "win32"
    ? command.endsWith(".exe") || command.endsWith(".com")
      ? [command]
      : [`${command}.exe`, `${command}.com`]
    : [command];

  for (const directory of pathValue.split(delimiter)) {
    const root = directory.trim().replace(/^"(.*)"$/, "$1");

    if (!root) continue;

    for (const executable of executableNames) {
      const candidate = join(root, executable);

      if (!(await canExecute(candidate))) continue;

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

  if (value.includes("/microsoft/windowsapps/codex.exe")) return true;

  return value.includes("/windowsapps/")
    && (value.includes("openai.codex") || value.includes("chatgpt"));
};

const installedDesktopCodexBins = () => {
  if (process.platform === "darwin") {
    return [
      "/Applications/Codex.app/Contents/Resources/codex",
      "/Applications/ChatGPT.app/Contents/Resources/codex",
      join(homedir(), "Applications", "Codex.app", "Contents", "Resources", "codex"),
      join(homedir(), "Applications", "ChatGPT.app", "Contents", "Resources", "codex"),
    ];
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA?.trim();

    return localAppData
      ? [join(localAppData, "Microsoft", "WindowsApps", "codex.exe")]
      : [];
  }

  return [];
};

const publicRuntime = (source, transport, available, reason = null) => ({
  source,
  transport,
  available,
  reason,
});

const resolveCommand = async (command) => {
  if (!command) return null;

  if (command.includes("/") || command.includes("\\")) {
    return realpath(command).catch(() => command);
  }

  return resolvePathCommand(command);
};

const bootstrapRuntime = async (options) => {
  const explicit = await resolveCommand(explicitCodexBin(options));

  if (explicit && await canExecute(explicit)) {
    if (desktopBundledCodex(explicit)) {
      return {
        ...publicRuntime("desktop", "private-stdio", false, "desktop-private-transport"),
        command: explicit,
      };
    }

    return {
      ...publicRuntime("standalone", "shared-app-server", true),
      command: explicit,
    };
  }

  for (const candidate of packagedCodexBins(options)) {
    if (await canExecute(candidate)) {
      return {
        ...publicRuntime("standalone", "shared-app-server", true),
        command: candidate,
      };
    }
  }

  const environment = await resolveCommand(environmentCodexBin());

  if (environment) {
    if (desktopBundledCodex(environment)) {
      return {
        ...publicRuntime("desktop", "private-stdio", false, "desktop-private-transport"),
        command: environment,
      };
    }

    return {
      ...publicRuntime("standalone", "shared-app-server", true),
      command: environment,
    };
  }

  const fromPath = await resolvePathCommand("codex");

  if (fromPath) {
    if (desktopBundledCodex(fromPath)) {
      return {
        ...publicRuntime("desktop", "private-stdio", false, "desktop-private-transport"),
        command: fromPath,
      };
    }

    return {
      ...publicRuntime("standalone", "shared-app-server", true),
      command: fromPath,
    };
  }

  for (const candidate of installedDesktopCodexBins()) {
    if (await canExecute(candidate)) {
      return {
        ...publicRuntime("desktop", "private-stdio", false, "desktop-private-transport"),
        command: candidate,
      };
    }
  }

  return {
    ...publicRuntime("none", "none", false, "runtime-not-found"),
    command: null,
  };
};

const sharedSocketAvailable = (options) => new Promise((resolve) => {
  const socket = createConnection(controlSocketPath(options));
  let settled = false;

  const finish = (available) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    resolve(available);
  };

  const timeout = setTimeout(() => finish(false), 250);

  socket.once("connect", () => {
    clearTimeout(timeout);
    finish(true);
  });
  socket.once("error", () => {
    clearTimeout(timeout);
    finish(false);
  });
});

const desktopTransport = async (options) => {
  const session = desktopSessionFromEnvironment();

  if (!session) return null;

  const runtime = await bootstrapRuntime(options);

  if (!runtime.command) return null;

  return {
    session,
    command: runtime.command,
  };
};

const inspectRuntime = async (options) => {
  if (await desktopTransport(options)) {
    return publicRuntime("desktop", "desktop-queue", true);
  }

  if (await sharedSocketAvailable(options)) {
    return publicRuntime("shared", "shared-app-server", true);
  }

  const runtime = await bootstrapRuntime(options);

  return publicRuntime(
    runtime.source,
    runtime.transport,
    runtime.available,
    runtime.reason,
  );
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
  const runtime = await bootstrapRuntime(options);

  const command = runtime.available && runtime.source === "standalone"
    ? runtime.command
    : null;

  if (!command) {
    if (runtime.source === "desktop") {
      throw new Error(
        "Codex shared app-server is not running. Codex Desktop is installed, but its private app-server is not exposed through the shared local socket.",
      );
    }

    throw new Error(
      "Codex shared app-server is not running. Mesurer found no standalone Codex installation that can start it.",
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
  clientUserMessageId: delivery.clientUserMessageId,
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
  clientUserMessageId: delivery.clientUserMessageId,
  transport: delivery.transport,
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
        clientUserMessageId: normalizeString(value?.clientUserMessageId),
        transport: value?.transport === "desktop-queue" ? "desktop-queue" : "shared-app-server",
        dispatch: value?.transport === "desktop-queue"
          ? normalizeString(value?.dispatch) ?? "persisted"
          : "persisted",
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
  const path = deliveryStatePath(options);

  if (loadedDeliveryStatePath !== path) {
    deliveries.clear();
    deliveryStateLoadPromise = null;
    loadedDeliveryStatePath = path;
  }

  if (!deliveryStateLoadPromise) {
    deliveryStateLoadPromise = loadDeliveries(options).catch((cause) => {
      deliveryStateLoadPromise = null;
      throw cause;
    });
  }

  return deliveryStateLoadPromise;
};

const hashMessage = (message) => createHash("sha256").update(message).digest("hex");

const turnUserMessageEntries = (turn) => {
  if (!Array.isArray(turn?.items)) return [];

  return turn.items.flatMap((item) => {
    if (item?.type !== "userMessage" || !Array.isArray(item.content)) return [];

    const message = item.content
      .filter((input) => input?.type === "text")
      .map((input) => String(input.text ?? ""))
      .join("\n")
      .trim();

    if (!message) return [];

    return [{
      message,
      clientUserMessageId: normalizeString(item.clientId),
    }];
  });
};

const turnUserMessages = (turn) =>
  turnUserMessageEntries(turn).map((entry) => entry.message);

const deliveryStateFromTurn = (turn) => {
  const turnId = normalizeString(turn?.id);
  const ended = turn?.completedAt != null && Number.isFinite(Number(turn.completedAt));
  let status = null;

  if (turn?.status === "inProgress") status = "working";

  if (turn?.status === "interrupted" && !ended) status = "working";

  if (turn?.status === "completed") status = "completed";

  if ((turn?.status === "interrupted" && ended) || turn?.status === "failed") {
    status = "interrupted";
  }

  if (!turnId || !status) return null;

  return {
    turnId,
    status,
    dispatchError: turn?.status === "failed"
      ? normalizeString(turn?.error?.message) ?? "Codex turn failed."
      : null,
    createdAt: Number.isFinite(Number(turn?.startedAt))
      ? Number(turn.startedAt) * 1_000
      : null,
    updatedAt: Number.isFinite(Number(turn?.completedAt))
      ? Number(turn.completedAt) * 1_000
      : null,
  };
};

const historicalDeliveryMatch = (turns, identity) => {
  const expectedClientId = normalizeString(identity?.clientUserMessageId);
  const expectedMessage = normalizeString(identity?.message);

  if (!expectedClientId && !expectedMessage) return null;
  const expectedHash = expectedMessage ? hashMessage(expectedMessage) : null;
  const matches = [];

  for (const turn of turns) {
    for (const entry of turnUserMessageEntries(turn)) {
      if (expectedClientId && entry.clientUserMessageId !== expectedClientId) continue;

      if (expectedHash && hashMessage(entry.message) !== expectedHash) continue;

      matches.push({ turn, entry });
    }
  }

  if (matches.length !== 1) return null;
  const state = deliveryStateFromTurn(matches[0].turn);

  return state ? { ...matches[0], state } : null;
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
  if (delivery.status === "completed" || delivery.transport === "desktop-queue") return;

  const turns = await readTurnHistory(delivery.thread, options);
  const turn = matchingTurn(delivery, turns);

  if (!turn) return;

  const state = deliveryStateFromTurn(turn);

  if (!state) return;

  const changed = delivery.turnId !== state.turnId
    || delivery.status !== state.status
    || (state.dispatchError && delivery.dispatchError !== state.dispatchError);

  if (!changed) return;

  delivery.turnId = state.turnId;
  delivery.status = state.status;

  if (state.dispatchError) delivery.dispatchError = state.dispatchError;

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

const desktopHealth = (desktop) => ({
  ok: true,
  thread: desktop.session.thread,
  threads: [desktop.session.thread],
  runtime: publicRuntime("desktop", "desktop-queue", true),
});

const desktopThreadList = (desktop) => ({
  ok: true,
  thread: desktop.session.thread,
  threadDetails: [{
    id: desktop.session.thread,
    title: "Current Codex Desktop thread",
    updatedAt: null,
    connected: true,
  }],
  hasMore: false,
});

const validateDesktopThread = (thread, desktop) => {
  if (thread !== desktop.session.thread) {
    throw new Error(`Codex Desktop thread is not available to this Mesurer host: ${thread}`);
  }

  return [desktop.session.thread];
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
    runtime: publicRuntime("shared", "shared-app-server", true),
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

  const clientUserMessageId = randomUUID();

  const result = await daemonRequest(
    "thread/queue/add",
    {
      threadId: thread,
      input: [{
        type: "text",
        text: message,
        textElements: [],
      }],
      clientUserMessageId,
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
    clientUserMessageId,
    transport: "shared-app-server",
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

const queueDesktopMessage = async (request, desktop, options) => {
  const message = normalizeString(request.message);
  const requestedThread = normalizeString(request.thread);
  const thread = requestedThread ?? desktop.session.thread;

  if (!message) throw new Error("message must be a non-empty string.");

  validateDesktopThread(thread, desktop);

  const queued = await queueDesktopThread({
    command: desktop.command,
    thread,
    message,
    env: codexEnv(options),
  });

  let dispatch = "desktop-wake-failed";
  let dispatchError = null;

  try {
    await openDesktopThread({
      thread,
      env: codexEnv(options),
    });
    dispatch = "desktop-opened";
  } catch (cause) {
    dispatchError = cause instanceof Error ? cause.message : String(cause);
  }

  const now = Date.now();

  const delivery = {
    id: randomUUID(),
    thread,
    message,
    messageHash: hashMessage(message),
    status: "queued",
    turnId: null,
    queuedSubmissionId: queued.queuedSubmissionId,
    clientUserMessageId: null,
    transport: "desktop-queue",
    dispatch,
    dispatchError,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const lookup = await queueLookup(thread, queued.queuedSubmissionId, options);

    if (lookup.submission) {
      delivery.clientUserMessageId = normalizeString(lookup.submission.clientUserMessageId);
    }
  } catch {
    // Desktop queue delivery already succeeded; identity enrichment is best-effort.
  }

  if (!delivery.clientUserMessageId) {
    try {
      const turns = await readTurnHistory(thread, options);
      const historical = historicalDeliveryMatch(turns, { message });

      if (historical) {
        delivery.clientUserMessageId = historical.entry.clientUserMessageId;
        delivery.turnId = historical.state.turnId;
        delivery.status = historical.state.status;

        if (historical.state.dispatchError) {
          delivery.dispatchError = historical.state.dispatchError;
        }
      }
    } catch {
      // The durable queue receipt remains valid even if history is not reachable yet.
    }
  }

  pruneDeliveries();
  deliveries.set(delivery.id, delivery);
  await persistDeliveries(options);

  return {
    ok: true,
    thread,
    output: queued.output,
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

const restoreDelivery = async (request, options, desktop = null) => {
  const deliveryId = normalizeString(request.deliveryId);
  const thread = normalizeString(request.thread);
  const queuedSubmissionId = normalizeString(request.queuedSubmissionId);
  const clientUserMessageId = normalizeString(request.clientUserMessageId);
  const recoveryMessage = normalizeString(request.message);

  if (!deliveryId || !thread) {
    throw new Error("deliveryId and thread are required.");
  }

  const existing = deliveries.get(deliveryId);

  if (existing) {
    if (existing.thread !== thread) {
      throw new Error(`Codex delivery ${deliveryId} belongs to a different thread.`);
    }

    if (clientUserMessageId && existing.clientUserMessageId
      && clientUserMessageId !== existing.clientUserMessageId) {
      throw new Error("Codex delivery client-message identity does not match the persisted delivery.");
    }

    if (clientUserMessageId && !existing.clientUserMessageId) {
      existing.clientUserMessageId = clientUserMessageId;
      await persistDeliveries(options);
    }

    await reconcileDelivery(existing, options).catch(() => undefined);

    return {
      ok: true,
      restored: false,
      ...publicDelivery(existing),
    };
  }

  if (desktop) validateDesktopThread(thread, desktop);
  else await validateLoadedThread(thread, options);

  let lookup = { submission: null, ambiguous: false };

  try {
    lookup = await queueLookup(thread, queuedSubmissionId, options);
  } catch (cause) {
    if (!desktop) throw cause;
  }

  if (lookup.submission) {
    const message = queuedMessage(lookup.submission);
    const queuedClientUserMessageId = normalizeString(lookup.submission.clientUserMessageId);

    if (!message) {
      throw new Error("The queued Codex submission is not a single text message and cannot be restored safely.");
    }

    if (clientUserMessageId && queuedClientUserMessageId
      && clientUserMessageId !== queuedClientUserMessageId) {
      throw new Error("Codex queued submission client-message identity does not match Mesurer state.");
    }

    if (recoveryMessage && hashMessage(recoveryMessage) !== hashMessage(message)) {
      throw new Error("Codex queued submission text does not match the saved Mesurer feedback.");
    }

    const now = Date.now();

    const delivery = {
      id: deliveryId,
      thread,
      message,
      messageHash: hashMessage(message),
      status: "queued",
      turnId: null,
      queuedSubmissionId: normalizeString(lookup.submission.id) ?? queuedSubmissionId,
      clientUserMessageId: queuedClientUserMessageId ?? clientUserMessageId,
      transport: desktop ? "desktop-queue" : "shared-app-server",
      dispatch: desktop ? "desktop-opened" : "persisted",
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
  }

  if (lookup.ambiguous) {
    throw new Error(
      "Multiple queued Codex submissions exist for this thread; an exact queuedSubmissionId is required to restore the delivery safely.",
    );
  }

  let turns;

  try {
    turns = await readTurnHistory(thread, options);
  } catch (cause) {
    if (desktop) {
      throw new Error(
        "Codex Desktop delivery state is unavailable and turn history could not be read safely.",
        { cause },
      );
    }

    throw cause;
  }

  const historical = historicalDeliveryMatch(turns, {
    clientUserMessageId,
    message: recoveryMessage,
  });

  if (!historical) {
    if (queuedSubmissionId) {
      throw new Error(
        `Codex queued submission is not available and no unique matching turn exists in history: ${queuedSubmissionId}`,
      );
    }

    throw new Error("No queued Codex submission or unique matching turn is available to restore for this thread.");
  }

  const now = Date.now();

  const delivery = {
    id: deliveryId,
    thread,
    message: historical.entry.message,
    messageHash: hashMessage(historical.entry.message),
    status: historical.state.status,
    turnId: historical.state.turnId,
    queuedSubmissionId,
    clientUserMessageId: historical.entry.clientUserMessageId ?? clientUserMessageId,
    transport: desktop ? "desktop-queue" : "shared-app-server",
    dispatch: desktop ? "desktop-opened" : "persisted",
    dispatchError: historical.state.dispatchError,
    createdAt: historical.state.createdAt ?? now,
    updatedAt: historical.state.updatedAt ?? now,
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

const activateBridge = async (request, options) => {
  const desktop = await desktopTransport(options);

  await ensureDeliveriesLoaded(options);

  const ready = desktop
    ? desktopHealth(desktop)
    : await health(normalizeString(request.thread), options);

  const leaseId = randomUUID();

  leases.set(leaseId, {
    clientId: bridgeClientId(options),
    createdAt: Date.now(),
  });

  return {
    ...ready,
    leaseId,
  };
};

const deactivateBridge = (request, options) => {
  requireLease(request, options);
  const leaseId = normalizeString(request.leaseId);

  leases.delete(leaseId);

  return {
    ok: true,
    leaseId,
    released: true,
  };
};

export const MESURER_CODEX_BRIDGE_CHANNEL = "mesurer:codex-bridge";

/**
 * Install Mesurer's Codex IPC handler in an Electron main process.
 *
 * The adapter binds native leases to the invoking WebContents, rejects subframe
 * callers, supports an application-owned sender validator, and releases every
 * lease when that renderer navigates, exits, or is destroyed.
 */
export function installMesurerCodexHost(options = {}) {
  const ipcMain = options.ipcMain;

  if (!ipcMain?.handle || !ipcMain?.removeHandler) {
    throw new Error("installMesurerCodexHost requires Electron ipcMain.");
  }

  if (!(options.validateSender instanceof Function)) {
    throw new Error("installMesurerCodexHost requires validateSender(event).");
  }

  const channel = normalizeString(options.channel) ?? MESURER_CODEX_BRIDGE_CHANNEL;
  const clients = new Map();

  const releaseSender = (clientId) => {
    const record = clients.get(clientId);

    if (!record) return;
    clients.delete(clientId);
    releaseCodexBridgeClient(clientId);

    record.sender.removeListener?.("did-navigate", record.release);
    record.sender.removeListener?.("render-process-gone", record.release);
    record.sender.removeListener?.("destroyed", record.release);
  };

  const bindSender = (sender) => {
    const clientId = String(sender.id);

    if (clients.has(clientId)) return clientId;

    const release = () => releaseSender(clientId);

    clients.set(clientId, { sender, release });
    sender.on?.("did-navigate", release);
    sender.on?.("render-process-gone", release);
    sender.on?.("destroyed", release);

    return clientId;
  };

  ipcMain.handle(channel, async (event, request) => {
    if (event?.senderFrame?.parent) {
      throw new Error("Mesurer Codex host requests are only accepted from the main frame.");
    }

    if (!await options.validateSender(event)) {
      throw new Error("Mesurer Codex host rejected the invoking renderer.");
    }

    const sender = event?.sender;

    if (!sender || !Number.isFinite(sender.id)) {
      throw new Error("Mesurer Codex host could not identify the invoking renderer.");
    }

    const clientId = bindSender(sender);

    return codexBridge(request, {
      codex: options.codex,
      codexHome: options.codexHome,
      clientId,
    });
  });

  return {
    channel,
    dispose() {
      ipcMain.removeHandler(channel);

      for (const clientId of clients.keys()) releaseSender(clientId);
    },
  };
}

/**
 * Native Codex transport for Mesurer's Codex plugin.
 *
 * This helper runs inside the host process. It does not open a server or start a
 * second Electron process. Requests are relayed to Codex's shared local
 * app-server. When the host inherits ownership from a Codex Desktop thread,
 * delivery uses Codex's durable queue command and wakes that exact thread with
 * the native codex:// deep link. The Desktop private app-tools pipe is never opened.
 */
export async function codexBridge(request, options = {}) {
  if (request?.constructor !== Object) {
    throw new Error("Codex Bridge request must be an object.");
  }

  const action = normalizeString(request.action);

  if (action === "runtime") {
    return {
      ok: true,
      runtime: await inspectRuntime(options),
    };
  }

  if (action === "activate") return activateBridge(request, options);

  if (action === "deactivate") return deactivateBridge(request, options);

  requireLease(request, options);

  const desktop = await desktopTransport(options);

  await ensureDeliveriesLoaded(options);

  if (action === "health") {
    return desktop
      ? desktopHealth(desktop)
      : health(normalizeString(request.thread), options);
  }

  if (action === "threads") {
    return desktop ? desktopThreadList(desktop) : listThreads(request, options);
  }

  if (action === "target") {
    const thread = normalizeString(request.thread);

    if (!thread) throw new Error("thread must be a non-empty string.");

    const threads = desktop
      ? validateDesktopThread(thread, desktop)
      : await validateLoadedThread(thread, options);

    return {
      ok: true,
      thread,
      threads,
    };
  }

  if (action === "queue") {
    return desktop
      ? queueDesktopMessage(request, desktop, options)
      : queueMessage(request, options);
  }

  if (action === "delivery") {
    return readDelivery(request, options);
  }

  if (action === "restore") {
    return restoreDelivery(request, options, desktop);
  }

  throw new Error(`Unsupported Codex Bridge action: ${action ?? "<missing>"}`);
}
