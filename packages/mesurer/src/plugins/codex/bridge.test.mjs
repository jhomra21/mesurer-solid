import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { codexBridge } from "./bridge.mjs";

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
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-bridge-"));
  const turnsPath = join(root, "turns.json");

  await writeTurns(turnsPath, []);

  const appServer = await createFakeAppServer(root, turnsPath);

  const options = {
    codex: join(root, "must-not-run"),
    codexHome: root,
  };

  try {
    const threads = await codexBridge({ action: "threads", limit: 10 }, options);

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
      codexBridge({
        action: "queue",
        thread: "thread-cold",
        message: "do not route this",
      }, options),
      /Codex thread is not loaded/,
    );

    const queued = await codexBridge({
      action: "queue",
      thread: "thread-b",
      message: "apply this exact Mesurer feedback",
    }, options);

    assert.equal(queued.thread, "thread-b");
    assert.equal(queued.status, "queued");
    assert.equal(queued.queuedSubmissionId, "queue-thread-b");
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

    const working = await codexBridge({
      action: "delivery",
      deliveryId: queued.deliveryId,
    }, options);

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

    const completed = await codexBridge({
      action: "delivery",
      deliveryId: queued.deliveryId,
    }, options);

    assert.equal(completed.status, "completed");

    const state = JSON.parse(await readFile(
      join(root, "mesurer", "codex-deliveries.json"),
      "utf8",
    ));

    assert.equal(state.deliveries[0]?.queuedSubmissionId, "queue-thread-b");
  } finally {
    await appServer.close();
    await rm(root, { recursive: true, force: true });
  }
});
