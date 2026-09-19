import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const bridgeScript = new URL("../packages/mesurer/scripts/codex-bridge.mjs", import.meta.url);

const waitForLine = (stream, prefix, timeoutMs = 10_000) => new Promise((resolve, reject) => {
  let buffer = "";
  const timeout = setTimeout(() => {
    cleanup();
    reject(new Error(`Timed out waiting for ${prefix}`));
  }, timeoutMs);
  const onData = (chunk) => {
    buffer += chunk.toString();
    for (const line of buffer.split(/\r?\n/)) {
      if (line.startsWith(prefix)) {
        cleanup();
        resolve(line.slice(prefix.length));
        return;
      }
    }
  };
  const cleanup = () => {
    clearTimeout(timeout);
    stream.off("data", onData);
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

const readInvocations = async (path) => {
  const text = await readFile(path, "utf8");
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
};

const waitForDelivery = async (bridgeUrl, deliveryId, predicate, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${bridgeUrl}/deliveries/${deliveryId}`, {
      headers: { Origin: "http://localhost:5173" },
    });
    if (response.ok) {
      const delivery = await response.json();
      if (predicate(delivery)) return delivery;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for delivery ${deliveryId}.`);
};

test("Codex bridge auto-binds the launching thread and routes only registered threads", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-bridge-"));
  const argsPath = join(root, "args.jsonl");
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs";\nappendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(process.argv.slice(2)) + "\\n");\nconsole.log("queued by fake codex");\n`);
  await chmod(fakeCodex, 0o755);

  const child = spawn(process.execPath, [bridgeScript.pathname,
    "--port", "0",
    "--codex", fakeCodex,
  ], {
    env: {
      ...process.env,
      CODEX_THREAD_ID: "thread-a",
      MESURER_FAKE_CODEX_ARGS: argsPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");

    const health = await fetch(`${bridgeUrl}/health`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(health.status, 200);
    const healthPayload = await health.json();
    assert.equal(healthPayload.ok, true);
    assert.equal(healthPayload.thread, "thread-a");
    assert.deepEqual(healthPayload.threads, ["thread-a"]);
    assert.equal(healthPayload.bridge?.name, "mesurer-codex");
    assert.equal(healthPayload.bridge?.protocol, 1);
    assert.match(healthPayload.bridge?.sourceHash, /^[0-9a-f]{64}$/);
    assert.equal(Number.isInteger(healthPayload.bridge?.pid), true);
    assert.equal(healthPayload.bridge?.canShutdown, true);
    assert.equal(health.headers.get("access-control-allow-origin"), "http://localhost:5173");

    const forbiddenOrigin = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
      },
      body: JSON.stringify({ message: "do not send" }),
    });
    assert.equal(forbiddenOrigin.status, 403);

    const browserRegistration = await fetch(`${bridgeUrl}/threads/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ thread: "thread-browser" }),
    });
    assert.equal(browserRegistration.status, 403);

    const registration = await fetch(`${bridgeUrl}/threads/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread: "thread-b" }),
    });
    assert.equal(registration.status, 200, stderr);
    assert.deepEqual(await registration.json(), {
      ok: true,
      thread: "thread-b",
      threads: ["thread-a", "thread-b"],
    });

    const switchBack = await fetch(`${bridgeUrl}/target`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:4255",
      },
      body: JSON.stringify({ thread: "thread-a" }),
    });
    assert.equal(switchBack.status, 200, stderr);

    const sendToOther = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:4255",
      },
      body: JSON.stringify({ message: "fix thread b", thread: "thread-b" }),
    });
    assert.equal(sendToOther.status, 200, stderr);
    const sent = await sendToOther.json();
    assert.equal(sent.ok, true);
    assert.equal(sent.thread, "thread-b");
    assert.equal(sent.output, "queued by fake codex");
    assert.equal(sent.delivery, "queued");
    assert.equal(sent.status, "queued");
    assert.match(sent.deliveryId, /^[0-9a-f-]{36}$/);

    const queuedStatus = await fetch(`${bridgeUrl}/deliveries/${sent.deliveryId}`, {
      headers: { Origin: "http://127.0.0.1:4255" },
    });
    assert.equal(queuedStatus.status, 200);
    assert.equal((await queuedStatus.json()).status, "queued");

    const browserLifecycle = await fetch(`${bridgeUrl}/lifecycle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:4255",
      },
      body: JSON.stringify({
        event: "UserPromptSubmit",
        sessionId: "thread-b",
        turnId: "turn-b",
        prompt: "fix thread b",
      }),
    });
    assert.equal(browserLifecycle.status, 403);

    const started = await fetch(`${bridgeUrl}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "UserPromptSubmit",
        sessionId: "thread-b",
        turnId: "turn-b",
        prompt: "fix thread b",
      }),
    });
    assert.equal(started.status, 200);
    assert.equal((await started.json()).status, "working");

    const completed = await fetch(`${bridgeUrl}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "Stop",
        sessionId: "thread-b",
        turnId: "turn-b",
      }),
    });
    assert.equal(completed.status, 200);
    assert.equal((await completed.json()).status, "completed");

    const completedStatus = await fetch(`${bridgeUrl}/deliveries/${sent.deliveryId}`, {
      headers: { Origin: "http://127.0.0.1:4255" },
    });
    assert.equal((await completedStatus.json()).status, "completed");

    const unknownThread = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:4255",
      },
      body: JSON.stringify({ message: "do not route", thread: "thread-c" }),
    });
    assert.equal(unknownThread.status, 409);

    assert.deepEqual(await readInvocations(argsPath), [[
      "queue",
      "--thread",
      "thread-b",
      "--message",
      "fix thread b",
    ]]);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("another Codex thread can register itself with a running bridge", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-register-"));
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, "#!/usr/bin/env node\n");
  await chmod(fakeCodex, 0o755);

  const server = spawn(process.execPath, [bridgeScript.pathname,
    "--port", "0",
    "--codex", fakeCodex,
  ], {
    env: { ...process.env, CODEX_THREAD_ID: "thread-original" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const bridgeUrl = await waitForLine(server.stdout, "BRIDGE_URL=");
    const register = spawn(process.execPath, [bridgeScript.pathname,
      "--register-current",
      "--bridge", bridgeUrl,
    ], {
      env: { ...process.env, CODEX_THREAD_ID: "thread-new" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let registerStderr = "";
    register.stderr.on("data", (chunk) => { registerStderr += chunk.toString(); });
    assert.equal(await waitForExit(register), 0, registerStderr);

    const health = await fetch(`${bridgeUrl}/health`);
    assert.equal(health.status, 200);
    const healthPayload = await health.json();
    assert.equal(healthPayload.ok, true);
    assert.equal(healthPayload.thread, "thread-new");
    assert.deepEqual(healthPayload.threads, ["thread-original", "thread-new"]);
    assert.equal(healthPayload.bridge?.name, "mesurer-codex");
    assert.equal(healthPayload.bridge?.protocol, 1);
    assert.match(healthPayload.bridge?.sourceHash, /^[0-9a-f]{64}$/);
    assert.equal(Number.isInteger(healthPayload.bridge?.pid), true);
    assert.equal(healthPayload.bridge?.canShutdown, true);
  } finally {
    if (server.exitCode === null) server.kill("SIGKILL");
    await waitForExit(server).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex bridge discovers recent same-project threads through app-server", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-discovery-"));
  const argsPath = join(root, "args.jsonl");
  const fakeCodex = join(root, "fake-codex.mjs");
  const cwd = join(root, "project");
  await writeFile(fakeCodex, `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs";\nconst args = process.argv.slice(2);\nconst write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");\nif (args[0] === "app-server") {\n  process.stdin.setEncoding("utf8");\n  let buffer = "";\n  process.stdin.on("data", (chunk) => {\n    buffer += chunk;\n    while (true) {\n      const newline = buffer.indexOf("\\n");\n      if (newline < 0) break;\n      const line = buffer.slice(0, newline).trim();\n      buffer = buffer.slice(newline + 1);\n      if (!line) continue;\n      const message = JSON.parse(line);\n      if (message.id === "mesurer-init") write({ id: message.id, result: { userAgent: "fake-codex" } });\n      if (message.id === "mesurer-thread-list") {\n        if (message.params?.cwd !== process.env.MESURER_EXPECT_CWD) {\n          write({ id: message.id, error: { message: "wrong cwd" } });\n          continue;\n        }\n        write({ id: message.id, result: {\n          data: [\n            { id: "thread-a", name: "Test Mesurer inject script", preview: "", recencyAt: 200 },\n            { id: "thread-c", name: null, preview: "Fix the account card spacing", recencyAt: 190 }\n          ],\n          nextCursor: null\n        } });\n      }\n    }\n  });\n} else if (args[0] === "queue") {\n  appendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(args) + "\\n");\n  console.log("queued by fake codex");\n}\n`);
  await chmod(fakeCodex, 0o755);

  const child = spawn(process.execPath, [bridgeScript.pathname,
    "--port", "0",
    "--thread", "thread-a",
    "--cwd", cwd,
    "--codex", fakeCodex,
  ], {
    env: {
      ...process.env,
      MESURER_EXPECT_CWD: cwd,
      MESURER_FAKE_CODEX_ARGS: argsPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");
    const list = await fetch(`${bridgeUrl}/threads?thread=thread-a&limit=10`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(list.status, 200, stderr);
    assert.deepEqual(await list.json(), {
      ok: true,
      thread: "thread-a",
      threadDetails: [
        {
          id: "thread-a",
          title: "Test Mesurer inject script",
          updatedAt: 200,
          connected: true,
        },
        {
          id: "thread-c",
          title: "Fix the account card spacing",
          updatedAt: 190,
          connected: false,
        },
      ],
      hasMore: false,
    });

    const send = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ message: "apply this feedback", thread: "thread-c" }),
    });
    assert.equal(send.status, 200, stderr);
    const sent = await send.json();
    assert.equal(sent.ok, true);
    assert.equal(sent.thread, "thread-c");
    assert.equal(sent.output, "queued by fake codex");
    assert.equal(sent.delivery, "queued");
    assert.equal(sent.status, "queued");
    assert.match(sent.deliveryId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await readInvocations(argsPath), [[
      "queue",
      "--thread",
      "thread-c",
      "--message",
      "apply this feedback",
    ]]);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});


test("Codex bridge resumes a cold shared-daemon thread after queue persistence", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-cold-queue-"));
  const argsPath = join(root, "args.jsonl");
  const protocolPath = join(root, "protocol.jsonl");
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
if (args[0] === "queue") {
  appendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(args) + "\\n");
  console.log("Queued message queue-cold-1 for thread thread-cold.");
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
      appendFileSync(process.env.MESURER_FAKE_CODEX_PROTOCOL, JSON.stringify(message) + "\\n");
      if (message.id === "mesurer-daemon-init") write({ id: message.id, result: { userAgent: "fake-codex" } });
      if (message.id === "mesurer-thread-read") write({
        id: message.id,
        result: { thread: { id: "thread-cold", status: { type: "notLoaded" } } },
      });
      if (message.id === "mesurer-thread-resume") write({
        id: message.id,
        result: { thread: { id: "thread-cold", status: { type: "active", activeFlags: [] } } },
      });
    }
  });
}
`);
  await chmod(fakeCodex, 0o755);

  const child = spawn(process.execPath, [bridgeScript.pathname,
    "--port", "0",
    "--thread", "thread-cold",
    "--codex", fakeCodex,
  ], {
    env: {
      ...process.env,
      MESURER_FAKE_CODEX_ARGS: argsPath,
      MESURER_FAKE_CODEX_PROTOCOL: protocolPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");
    const send = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ message: "wake the cold queue" }),
    });
    assert.equal(send.status, 200, stderr);
    const sent = await send.json();
    assert.equal(sent.ok, true);
    assert.equal(sent.status, "queued");
    assert.equal(sent.queuedSubmissionId, "queue-cold-1");
    assert.equal(sent.dispatch, "resumed");
    assert.equal(sent.dispatchError, null);

    assert.deepEqual(await readInvocations(argsPath), [[
      "queue",
      "--thread",
      "thread-cold",
      "--message",
      "wake the cold queue",
    ]]);

    const protocol = await readInvocations(protocolPath);
    assert.deepEqual(
      protocol.filter((message) => message.id).map((message) => message.method),
      ["initialize", "thread/read", "thread/resume"],
    );
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex Desktop queues natively, opens the owning thread once, and survives a bridge restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-desktop-restart-"));
  const argsPath = join(root, "codex-args.jsonl");
  const openPath = join(root, "desktop-open.jsonl");
  const fakeCodex = join(root, "fake-codex.mjs");
  const fakeOpen = join(root, "fake-open.mjs");

  await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(args) + "\\n");
