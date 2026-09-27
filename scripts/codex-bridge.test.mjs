import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { ensureMesurerCodexBridge } from "../packages/mesurer/codex/host.mjs";

const bridgeScript = new URL("../packages/mesurer/codex/codex-bridge.mjs", import.meta.url);
const origin = "http://localhost:5173";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = async () => new Promise((resolve, reject) => {
  const server = createNetServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});

const waitForLine = (stream, prefix, timeoutMs = 10_000) => new Promise((resolve, reject) => {
  let buffer = "";
  const timeout = setTimeout(() => {
    cleanup();
    reject(new Error(`Timed out waiting for ${prefix}`));
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timeout);
    stream.off("data", onData);
  };

  const onData = (chunk) => {
    buffer += chunk.toString();

    for (const line of buffer.split(/\r?\n/)) {
      if (!line.startsWith(prefix)) continue;
      cleanup();
      resolve(line.slice(prefix.length));

      return;
    }
  };

  stream.on("data", onData);
});

const waitForExit = (child, timeoutMs = 10_000) => new Promise((resolve, reject) => {
  if (child.exitCode !== null) {
    resolve(child.exitCode);

    return;
  }

  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new Error("Bridge did not exit in time."));
  }, timeoutMs);

  child.once("exit", (code) => {
    clearTimeout(timeout);
    resolve(code);
  });
});

const waitForUnavailable = async (bridgeUrl, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await fetch(`${bridgeUrl}/health`, { signal: AbortSignal.timeout(250) });
    } catch {
      return;
    }

    await sleep(50);
  }

  throw new Error(`Bridge stayed available at ${bridgeUrl}.`);
};

const post = (bridgeUrl, path, body, requestOrigin = origin) =>
  fetch(`${bridgeUrl}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
    },
    body: JSON.stringify(body),
  });

const readJsonLines = async (path) => {
  const text = await readFile(path, "utf8");

  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
};

const writeFakeCodex = async (root) => {
  const fakeCodex = join(root, "fake-codex.mjs");
  const turnsPath = join(root, "turns.json");
  const argsPath = join(root, "args.jsonl");
  await writeFile(turnsPath, "[]");
  await writeFile(argsPath, "");

  await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const appendArgs = () => appendFileSync(
  process.env.MESURER_FAKE_CODEX_ARGS,
  JSON.stringify(args) + "\\n",
);

if (args[0] === "queue") {
  appendArgs();
  const threadIndex = args.indexOf("--thread");
  const thread = threadIndex >= 0 ? args[threadIndex + 1] : "unknown";
  console.log(\`Queued message queue-\${thread} for thread \${thread}.\`);
} else if (args[0] === "app-server" && args[1] === "daemon" && args[2] === "start") {
  appendArgs();
  console.log("started");
} else if (args[0] === "stdio-to-uds") {
  appendArgs();
  process.stdin.setEncoding("utf8");
  let buffer = "";

  process.stdin.on("data", (chunk) => {
    buffer += chunk;

    while (true) {
      const newline = buffer.indexOf("\\n");

      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);

      if (!line) continue;
      const message = JSON.parse(line);

      if (message.method === "initialize") {
        write({
          id: message.id,
          result: {
            userAgent: "fake-codex",
            codexHome: process.env.CODEX_HOME,
          },
        });
        continue;
      }

      if (message.method === "initialized") continue;

      if (message.method === "thread/loaded/list") {
        write({
          id: message.id,
          result: {
            data: ["thread-a", "thread-b"],
            nextCursor: null,
          },
        });
        continue;
      }

      if (message.method === "thread/list") {
        write({
          id: message.id,
          result: {
            data: [
              {
                id: "thread-a",
                name: "Diffusion editor",
                preview: "",
                cwd: "/tmp/diffusion",
                recencyAt: 200,
                updatedAt: 200,
                status: { type: "idle" },
              },
              {
                id: "thread-b",
                name: null,
                preview: "Fix selected UI",
                cwd: "/tmp/diffusion",
                recencyAt: 190,
                updatedAt: 190,
                status: { type: "idle" },
              },
              {
                id: "thread-cold",
                name: "Old unloaded thread",
                preview: "",
                cwd: "/tmp/diffusion",
                recencyAt: 180,
                updatedAt: 180,
                status: { type: "notLoaded" },
              },
            ],
            nextCursor: null,
          },
        });
        continue;
      }

      if (message.method === "thread/read") {
        write({
          id: message.id,
          result: {
            thread: {
              id: message.params.threadId,
              name: message.params.threadId === "thread-a" ? "Diffusion editor" : "Fix selected UI",
              preview: "",
              cwd: "/tmp/diffusion",
              recencyAt: 200,
              updatedAt: 200,
              status: { type: "idle" },
              turns: JSON.parse(readFileSync(process.env.MESURER_FAKE_TURNS, "utf8")),
            },
          },
        });
        continue;
      }

      if (message.method === "thread/turns/list") {
        write({
          id: message.id,
          result: {
            data: JSON.parse(readFileSync(process.env.MESURER_FAKE_TURNS, "utf8")),
            nextCursor: null,
            backwardsCursor: null,
          },
        });
        continue;
      }

      if (message.method === "thread/queue/list") {
        write({
          id: message.id,
          result: {
            data: [],
            nextCursor: null,
          },
        });
        continue;
      }

      write({
        id: message.id,
        error: { code: -32601, message: "unsupported fake method " + message.method },
      });
    }
  });
} else {
  appendArgs();
  process.stderr.write("unexpected fake Codex invocation: " + args.join(" ") + "\\n");
  process.exit(97);
}
`);
  await chmod(fakeCodex, 0o755);

  return { fakeCodex, turnsPath, argsPath };
};

