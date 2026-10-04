import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MESURER_CODEX_BRIDGE_CHANNEL,
  codexBridge,
  installMesurerCodexHost,
} from "./bridge.mjs";

for (const name of ["CODEX_THREAD_ID", "CODEX_APP_TOOLS_PIPE_PATH"]) {
  delete process.env[name];
}

const testTmpdir = () => process.platform === "win32" ? tmpdir() : "/tmp";

const createFakeAppServer = async (root, turnsPath) => {
  const controlDir = join(root, "app-server-control");
  const socketPath = join(controlDir, "app-server-control.sock");
  const queue = [];

  await mkdir(controlDir, { recursive: true });

  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";

    const send = (value) => socket.write(`${JSON.stringify(value)}\n`);

    socket.on("data", (chunk) => {
      buffer += chunk;

      while (true) {
        const newline = buffer.indexOf("\n");

        if (newline < 0) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);

        if (!line) continue;
        const message = JSON.parse(line);

        if (message.method === "initialize") {
          send({
            id: message.id,
            result: {
              userAgent: "fake-codex",
              codexHome: root,
            },
          });
          continue;
        }

        if (message.method === "initialized") continue;

        if (message.method === "thread/loaded/list") {
          send({
            id: message.id,
            result: {
              data: ["thread-a", "thread-b"],
              nextCursor: null,
            },
          });
          continue;
        }

        if (message.method === "thread/list") {
          send({
            id: message.id,
            result: {
              data: [
                {
                  id: "thread-a",
                  name: "Diffusion editor",
                  preview: "",
                  recencyAt: 200,
                  updatedAt: 200,
                },
                {
                  id: "thread-b",
                  name: null,
                  preview: "Fix selected UI",
                  recencyAt: 190,
                  updatedAt: 190,
                },
                {
                  id: "thread-cold",
                  name: "Old unloaded thread",
                  preview: "",
                  recencyAt: 180,
                  updatedAt: 180,
                },
              ],
              nextCursor: null,
            },
          });
          continue;
        }

        if (message.method === "thread/read") {
          send({
            id: message.id,
            result: {
              thread: {
                id: message.params.threadId,
                name: message.params.threadId === "thread-a"
                  ? "Diffusion editor"
                  : "Fix selected UI",
                preview: "",
                recencyAt: 200,
                updatedAt: 200,
                turns: JSON.parse(awaitRead(turnsPath)),
              },
            },
          });
          continue;
        }

        if (message.method === "thread/turns/list") {
          send({
            id: message.id,
            result: {
              data: JSON.parse(awaitRead(turnsPath)),
              nextCursor: null,
              backwardsCursor: null,
            },
          });
          continue;
        }

        if (message.method === "thread/queue/add") {
          const queuedSubmission = {
            id: `queue-${message.params.threadId}`,
            input: message.params.input,
            clientUserMessageId: message.params.clientUserMessageId,
          };

          queue.push(queuedSubmission);
          send({
            id: message.id,
            result: { queuedSubmission },
          });
          continue;
        }

        if (message.method === "thread/queue/list") {
          send({
            id: message.id,
            result: {
              data: queue,
              nextCursor: null,
            },
          });
          continue;
        }

        send({
          id: message.id,
          error: {
            code: -32601,
            message: `unsupported fake method ${message.method}`,
          },
        });
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });

  return {
    socketPath,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
};

const fileCache = new Map();

const awaitRead = (path) => fileCache.get(path) ?? "[]";

const writeTurns = async (path, turns) => {
  const value = JSON.stringify(turns);

  fileCache.set(path, value);
  await writeFile(path, value);
};

test("Codex Bridge uses the existing shared app-server directly", async () => {
  const root = await mkdtemp(join(testTmpdir(), "mesurer-codex-bridge-"));
  const turnsPath = join(root, "turns.json");

  await writeTurns(turnsPath, []);

  const appServer = await createFakeAppServer(root, turnsPath);

  const options = {
    codex: join(root, "must-not-run"),
    codexHome: root,
    clientId: "client-a",
  };

  try {
    const activation = await codexBridge({ action: "activate" }, options);
    const leaseId = activation.leaseId;

    assert.ok(leaseId?.length > 0);
    assert.equal(activation.ok, true);

    const request = (payload) => codexBridge({ ...payload, leaseId }, options);

    await assert.rejects(
      codexBridge(
        { action: "threads", leaseId, limit: 10 },
        { ...options, clientId: "client-b" },
      ),
      /lease is not active for this host client/,
    );

    const threads = await request({ action: "threads", limit: 10 });

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

    await assert.rejects(
      request({
        action: "queue",
        thread: "thread-cold",
        message: "do not route this",
      }),
      /Codex thread is not loaded/,
    );

    const queued = await request({
      action: "queue",
      thread: "thread-b",
      message: "apply this exact Mesurer feedback",
    });

    assert.equal(queued.thread, "thread-b");
    assert.equal(queued.status, "queued");
    assert.equal(queued.queuedSubmissionId, "queue-thread-b");
    assert.match(queued.clientUserMessageId, /^[0-9a-f-]+$/);
    assert.equal(queued.dispatch, "persisted");

    const nowSeconds = Math.floor(Date.now() / 1_000);

    await writeTurns(turnsPath, [{
      id: "turn-b",
      items: [{
        type: "userMessage",
        id: "user-turn-b",
        content: [{
          type: "text",
          text: "apply this exact Mesurer feedback",
          textElements: [],
        }],
      }],
      itemsView: "summary",
      status: "inProgress",
      error: null,
      startedAt: nowSeconds,
      completedAt: null,
      durationMs: null,
    }]);

    const working = await request({
      action: "delivery",
      deliveryId: queued.deliveryId,
    });

    assert.equal(working.status, "working");
    assert.equal(working.turnId, "turn-b");

    await writeTurns(turnsPath, [{
      id: "turn-b",
      items: [{
        type: "userMessage",
        id: "user-turn-b",
        content: [{
          type: "text",
          text: "apply this exact Mesurer feedback",
          textElements: [],
        }],
      }],
      itemsView: "summary",
      status: "completed",
      error: null,
      startedAt: nowSeconds,
      completedAt: nowSeconds + 1,
      durationMs: 1_000,
    }]);

    const completed = await request({
      action: "delivery",
      deliveryId: queued.deliveryId,
    });

    assert.equal(completed.status, "completed");

    const state = JSON.parse(await readFile(
      join(root, "mesurer", "codex-deliveries.json"),
      "utf8",
    ));

    assert.equal(state.deliveries[0]?.queuedSubmissionId, "queue-thread-b");
    assert.equal(state.deliveries[0]?.clientUserMessageId, queued.clientUserMessageId);

    const released = await codexBridge({ action: "deactivate", leaseId }, options);

    assert.equal(released.released, true);

    await assert.rejects(
      request({ action: "threads", limit: 10 }),
      /lease is not active for this host client/,
    );
  } finally {
    await appServer.close();
    await rm(root, { recursive: true, force: true });
  }
});


test("Codex Bridge restores a consumed shared queue item from exact client identity", async () => {
  const root = await mkdtemp(join(testTmpdir(), "mesurer-codex-history-restore-"));
  const turnsPath = join(root, "turns.json");
  const nowSeconds = Math.floor(Date.now() / 1_000);

  await writeTurns(turnsPath, [{
    id: "turn-history-restore",
    items: [{
      type: "userMessage",
      id: "user-history-restore",
      clientId: "client-history-restore",
      content: [{
        type: "text",
        text: "restore already consumed feedback",
        textElements: [],
      }],
    }],
    itemsView: "summary",
    status: "completed",
    error: null,
    startedAt: nowSeconds - 1,
    completedAt: nowSeconds,
    durationMs: 1_000,
  }]);

  const appServer = await createFakeAppServer(root, turnsPath);
  const options = {
    codex: join(root, "must-not-run"),
    codexHome: root,
    clientId: "history-client",
  };

  try {
    const activation = await codexBridge({ action: "activate" }, options);
    const leaseId = activation.leaseId;

    assert.ok(leaseId);

    const restored = await codexBridge({
      action: "restore",
      leaseId,
      deliveryId: "delivery-history-restore",
      thread: "thread-a",
      queuedSubmissionId: "queue-already-consumed",
      clientUserMessageId: "client-history-restore",
    }, options);

    assert.equal(restored.restored, true);
    assert.equal(restored.deliveryId, "delivery-history-restore");
    assert.equal(restored.queuedSubmissionId, "queue-already-consumed");
    assert.equal(restored.clientUserMessageId, "client-history-restore");
    assert.equal(restored.turnId, "turn-history-restore");
    assert.equal(restored.status, "completed");

    const persisted = JSON.parse(await readFile(
      join(root, "mesurer", "codex-deliveries.json"),
      "utf8",
    ));

    assert.equal(persisted.deliveries.length, 1);
    assert.equal(
      persisted.deliveries[0]?.clientUserMessageId,
      "client-history-restore",
    );
  } finally {
    await appServer.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Electron host adapter scopes leases to one WebContents and releases them on navigation", async () => {
  const root = await mkdtemp(join(testTmpdir(), "mesurer-codex-host-"));
  const turnsPath = join(root, "turns.json");

  await writeTurns(turnsPath, []);
  const appServer = await createFakeAppServer(root, turnsPath);
  const handlers = new Map();

  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
  };

  assert.throws(
    () => installMesurerCodexHost({ ipcMain, codexHome: root }),
    /requires validateSender/,
  );

  const host = installMesurerCodexHost({
    ipcMain,
    codexHome: root,
    validateSender(event) {
      return event.sender.id === 41 || event.sender.id === 42;
    },
  });

  class FakeSender extends EventEmitter {
    constructor(id) {
      super();
      this.id = id;
    }
  }

  const sender = new FakeSender(41);
  const secondSender = new FakeSender(42);
  const invoke = handlers.get(MESURER_CODEX_BRIDGE_CHANNEL);

  assert.ok(invoke);

  try {
    const activation = await invoke(
      { sender, senderFrame: { parent: null } },
      { action: "activate" },
    );

    assert.ok(activation.leaseId?.length > 0);
    assert.equal(activation.ok, true);

    const threads = await invoke(
      { sender, senderFrame: { parent: null } },
      { action: "threads", leaseId: activation.leaseId, limit: 5 },
    );

    assert.equal(threads.threadDetails.length, 2);

    const secondActivation = await invoke(
      { sender: secondSender, senderFrame: { parent: null } },
      { action: "activate" },
    );

    assert.ok(secondActivation.leaseId?.length > 0);
    assert.notEqual(secondActivation.leaseId, activation.leaseId);

    await assert.rejects(
      invoke(
        { sender: secondSender, senderFrame: { parent: null } },
        { action: "threads", leaseId: activation.leaseId, limit: 5 },
      ),
      /lease is not active for this host client/,
    );

    await assert.rejects(
      invoke(
        { sender: new FakeSender(99), senderFrame: { parent: null } },
        { action: "runtime" },
      ),
      /rejected the invoking renderer/,
    );

    sender.emit("did-navigate");

    await assert.rejects(
      invoke(
        { sender, senderFrame: { parent: null } },
        { action: "threads", leaseId: activation.leaseId, limit: 5 },
      ),
      /lease is not active for this host client/,
    );

    const secondThreads = await invoke(
      { sender: secondSender, senderFrame: { parent: null } },
      { action: "threads", leaseId: secondActivation.leaseId, limit: 5 },
    );

    assert.equal(secondThreads.threadDetails.length, 2);

    secondSender.emit("destroyed");

    await assert.rejects(
      invoke(
        { sender: secondSender, senderFrame: { parent: null } },
        { action: "threads", leaseId: secondActivation.leaseId, limit: 5 },
      ),
      /lease is not active for this host client/,
    );

    await assert.rejects(
      invoke(
        { sender, senderFrame: { parent: {} } },
        { action: "runtime" },
      ),
      /only accepted from the main frame/,
    );
  } finally {
    host.dispose();
    await appServer.close();
    await rm(root, { recursive: true, force: true });
  }

  assert.equal(handlers.has(MESURER_CODEX_BRIDGE_CHANNEL), false);
});