if (args[0] === "queue") {
  console.log("Queued message queue-desktop-restart-1 for thread thread-desktop-restart.");
} else if (args[0] === "stdio-to-uds") {
  process.stderr.write("Codex Desktop must not use the managed daemon socket\\n");
  process.exit(99);
} else if (args[0] === "app-server" && args[1] === "daemon") {
  process.stderr.write("Codex Desktop must not start the managed daemon\\n");
  process.exit(99);
}
`);
  await chmod(fakeCodex, 0o755);

  await writeFile(fakeOpen, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(
  process.env.MESURER_FAKE_DESKTOP_OPEN,
  JSON.stringify(process.argv.slice(2)) + "\\n",
);
`);
  await chmod(fakeOpen, 0o755);

  const bridgeEnv = {
    ...process.env,
    CODEX_HOME: root,
    CODEX_APP_TOOLS_PIPE_PATH: join(root, "closed-app-tools.pipe"),
    MESURER_CODEX_DESKTOP_OPEN_BIN: fakeOpen,
    MESURER_FAKE_CODEX_ARGS: argsPath,
    MESURER_FAKE_DESKTOP_OPEN: openPath,
  };
  const spawnBridge = () => spawn(process.execPath, [bridgeScript.pathname,
    "--port", "0",
    "--thread", "thread-desktop-restart",
    "--codex", fakeCodex,
  ], {
    env: bridgeEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let first = spawnBridge();
  let second;
  try {
    const firstUrl = await waitForLine(first.stdout, "BRIDGE_URL=");
    const send = await fetch(`${firstUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ message: "persist this desktop queue across restart" }),
    });
    assert.equal(send.status, 200);
    const sent = await send.json();
    assert.equal(sent.transport, "desktop-app");
    assert.equal(sent.status, "queued");
    assert.equal(sent.queuedSubmissionId, "queue-desktop-restart-1");

    const opened = await waitForDelivery(
      firstUrl,
      sent.deliveryId,
      (delivery) => delivery.dispatch === "desktop-opened",
    );
    assert.equal(opened.queuedSubmissionId, "queue-desktop-restart-1");

    first.kill("SIGKILL");
    await waitForExit(first).catch(() => {});

    second = spawnBridge();
    const secondUrl = await waitForLine(second.stdout, "BRIDGE_URL=");
    const recovered = await waitForDelivery(
      secondUrl,
      sent.deliveryId,
      (delivery) => delivery.dispatch === "desktop-opened",
    );
    assert.equal(recovered.status, "queued");
    assert.equal(recovered.transport, "desktop-app");
    assert.equal(recovered.queuedSubmissionId, "queue-desktop-restart-1");

    const codexInvocations = await readInvocations(argsPath);
    assert.equal(codexInvocations.filter((args) => args[0] === "queue").length, 1);
    assert.equal(codexInvocations.some((args) => args[0] === "stdio-to-uds"), false);
    assert.equal(
      codexInvocations.some((args) => args[0] === "app-server" && args[1] === "daemon"),
      false,
    );
    assert.deepEqual(await readInvocations(openPath), [[
      "codex://threads/thread-desktop-restart",
    ]]);

    const started = await fetch(`${secondUrl}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "UserPromptSubmit",
        sessionId: "thread-desktop-restart",
        turnId: "turn-desktop-restart-1",
        prompt: "persist this desktop queue across restart",
      }),
    });
    assert.equal(started.status, 200);
    assert.equal((await started.json()).status, "working");

    const completed = await fetch(`${secondUrl}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "Stop",
        sessionId: "thread-desktop-restart",
        turnId: "turn-desktop-restart-1",
      }),
    });
    assert.equal(completed.status, 200);
    assert.equal((await completed.json()).status, "completed");
  } finally {
    if (first.exitCode === null) first.kill("SIGKILL");
    if (second?.exitCode === null) second.kill("SIGKILL");
    await waitForExit(first).catch(() => {});
    if (second) await waitForExit(second).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex Desktop reconciles exact delivery lifecycle from turn history without lifecycle hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-desktop-history-"));
  const argsPath = join(root, "codex-args.jsonl");
  const openPath = join(root, "desktop-open.jsonl");
  const turnsPath = join(root, "turns.json");
  const fakeCodex = join(root, "fake-codex.mjs");
  const fakeOpen = join(root, "fake-open.mjs");

  await writeFile(turnsPath, "[]");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(args) + "\\n");
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");

if (args[0] === "queue") {
  const messageIndex = args.indexOf("--message");
  const message = messageIndex >= 0 ? args[messageIndex + 1] : "";
  const queueId = message.includes("interrupt") ? "queue-history-interrupt" : "queue-history-complete";
  console.log(\`Queued message \${queueId} for thread thread-history.\`);
} else if (args[0] === "app-server" && args[1] === "--listen") {
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
      if (message.id === "mesurer-history-init") {
        write({ id: message.id, result: { userAgent: "fake-codex" } });
      } else if (message.id === "mesurer-history-turns") {
        write({
          id: message.id,
          result: {
            data: JSON.parse(readFileSync(process.env.MESURER_FAKE_TURNS, "utf8")),
            nextCursor: null,
            backwardsCursor: null,
          },
        });
      } else if (message.id === "mesurer-history-read") {
        write({
          id: message.id,
          result: { thread: { turns: JSON.parse(readFileSync(process.env.MESURER_FAKE_TURNS, "utf8")) } },
        });
      }
    }
  });
} else if (args[0] === "stdio-to-uds" || (args[0] === "app-server" && args[1] === "daemon")) {
  process.stderr.write("Desktop history reconciliation must not use the managed daemon\\n");
  process.exit(99);
}
`);
  await chmod(fakeCodex, 0o755);

  await writeFile(fakeOpen, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(process.env.MESURER_FAKE_DESKTOP_OPEN, JSON.stringify(process.argv.slice(2)) + "\\n");
`);
  await chmod(fakeOpen, 0o755);

  const child = spawn(process.execPath, [bridgeScript.pathname,
    "--port", "0",
    "--thread", "thread-history",
    "--codex", fakeCodex,
  ], {
    env: {
      ...process.env,
      CODEX_HOME: root,
      CODEX_APP_TOOLS_PIPE_PATH: join(root, "desktop-owner.pipe"),
      MESURER_CODEX_DESKTOP_OPEN_BIN: fakeOpen,
      MESURER_FAKE_CODEX_ARGS: argsPath,
      MESURER_FAKE_DESKTOP_OPEN: openPath,
      MESURER_FAKE_TURNS: turnsPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const userTurn = (id, text, status) => ({
    id,
    items: [{
      type: "userMessage",
      id: `user-${id}`,
      clientId: null,
      content: [{ type: "text", text, text_elements: [] }],
    }],
    itemsView: "summary",
    status,
    error: null,
    startedAt: Math.floor(Date.now() / 1_000),
    completedAt: status === "inProgress" ? null : Math.floor(Date.now() / 1_000),
    durationMs: status === "inProgress" ? null : 10,
  });

  try {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");

    const sendCompleted = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ message: "complete this exact Mesurer feedback" }),
    });
    assert.equal(sendCompleted.status, 200, stderr);
    const completedDelivery = await sendCompleted.json();
    await waitForDelivery(
      bridgeUrl,
      completedDelivery.deliveryId,
      (delivery) => delivery.dispatch === "desktop-opened",
    );

    await writeFile(turnsPath, JSON.stringify([
      userTurn("turn-unrelated", "some unrelated prompt", "completed"),
    ]));
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const stillQueued = await waitForDelivery(
      bridgeUrl,
      completedDelivery.deliveryId,
      (delivery) => delivery.status === "queued",
    );
    assert.equal(stillQueued.turnId, null);

    await writeFile(turnsPath, JSON.stringify([
      userTurn("turn-history-complete", "complete this exact Mesurer feedback", "inProgress"),
      userTurn("turn-unrelated", "some unrelated prompt", "completed"),
    ]));
    const working = await waitForDelivery(
      bridgeUrl,
      completedDelivery.deliveryId,
      (delivery) => delivery.status === "working",
    );
    assert.equal(working.turnId, "turn-history-complete");

    await writeFile(turnsPath, JSON.stringify([
      userTurn("turn-history-complete", "complete this exact Mesurer feedback", "completed"),
      userTurn("turn-unrelated", "some unrelated prompt", "completed"),
    ]));
    const completed = await waitForDelivery(
      bridgeUrl,
      completedDelivery.deliveryId,
      (delivery) => delivery.status === "completed",
    );
    assert.equal(completed.turnId, "turn-history-complete");

    const sendInterrupted = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ message: "interrupt this exact Mesurer feedback" }),
    });
    assert.equal(sendInterrupted.status, 200, stderr);
    const interruptedDelivery = await sendInterrupted.json();
    await waitForDelivery(
      bridgeUrl,
      interruptedDelivery.deliveryId,
      (delivery) => delivery.dispatch === "desktop-opened",
    );

    await writeFile(turnsPath, JSON.stringify([
      userTurn("turn-history-interrupt", "interrupt this exact Mesurer feedback", "inProgress"),
      userTurn("turn-history-complete", "complete this exact Mesurer feedback", "completed"),
    ]));
    const interruptWorking = await waitForDelivery(
      bridgeUrl,
      interruptedDelivery.deliveryId,
      (delivery) => delivery.status === "working",
    );
    assert.equal(interruptWorking.turnId, "turn-history-interrupt");

    await writeFile(turnsPath, JSON.stringify([
      userTurn("turn-history-interrupt", "interrupt this exact Mesurer feedback", "interrupted"),
      userTurn("turn-history-complete", "complete this exact Mesurer feedback", "completed"),
    ]));
    const interrupted = await waitForDelivery(
      bridgeUrl,
      interruptedDelivery.deliveryId,
      (delivery) => delivery.status === "interrupted",
    );
    assert.equal(interrupted.turnId, "turn-history-interrupt");

    const invocations = await readInvocations(argsPath);
    assert.equal(invocations.filter((args) => args[0] === "queue").length, 2);
    assert.equal(invocations.some((args) => args[0] === "stdio-to-uds"), false);
    assert.equal(invocations.some((args) => args[0] === "app-server" && args[1] === "daemon"), false);
    assert.deepEqual(await readInvocations(openPath), [
      ["codex://threads/thread-history"],
      ["codex://threads/thread-history"],
    ]);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex bridge wakes an existing native Desktop queue item without deleting or duplicating it", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-desktop-recover-"));
  const argsPath = join(root, "codex-args.jsonl");
  const protocolPath = join(root, "codex-protocol.jsonl");
  const openPath = join(root, "desktop-open.jsonl");
  const fakeCodex = join(root, "fake-codex.mjs");
  const fakeOpen = join(root, "fake-open.mjs");

  await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(args) + "\\n");
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");

if (args[0] === "app-server" && args[1] === "--listen") {
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
      appendFileSync(process.env.MESURER_FAKE_CODEX_PROTOCOL, JSON.stringify(message) + "\\n");
      if (message.id === "mesurer-queue-init") {
        write({ id: message.id, result: { userAgent: "fake-codex" } });
      } else if (String(message.id).startsWith("mesurer-queue-list-")) {
        write({
          id: message.id,
          result: {
            data: [{
              id: "queue-desktop-old-1",
              input: [{ type: "text", text: "recover this exact desktop feedback", text_elements: [] }],
              clientUserMessageId: "client-desktop-old-1",
            }],
            nextCursor: null,
          },
        });
      } else if (message.id === "mesurer-queue-delete") {
        process.stderr.write("Desktop recovery must not delete the existing native queue item\\n");
        process.exit(98);
      }
    }
  });
} else if (args[0] === "queue") {
  process.stderr.write("Desktop recovery must not enqueue a second native queue item\\n");
  process.exit(99);
} else if (args[0] === "stdio-to-uds") {
  process.stderr.write("Desktop recovery must not use the managed daemon socket\\n");
  process.exit(99);
} else if (args[0] === "app-server" && args[1] === "daemon") {
  process.stderr.write("Desktop recovery must not start the managed daemon\\n");
  process.exit(99);
}
`);
  await chmod(fakeCodex, 0o755);

  await writeFile(fakeOpen, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(
  process.env.MESURER_FAKE_DESKTOP_OPEN,
  JSON.stringify(process.argv.slice(2)) + "\\n",
);
`);
  await chmod(fakeOpen, 0o755);

  const child = spawn(process.execPath, [bridgeScript.pathname,
    "--port", "0",
    "--thread", "thread-desktop",
    "--codex", fakeCodex,
  ], {
    env: {
      ...process.env,
      CODEX_HOME: root,
      CODEX_APP_TOOLS_PIPE_PATH: join(root, "closed-app-tools.pipe"),
      MESURER_CODEX_DESKTOP_OPEN_BIN: fakeOpen,
      MESURER_FAKE_CODEX_ARGS: argsPath,
      MESURER_FAKE_CODEX_PROTOCOL: protocolPath,
      MESURER_FAKE_DESKTOP_OPEN: openPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");

    const restore = await fetch(`${bridgeUrl}/deliveries/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({
        deliveryId: "delivery-desktop-restored-1",
        thread: "thread-desktop",
        queuedSubmissionId: "queue-desktop-old-1",
      }),
    });
    assert.equal(restore.status, 200, stderr);
    const restored = await restore.json();
    assert.equal(restored.transport, "desktop-app");
    assert.equal(restored.status, "queued");
    assert.equal(restored.queuedSubmissionId, "queue-desktop-old-1");

    const dispatched = await waitForDelivery(
      bridgeUrl,
      "delivery-desktop-restored-1",
      (delivery) => delivery.dispatch === "desktop-opened",
    );
    assert.equal(dispatched.queuedSubmissionId, "queue-desktop-old-1");
    assert.equal(dispatched.transport, "desktop-app");

    const codexInvocations = await readInvocations(argsPath);
    assert.equal(codexInvocations.some((args) => args[0] === "queue"), false);
    assert.equal(codexInvocations.some((args) => args[0] === "stdio-to-uds"), false);
    assert.equal(
      codexInvocations.some((args) => args[0] === "app-server" && args[1] === "daemon"),
      false,
    );
    assert.equal(
      codexInvocations.filter((args) => args[0] === "app-server" && args[1] === "--listen").length,
      1,
    );
    const protocol = await readInvocations(protocolPath);
    assert.equal(protocol.some((message) => message.method === "thread/queue/delete"), false);
    assert.deepEqual(await readInvocations(openPath), [[
      "codex://threads/thread-desktop",
    ]]);

    const started = await fetch(`${bridgeUrl}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "UserPromptSubmit",
        sessionId: "thread-desktop",
        turnId: "turn-desktop-1",
        prompt: "recover this exact desktop feedback",
      }),
    });
    assert.equal(started.status, 200);
    assert.equal((await started.json()).status, "working");

    const completed = await fetch(`${bridgeUrl}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "Stop",
        sessionId: "thread-desktop",
        turnId: "turn-desktop-1",
      }),
    });
    assert.equal(completed.status, 200);
    assert.equal((await completed.json()).status, "completed");
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex bridge restores a single persisted queue item after restart without enqueueing again", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-restore-queue-"));
  const argsPath = join(root, "args.jsonl");
  const protocolPath = join(root, "protocol.jsonl");
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(args) + "\\n");
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");