const bridgeEnv = (root, fixture) => ({
  ...process.env,
  CODEX_HOME: root,
  MESURER_FAKE_CODEX_ARGS: fixture.argsPath,
  MESURER_FAKE_TURNS: fixture.turnsPath,
});

const acquire = async (bridgeUrl, clientId) => {
  const response = await post(bridgeUrl, "clients/acquire", { clientId });
  assert.equal(response.status, 200, await response.text());

  return response.json();
};

test("Codex bridge discovers loaded daemon threads, queues to them, reconciles delivery, and exits after the last Mesurer client", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-daemon-"));
  const fixture = await writeFakeCodex(root);
  const child = spawn(process.execPath, [
    bridgeScript.pathname,
    "--port",
    "0",
    "--codex",
    fixture.fakeCodex,
  ], {
    env: bridgeEnv(root, fixture),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");
    await acquire(bridgeUrl, "client-a");
    await acquire(bridgeUrl, "client-b");

    const threadsResponse = await fetch(`${bridgeUrl}/threads?limit=10`, {
      headers: { Origin: origin },
    });

    assert.equal(threadsResponse.status, 200, stderr);
    const threads = await threadsResponse.json();
    assert.deepEqual(
      threads.threadDetails.map((thread) => ({
        id: thread.id,
        title: thread.title,
        connected: thread.connected,
      })),
      [
        { id: "thread-a", title: "Diffusion editor", connected: true },
        { id: "thread-b", title: "Fix selected UI", connected: true },
      ],
    );
    assert.equal(threads.threadDetails.some((thread) => thread.id === "thread-cold"), false);

    const unknown = await post(bridgeUrl, "send", {
      message: "do not route this",
      thread: "thread-cold",
    });

    assert.equal(unknown.status, 409);

    const send = await post(bridgeUrl, "send", {
      message: "apply this exact Mesurer feedback",
      thread: "thread-b",
    });

    assert.equal(send.status, 200, stderr);
    const queued = await send.json();
    assert.equal(queued.thread, "thread-b");
    assert.equal(queued.transport, "codex-queue");
    assert.equal(queued.status, "queued");
    assert.equal(queued.queuedSubmissionId, "queue-thread-b");
    assert.equal(queued.dispatch, "persisted");

    const nowSeconds = Math.floor(Date.now() / 1_000);
    await writeFile(fixture.turnsPath, JSON.stringify([{
      id: "turn-b",
      items: [{
        type: "userMessage",
        id: "user-turn-b",
        content: [{
          type: "text",
          text: "apply this exact Mesurer feedback",
          text_elements: [],
        }],
      }],
      itemsView: "summary",
      status: "inProgress",
      error: null,
      startedAt: nowSeconds,
      completedAt: null,
      durationMs: null,
    }]));

    const workingResponse = await fetch(`${bridgeUrl}/deliveries/${queued.deliveryId}`, {
      headers: { Origin: origin },
    });

    assert.equal(workingResponse.status, 200, stderr);
    const working = await workingResponse.json();
    assert.equal(working.status, "working");
    assert.equal(working.turnId, "turn-b");

    await writeFile(fixture.turnsPath, JSON.stringify([{
      id: "turn-b",
      items: [{
        type: "userMessage",
        id: "user-turn-b",
        content: [{
          type: "text",
          text: "apply this exact Mesurer feedback",
          text_elements: [],
        }],
      }],
      itemsView: "summary",
      status: "completed",
      error: null,
      startedAt: nowSeconds,
      completedAt: nowSeconds + 1,
      durationMs: 1_000,
    }]));

    const completedResponse = await fetch(`${bridgeUrl}/deliveries/${queued.deliveryId}`, {
      headers: { Origin: origin },
    });

    assert.equal(completedResponse.status, 200, stderr);
    assert.equal((await completedResponse.json()).status, "completed");

    const releaseA = await post(bridgeUrl, "clients/release", { clientId: "client-a" });
    assert.equal(releaseA.status, 200);

    const health = await fetch(`${bridgeUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).clients, 1);

    const releaseB = await post(bridgeUrl, "clients/release", { clientId: "client-b" });
    assert.equal(releaseB.status, 200);
    assert.equal(await waitForExit(child, 5_000), 0);

    const invocations = await readJsonLines(fixture.argsPath);
    assert.equal(invocations.some((args) =>
      args[0] === "queue"
      && args.includes("thread-b")
      && args.includes("apply this exact Mesurer feedback")), true);
    assert.equal(invocations.some((args) => args[0] === "app-server" && args[1] === "--listen"), false);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("packaged Codex host replaces a stale Mesurer bridge and reuses the current one without a marketplace install", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-host-"));
  const fixture = await writeFakeCodex(root);
  const port = await freePort();
  const bridgeUrl = `http://127.0.0.1:${port}`;

  const stale = createHttpServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        bridge: {
          name: "mesurer-codex",
          protocol: 1,
          sourceHash: "0".repeat(64),
          pid: process.pid,
          canShutdown: true,
        },
      }));

      return;
    }

    if (request.url === "/shutdown" && request.method === "POST") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      response.once("finish", () => stale.close());

      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise((resolve, reject) => {
    stale.once("error", reject);
    stale.listen(port, "127.0.0.1", resolve);
  });

  const previous = {
    CODEX_HOME: process.env.CODEX_HOME,
    MESURER_FAKE_CODEX_ARGS: process.env.MESURER_FAKE_CODEX_ARGS,
    MESURER_FAKE_TURNS: process.env.MESURER_FAKE_TURNS,
  };

  process.env.CODEX_HOME = root;
  process.env.MESURER_FAKE_CODEX_ARGS = fixture.argsPath;
  process.env.MESURER_FAKE_TURNS = fixture.turnsPath;

  try {
    const started = await ensureMesurerCodexBridge({
      bridgeUrl,
      codex: fixture.fakeCodex,
      origin,
    });

    assert.equal(started.endpoint, bridgeUrl);
    assert.equal(started.reused, false);
    assert.notEqual(started.pid, process.pid);

    await acquire(bridgeUrl, "host-client");

    const reused = await ensureMesurerCodexBridge({
      bridgeUrl,
      codex: fixture.fakeCodex,
      origin,
    });

    assert.equal(reused.reused, true);
    assert.equal(reused.pid, started.pid);

    const threads = await fetch(`${bridgeUrl}/threads?limit=10`, {
      headers: { Origin: origin },
    });

    assert.equal(threads.status, 200);
    assert.deepEqual(
      (await threads.json()).threadDetails.map((thread) => thread.id),
      ["thread-a", "thread-b"],
    );

    const release = await post(bridgeUrl, "clients/release", { clientId: "host-client" });
    assert.equal(release.status, 200);
    await waitForUnavailable(bridgeUrl);
  } finally {
    stale.close();

    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    try {
      await fetch(`${bridgeUrl}/shutdown`, { method: "POST" });
    } catch {}

    await rm(root, { recursive: true, force: true });
  }
});
