import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { codexBridge } from "../packages/mesurer/plugins/codex/bridge.mjs";

const readJsonLines = async (path) => {
  const text = await readFile(path, "utf8");

  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
};

const writeFakeCodex = async (root) => {
  const fakeCodex = join(root, "fake-codex.mjs");
  const turnsPath = join(root, "turns.json");
  const queuePath = join(root, "queue.json");
  const argsPath = join(root, "args.jsonl");

  await writeFile(turnsPath, "[]");
  await writeFile(queuePath, "[]");
  await writeFile(argsPath, "");

  await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
appendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(args) + "\\n");

if (args[0] === "app-server" && args[1] === "daemon" && args[2] === "start") {
  console.log("started");
} else if (args[0] === "stdio-to-uds") {
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
        write({
          id: message.id,
          result: {
            thread: {
              id: message.params.threadId,
              name: message.params.threadId === "thread-a" ? "Diffusion editor" : "Fix selected UI",
              preview: "",
              recencyAt: 200,
              updatedAt: 200,
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

      if (message.method === "thread/queue/add") {
        const queued = {
          id: "queue-" + message.params.threadId,
          input: message.params.input,
          clientUserMessageId: message.params.clientUserMessageId,
        };

        const existing = JSON.parse(readFileSync(process.env.MESURER_FAKE_QUEUE, "utf8"));
        writeFileSync(process.env.MESURER_FAKE_QUEUE, JSON.stringify([...existing, queued]));
        write({
          id: message.id,
          result: { queuedSubmission: queued },
        });
        continue;
      }

      if (message.method === "thread/queue/list") {
        write({
          id: message.id,
          result: {
            data: JSON.parse(readFileSync(process.env.MESURER_FAKE_QUEUE, "utf8")),
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
  process.stderr.write("unexpected fake Codex invocation: " + args.join(" ") + "\\n");
  process.exit(97);
}
`);
  await chmod(fakeCodex, 0o755);

  return { fakeCodex, turnsPath, queuePath, argsPath };
};

test("Codex Bridge uses the shared app-server for loaded threads, durable queueing, and delivery lifecycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-bridge-"));
  const fixture = await writeFakeCodex(root);
  const previous = {
    CODEX_HOME: process.env.CODEX_HOME,
    MESURER_FAKE_CODEX_ARGS: process.env.MESURER_FAKE_CODEX_ARGS,
    MESURER_FAKE_TURNS: process.env.MESURER_FAKE_TURNS,
    MESURER_FAKE_QUEUE: process.env.MESURER_FAKE_QUEUE,
  };

  process.env.CODEX_HOME = root;
  process.env.MESURER_FAKE_CODEX_ARGS = fixture.argsPath;
  process.env.MESURER_FAKE_TURNS = fixture.turnsPath;
  process.env.MESURER_FAKE_QUEUE = fixture.queuePath;

  const options = {
    codex: fixture.fakeCodex,
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

    await writeFile(fixture.turnsPath, JSON.stringify([{
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
    }]));

    const working = await codexBridge({
      action: "delivery",
      deliveryId: queued.deliveryId,
    }, options);

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
          textElements: [],
        }],
      }],
      itemsView: "summary",
      status: "completed",
      error: null,
      startedAt: nowSeconds,
      completedAt: nowSeconds + 1,
      durationMs: 1_000,
    }]));

    const completed = await codexBridge({
      action: "delivery",
      deliveryId: queued.deliveryId,
    }, options);

    assert.equal(completed.status, "completed");

    const invocations = await readJsonLines(fixture.argsPath);

    assert.equal(
      invocations.some((args) => args[0] === "queue"),
      false,
      "Mesurer must not shell through codex queue when the shared app-server can accept thread/queue/add directly",
    );

    assert.equal(
      invocations.every((args) =>
        args[0] === "stdio-to-uds"
        || (args[0] === "app-server" && args[1] === "daemon" && args[2] === "start")),
      true,
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    await rm(root, { recursive: true, force: true });
  }
});
