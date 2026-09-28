import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const bridgePath = process.env.MESURER_CODEX_BRIDGE_PATH?.trim();

const artifactDir = process.env.MESURER_CODEX_RUNTIME_ARTIFACT_DIR?.trim()
  || join(process.cwd(), "codex-runtime-artifacts");

if (!bridgePath) {
  throw new Error("MESURER_CODEX_BRIDGE_PATH must point at the packed Codex Bridge module.");
}

const { codexBridge } = await import(pathToFileURL(bridgePath).href);

const root = await mkdtemp(join(tmpdir(), "mesurer-codex-runtime-"));

const originalPath = process.env.PATH;

const originalCodexBin = process.env.CODEX_BIN;

const originalCodexHome = process.env.CODEX_HOME;

const originalHelper = process.env.MESURER_CODEX_SMOKE_HELPER;

const originalThreadId = process.env.CODEX_THREAD_ID;

const originalAppToolsPipe = process.env.CODEX_APP_TOOLS_PIPE_PATH;

const originalDesktopOpenBin = process.env.MESURER_CODEX_DESKTOP_OPEN_BIN;

const result = {
  bridgePath,
  desktop: {
    bundledExecutableRan: null,
    rejectedPrivateRuntime: false,
    runtime: null,
    error: null,
    inheritedSession: {
      runtime: null,
      health: null,
      threads: null,
      queue: null,
      queuedExecutableArgs: null,
      openedUrl: null,
    },
  },
  standalone: {
    packagedExecutableRan: false,
    runtimeBeforeStart: null,
    runtimeAfterStart: null,
    healthOk: false,
    threads: null,
  },
};

const restoreEnvironment = () => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;

  if (originalCodexBin === undefined) delete process.env.CODEX_BIN;
  else process.env.CODEX_BIN = originalCodexBin;

  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;

  if (originalHelper === undefined) delete process.env.MESURER_CODEX_SMOKE_HELPER;
  else process.env.MESURER_CODEX_SMOKE_HELPER = originalHelper;

  if (originalThreadId === undefined) delete process.env.CODEX_THREAD_ID;
  else process.env.CODEX_THREAD_ID = originalThreadId;

  if (originalAppToolsPipe === undefined) delete process.env.CODEX_APP_TOOLS_PIPE_PATH;
  else process.env.CODEX_APP_TOOLS_PIPE_PATH = originalAppToolsPipe;

  if (originalDesktopOpenBin === undefined) delete process.env.MESURER_CODEX_DESKTOP_OPEN_BIN;
  else process.env.MESURER_CODEX_DESKTOP_OPEN_BIN = originalDesktopOpenBin;
};