if (args[0] === "app-server") {
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
      appendFileSync(process.env.MESURER_FAKE_CODEX_PROTOCOL, JSON.stringify(message) + "\\n");
      if (message.id === "mesurer-queue-init") {
        write({ id: message.id, result: { userAgent: "fake-codex" } });
      } else if (String(message.id).startsWith("mesurer-queue-list-")) {
        write({
          id: message.id,
          result: {
            data: [{
              id: "queue-restored-1",
              input: [{ type: "text", text: "recover this exact feedback", text_elements: [] }],
              clientUserMessageId: "client-restored-1",
            }],
            nextCursor: null,
          },
        });
      }
    }
  });
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
      appendFileSync(process.env.MESURER_FAKE_CODEX_PROTOCOL, JSON.stringify(message) + "\\n");
      if (message.id === "mesurer-daemon-init") write({ id: message.id, result: { userAgent: "fake-codex" } });
      if (message.id === "mesurer-thread-read") write({
        id: message.id,
        result: { thread: { id: "thread-recover", status: { type: "notLoaded" } } },
      });
      if (message.id === "mesurer-thread-resume") write({
        id: message.id,
        result: { thread: { id: "thread-recover", status: { type: "active", activeFlags: [] } } },
      });
    }
  });
} else if (args[0] === "queue") {
  process.stderr.write("restore must not enqueue a second message\\n");
  process.exit(99);
}
`);
  await chmod(fakeCodex, 0o755);

  const child = spawn(process.execPath, [bridgeScript.pathname,
    "--port", "0",
    "--thread", "thread-recover",
    "--codex", fakeCodex,
  ], {
    env: {
      ...process.env,
      MESURER_FAKE_CODEX_ARGS: argsPath,
      MESURER_FAKE_CODEX_PROTOCOL: protocolPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");

    const missing = await fetch(`${bridgeUrl}/deliveries/delivery-restored-1`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(missing.status, 404);

    const restore = await fetch(`${bridgeUrl}/deliveries/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({
        deliveryId: "delivery-restored-1",
        thread: "thread-recover",
      }),
    });
    assert.equal(restore.status, 200, stderr);
    const restored = await restore.json();
    assert.equal(restored.restored, true);
    assert.equal(restored.deliveryId, "delivery-restored-1");
    assert.equal(restored.queuedSubmissionId, "queue-restored-1");
    assert.equal(restored.status, "queued");
    assert.equal(restored.dispatch, "resumed");

    const started = await fetch(`${bridgeUrl}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "UserPromptSubmit",
        sessionId: "thread-recover",
        turnId: "turn-restored-1",
        prompt: "recover this exact feedback",
      }),
    });
    assert.equal(started.status, 200);
    assert.equal((await started.json()).status, "working");

    const completed = await fetch(`${bridgeUrl}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "Stop",
        sessionId: "thread-recover",
        turnId: "turn-restored-1",
      }),
    });
    assert.equal(completed.status, 200);
    assert.equal((await completed.json()).status, "completed");

    const invocations = await readInvocations(argsPath);
    assert.equal(invocations.some((args) => args[0] === "queue"), false);
    assert.equal(invocations.some((args) => args[0] === "app-server"), true);
    assert.equal(invocations.some((args) => args[0] === "stdio-to-uds"), true);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex bridge starts the official daemon when the control socket is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-daemon-fallback-"));
  const argsPath = join(root, "args.jsonl");
  const protocolPath = join(root, "protocol.jsonl");
  const daemonMarker = join(root, "daemon-started");
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(args) + "\\n");
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
if (args[0] === "queue") {
  console.log("Queued message queue-fallback-1 for thread thread-cold.");
} else if (args[0] === "app-server" && args[1] === "daemon" && args[2] === "start") {
  writeFileSync(process.env.MESURER_FAKE_DAEMON_MARKER, "started");
  console.log("App server daemon started.");
} else if (args[0] === "stdio-to-uds") {
  if (!existsSync(process.env.MESURER_FAKE_DAEMON_MARKER)) {
    process.stderr.write("failed to connect to socket: No such file or directory\\n");
    process.exit(1);
  }
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
      appendFileSync(process.env.MESURER_FAKE_CODEX_PROTOCOL, JSON.stringify(message) + "\\n");
      if (message.id === "mesurer-daemon-init") write({ id: message.id, result: { userAgent: "fake-codex" } });
      if (message.id === "mesurer-thread-read") write({
        id: message.id,
        result: { thread: { id: "thread-cold", status: { type: "notLoaded" } } },
      });
      if (message.id === "mesurer-thread-resume") write({
        id: message.id,
        result: { thread: { id: "thread-cold", status: { type: "active", activeFlags: [] } } },
      });
    }
  });
}
`);
  await chmod(fakeCodex, 0o755);

  const child = spawn(process.execPath, [bridgeScript.pathname,
    "--port", "0",
    "--thread", "thread-cold",
    "--codex", fakeCodex,
  ], {
    env: {
      ...process.env,
      MESURER_FAKE_CODEX_ARGS: argsPath,
      MESURER_FAKE_CODEX_PROTOCOL: protocolPath,
      MESURER_FAKE_DAEMON_MARKER: daemonMarker,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");
    const send = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ message: "wake without a preexisting daemon" }),
    });
    assert.equal(send.status, 200, stderr);
    const sent = await send.json();
    assert.equal(sent.queuedSubmissionId, "queue-fallback-1");
    assert.equal(sent.dispatch, "resumed");
    assert.equal(sent.dispatchError, null);

    const invocations = await readInvocations(argsPath);
    assert.deepEqual(invocations[0], [
      "queue",
      "--thread",
      "thread-cold",
      "--message",
      "wake without a preexisting daemon",
    ]);
    assert.equal(invocations[1][0], "stdio-to-uds");
    assert.deepEqual(invocations[2], ["app-server", "daemon", "start"]);
    assert.equal(invocations[3][0], "stdio-to-uds");
    assert.equal(invocations[1][1], invocations[3][1]);

    const protocol = await readInvocations(protocolPath);
    assert.deepEqual(
      protocol.filter((message) => message.id).map((message) => message.method),
      ["initialize", "thread/read", "thread/resume"],
    );
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex bridge does not start the daemon for non-missing relay errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-daemon-fail-closed-"));
  const argsPath = join(root, "args.jsonl");
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(args) + "\\n");
if (args[0] === "queue") {
  console.log("Queued message queue-fail-closed-1 for thread thread-cold.");
} else if (args[0] === "stdio-to-uds") {
  process.stderr.write("failed to connect to socket: Permission denied\\n");
  process.exit(1);
} else if (args[0] === "app-server" && args[1] === "daemon" && args[2] === "start") {
  process.stderr.write("daemon start must not run\\n");
  process.exit(99);
}
`);
  await chmod(fakeCodex, 0o755);

  const child = spawn(process.execPath, [bridgeScript.pathname,
    "--port", "0",
    "--thread", "thread-cold",
    "--codex", fakeCodex,
  ], {
    env: {
      ...process.env,
      MESURER_FAKE_CODEX_ARGS: argsPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");
    const send = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ message: "do not widen the fallback" }),
    });
    assert.equal(send.status, 200);
    const sent = await send.json();
    assert.equal(sent.queuedSubmissionId, "queue-fail-closed-1");
    assert.equal(sent.dispatch, "wake-failed");
    assert.match(sent.dispatchError, /Permission denied/);

    const invocations = await readInvocations(argsPath);
    assert.equal(invocations.length, 2);
    assert.deepEqual(invocations[0], [
      "queue",
      "--thread",
      "thread-cold",
      "--message",
      "do not widen the fallback",
    ]);
    assert.equal(invocations[1][0], "stdio-to-uds");
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex bridge does not resume an already-loaded queued thread", async () => {
  for (const status of ["idle", "active"]) {
    const root = await mkdtemp(join(tmpdir(), `mesurer-codex-loaded-${status}-`));
    const argsPath = join(root, "args.jsonl");
    const protocolPath = join(root, "protocol.jsonl");
    const fakeCodex = join(root, "fake-codex.mjs");
    await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
if (args[0] === "queue") {
  appendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(args) + "\\n");
  console.log("Queued message queue-loaded-1 for thread thread-loaded.");
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
      appendFileSync(process.env.MESURER_FAKE_CODEX_PROTOCOL, JSON.stringify(message) + "\\n");
      if (message.id === "mesurer-daemon-init") write({ id: message.id, result: { userAgent: "fake-codex" } });
      if (message.id === "mesurer-thread-read") write({
        id: message.id,
        result: { thread: { id: "thread-loaded", status: { type: process.env.MESURER_FAKE_THREAD_STATUS } } },
      });
    }
  });
}
`);
    await chmod(fakeCodex, 0o755);

    const child = spawn(process.execPath, [bridgeScript.pathname,
      "--port", "0",
      "--thread", "thread-loaded",
      "--codex", fakeCodex,
    ], {
      env: {
        ...process.env,
        MESURER_FAKE_CODEX_ARGS: argsPath,
        MESURER_FAKE_CODEX_PROTOCOL: protocolPath,
        MESURER_FAKE_THREAD_STATUS: status,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");
      const send = await fetch(`${bridgeUrl}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:5173",
        },
        body: JSON.stringify({ message: `leave ${status} scheduling to Codex` }),
      });
      assert.equal(send.status, 200);
      const sent = await send.json();
      assert.equal(sent.queuedSubmissionId, "queue-loaded-1");
      assert.equal(sent.dispatch, "already-loaded");

      const protocol = await readInvocations(protocolPath);
      assert.deepEqual(
        protocol.filter((message) => message.id).map((message) => message.method),
        ["initialize", "thread/read"],
      );
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await waitForExit(child).catch(() => {});
      await rm(root, { recursive: true, force: true });
    }
  }
});
