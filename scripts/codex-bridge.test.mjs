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
    assert.deepEqual(await health.json(), {
      ok: true,
      thread: "thread-a",
      threads: ["thread-a"],
    });
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
    assert.deepEqual(await health.json(), {
      ok: true,
      thread: "thread-new",
      threads: ["thread-original", "thread-new"],
    });
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