try {
  const desktopHome = join(root, "desktop-home");
  const desktopBinDir = join(root, "ChatGPT.app", "Contents", "Resources");
  const desktopBin = join(desktopBinDir, "codex");
  const desktopMarker = join(root, "desktop-executed.txt");
  const desktopOpenBin = join(root, "desktop-open");
  const desktopOpenMarker = join(root, "desktop-opened.txt");

  await mkdir(desktopBinDir, { recursive: true });
  await writeFile(
    desktopBin,
    `#!/bin/sh
printf '%s\\n' "$@" > "${desktopMarker}"
if [ "$1" = "queue" ] && [ "$2" = "--thread" ] && [ "$3" = "desktop-thread-1" ] && [ "$4" = "--message" ]; then
  printf '%s\\n' "Queued message desktop-submission-1 for thread desktop-thread-1."
  exit 0
fi
exit 2
`,
    "utf8",
  );
  await writeFile(
    desktopOpenBin,
    `#!/bin/sh
printf '%s\\n' "$1" > "${desktopOpenMarker}"
`,
    "utf8",
  );
  await chmod(desktopBin, 0o755);
  await chmod(desktopOpenBin, 0o755);

  process.env.PATH = desktopBinDir;
  process.env.CODEX_HOME = desktopHome;
  delete process.env.CODEX_BIN;

  const desktopRuntime = await codexBridge(
    { action: "runtime" },
    { codexHome: desktopHome },
  );

  assert.deepEqual(desktopRuntime.runtime, {
    source: "desktop",
    transport: "private-stdio",
    available: false,
    reason: "desktop-private-transport",
  });
  result.desktop.runtime = desktopRuntime.runtime;

  try {
    await codexBridge({ action: "health" }, { codexHome: desktopHome });
    throw new Error("Codex Bridge unexpectedly accepted a private Desktop runtime.");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);

    result.desktop.error = message;
    result.desktop.rejectedPrivateRuntime = message.includes("private app-server");

    if (!result.desktop.rejectedPrivateRuntime) throw cause;
  }

  result.desktop.bundledExecutableRan = await readFile(desktopMarker, "utf8")
    .then(() => true)
    .catch(() => false);

  assert.equal(result.desktop.bundledExecutableRan, false);

  process.env.CODEX_THREAD_ID = "desktop-thread-1";
  process.env.CODEX_APP_TOOLS_PIPE_PATH = join(root, "desktop-app-tools.sock");
  process.env.MESURER_CODEX_DESKTOP_OPEN_BIN = desktopOpenBin;

  const inheritedRuntime = await codexBridge(
    { action: "runtime" },
    { codexHome: desktopHome },
  );

  assert.deepEqual(inheritedRuntime.runtime, {
    source: "desktop",
    transport: "desktop-queue",
    available: true,
    reason: null,
  });
  result.desktop.inheritedSession.runtime = inheritedRuntime.runtime;

  const inheritedHealth = await codexBridge(
    { action: "health" },
    { codexHome: desktopHome },
  );

  assert.equal(inheritedHealth.ok, true);
  assert.equal(inheritedHealth.thread, "desktop-thread-1");
  assert.deepEqual(inheritedHealth.threads, ["desktop-thread-1"]);
  result.desktop.inheritedSession.health = inheritedHealth;

  const inheritedThreads = await codexBridge(
    { action: "threads", limit: 5 },
    { codexHome: desktopHome },
  );

  assert.equal(inheritedThreads.thread, "desktop-thread-1");
  assert.equal(inheritedThreads.threadDetails?.length, 1);
  assert.equal(inheritedThreads.threadDetails?.[0]?.id, "desktop-thread-1");
  result.desktop.inheritedSession.threads = inheritedThreads;

  const inheritedQueue = await codexBridge(
    {
      action: "queue",
      thread: "desktop-thread-1",
      message: "Desktop feedback",
    },
    { codexHome: desktopHome },
  );

  assert.equal(inheritedQueue.ok, true);
  assert.equal(inheritedQueue.thread, "desktop-thread-1");
  assert.equal(inheritedQueue.queuedSubmissionId, "desktop-submission-1");
  assert.equal(inheritedQueue.dispatch, "desktop-opened");
  assert.equal(inheritedQueue.status, "queued");
  result.desktop.inheritedSession.queue = inheritedQueue;

  const delivery = await codexBridge(
    { action: "delivery", deliveryId: inheritedQueue.deliveryId },
    { codexHome: desktopHome },
  );

  assert.equal(delivery.status, "queued");
  assert.equal(delivery.dispatch, "desktop-opened");

  const queuedExecutableArgs = (await readFile(desktopMarker, "utf8"))
    .trim()
    .split("\n");
  assert.deepEqual(queuedExecutableArgs, [
    "queue",
    "--thread",
    "desktop-thread-1",
    "--message",
    "Desktop feedback",
  ]);
  result.desktop.inheritedSession.queuedExecutableArgs = queuedExecutableArgs;

  const openedUrl = (await readFile(desktopOpenMarker, "utf8")).trim();
  assert.equal(openedUrl, "codex://threads/desktop-thread-1");
  result.desktop.inheritedSession.openedUrl = openedUrl;

  delete process.env.CODEX_THREAD_ID;
  delete process.env.CODEX_APP_TOOLS_PIPE_PATH;
  delete process.env.MESURER_CODEX_DESKTOP_OPEN_BIN;

  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;

  const standaloneHome = join(root, "standalone-home");

  const standaloneBin = join(
    standaloneHome,
    "packages",
    "standalone",
    "current",
    "codex",
  );

  const standaloneMarker = join(standaloneHome, "standalone-started.json");

  const helperPath = join(root, "fake-app-server.mjs");

  await mkdir(dirname(standaloneBin), { recursive: true });
  await writeFile(
    helperPath,
    `import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

const home = process.argv[2];
const controlDir = join(home, "app-server-control");
const socketPath = join(controlDir, "app-server-control.sock");

await mkdir(controlDir, { recursive: true });
await rm(socketPath, { force: true });

let requests = 0;
const server = createServer((socket) => {
  socket.setEncoding("utf8");
  let buffer = "";

  const send = (value) => socket.write(JSON.stringify(value) + "\\n");

  socket.on("data", (chunk) => {
    buffer += chunk;

    while (true) {
      const newline = buffer.indexOf("\\n");

      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);

      if (!line) continue;
      const message = JSON.parse(line);

      if (message.method === "initialize") {
        send({ id: message.id, result: { userAgent: "fake-codex-runtime-smoke" } });
        continue;
      }

      if (message.method === "initialized") continue;

      requests += 1;

      if (message.method === "thread/loaded/list" || message.method === "thread/list") {
        send({ id: message.id, result: { data: [], nextCursor: null } });
      } else {
        send({
          id: message.id,
          error: { code: -32601, message: "unsupported method " + message.method },
        });
      }

      if (requests >= 2) {
        setTimeout(() => server.close(() => process.exit(0)), 500);
      }
    }
  });
});

server.listen(socketPath);

setTimeout(() => server.close(() => process.exit(0)), 5_000);
`,
    "utf8",
  );

  await writeFile(
    standaloneBin,
    `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

if (process.argv.slice(2).join(" ") !== "app-server daemon start") {
  process.exit(2);
}

writeFileSync(
  "${standaloneMarker}",
  JSON.stringify({ args: process.argv.slice(2), codexHome: process.env.CODEX_HOME }),
);

const child = spawn(
  process.execPath,
  [process.env.MESURER_CODEX_SMOKE_HELPER, process.env.CODEX_HOME],
  { detached: true, env: process.env, stdio: "ignore" },
);
child.unref();
`,
    "utf8",
  );
  await chmod(standaloneBin, 0o755);

  process.env.CODEX_HOME = standaloneHome;
  process.env.MESURER_CODEX_SMOKE_HELPER = helperPath;
  delete process.env.CODEX_BIN;

  const runtimeBeforeStart = await codexBridge(
    { action: "runtime" },
    { codexHome: standaloneHome },
  );

  assert.deepEqual(runtimeBeforeStart.runtime, {
    source: "standalone",
    transport: "shared-app-server",
    available: true,
    reason: null,
  });
  result.standalone.runtimeBeforeStart = runtimeBeforeStart.runtime;

  const health = await codexBridge(
    { action: "health" },
    { codexHome: standaloneHome },
  );

  const marker = JSON.parse(await readFile(standaloneMarker, "utf8"));

  assert.deepEqual(marker.args, ["app-server", "daemon", "start"]);
  assert.equal(marker.codexHome, standaloneHome);
  assert.equal(health.ok, true);
  assert.deepEqual(health.threads, []);
  assert.deepEqual(health.runtime, {
    source: "shared",
    transport: "shared-app-server",
    available: true,
    reason: null,
  });

  const runtimeAfterStart = await codexBridge(
    { action: "runtime" },
    { codexHome: standaloneHome },
  );

  assert.deepEqual(runtimeAfterStart.runtime, health.runtime);

  result.standalone.packagedExecutableRan = true;
  result.standalone.runtimeAfterStart = runtimeAfterStart.runtime;
  result.standalone.healthOk = true;
  result.standalone.threads = health.threads;

  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    join(artifactDir, "result.json"),
    `${JSON.stringify(result, null, 2)}\\n`,
    "utf8",
  );

  console.log(JSON.stringify(result, null, 2));
} finally {
  restoreEnvironment();
  await rm(root, { recursive: true, force: true });
}
