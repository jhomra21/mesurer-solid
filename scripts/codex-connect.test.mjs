import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const rawFetch = globalThis.fetch;

const bridgeFetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  const origin = headers.get("Origin");

  if (!origin || url.pathname === "/health" || init.method === "OPTIONS") {
    return rawFetch(input, init);
  }

  let health;

  try {
    health = await rawFetch(`${url.origin}/health`, {
      headers: { Origin: origin },
    });
  } catch {
    return rawFetch(input, init);
  }

  if (!health.ok) return rawFetch(input, init);

  const payload = await health.json().catch(() => null);
  const instanceId = payload?.bridge?.instanceId;

  if (payload?.access?.allowed !== true || typeof instanceId !== "string" || !instanceId) {
    return rawFetch(input, init);
  }

  headers.set("X-Mesurer-Bridge-Instance", instanceId);

  return rawFetch(input, { ...init, headers });
};

const connectScript = new URL("../packages/mesurer/codex/codex-connect.mjs", import.meta.url);

const bridgeScript = new URL("../packages/mesurer/codex/codex-bridge.mjs", import.meta.url);

const lifecycleScript = new URL("../packages/mesurer/codex/codex-lifecycle.mjs", import.meta.url);

const pluginRoot = new URL("../plugins/mesurer-codex/", import.meta.url);

const testProcessEnv = (overrides = {}) => {
  const env = { ...process.env };

  delete env.CODEX_THREAD_ID;
  delete env.CODEX_HOME;
  delete env.CODEX_APP_TOOLS_PIPE_PATH;
  delete env.MESURER_CODEX_DESKTOP_OPEN_BIN;

  return { ...env, ...overrides };
};

const waitForExit = (child, timeoutMs = 10_000) => new Promise((resolve, reject) => {
  if (child.exitCode !== null) {
    resolve(child.exitCode);

    return;
  }

  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new Error("Codex connect helper did not exit in time."));
  }, timeoutMs);

  child.once("exit", (code) => {
    clearTimeout(timeout);
    resolve(code);
  });
});

const freePort = () => new Promise((resolve, reject) => {
  const server = createNetServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address()?.port;
    server.close((error) => {
      if (error) reject(error);
      else if (!port) reject(new Error("Could not allocate a test port."));
      else resolve(port);
    });
  });
});

const waitForUnavailable = async (url, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await bridgeFetch(`${url}/health`);
    } catch {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Detached bridge did not exit after its --once send.");
};

const runSessionStart = async ({ bridgeUrl, sessionId, codex, env = {} }) => {
  const args = [connectScript.pathname, "--session-start", "--bridge", bridgeUrl];

  if (codex) args.push("--codex", codex, "--once");

  const child = spawn(process.execPath, args, {
    env: { ...testProcessEnv(env), CODEX_THREAD_ID: "ignored-in-hook-mode" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.stdin.end(JSON.stringify({
    session_id: sessionId,
    cwd: process.cwd(),
    hook_event_name: "SessionStart",
    source: "startup",
  }));
  const code = await waitForExit(child);

  return { code, stdout, stderr };
};

const runSessionEnd = async ({ bridgeUrl, sessionId, env = {} }) => {
  const child = spawn(process.execPath, [
    connectScript.pathname,
    "--session-end",
    "--bridge",
    bridgeUrl,
  ], {
    env: { ...testProcessEnv(env), CODEX_THREAD_ID: "ignored-in-hook-mode" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.stdin.end(JSON.stringify({
    session_id: sessionId,
    cwd: process.cwd(),
    hook_event_name: "SessionEnd",
    reason: "other",
  }));
  const code = await waitForExit(child);

  return { code, stdout, stderr };
};

test("Codex SessionStart auto-connect starts once, stays silent, and reuses the bridge", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-connect-"));
  const argsPath = join(root, "args.jsonl");
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs";\nappendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(process.argv.slice(2)) + "\\n");\nconsole.log("queued by fake codex");\n`);
  await chmod(fakeCodex, 0o755);

  const port = await freePort();
  const bridgeUrl = `http://127.0.0.1:${port}`;

  try {
    const first = await runSessionStart({
      bridgeUrl,
      sessionId: "thread-hook-a",
      codex: fakeCodex,
      env: { CODEX_HOME: root, MESURER_FAKE_CODEX_ARGS: argsPath },
    });

    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stdout, "", "SessionStart success must not add developer context.");

    const second = await runSessionStart({
      bridgeUrl,
      sessionId: "thread-hook-b",
      env: { CODEX_HOME: root },
    });

    assert.equal(second.code, 0, second.stderr);
    assert.equal(second.stdout, "", "Reusing the bridge must also stay silent.");

    const health = await bridgeFetch(`${bridgeUrl}/health`);
    assert.equal(health.status, 200);
    const healthPayload = await health.json();
    assert.equal(healthPayload.ok, true);
    assert.equal(healthPayload.thread, "thread-hook-b");
    assert.deepEqual(healthPayload.threads, ["thread-hook-a", "thread-hook-b"]);
    assert.equal(healthPayload.bridge?.name, "mesurer-codex");
    assert.equal(healthPayload.bridge?.protocol, 2);
    assert.match(healthPayload.bridge?.sourceHash, /^[0-9a-f]{64}$/);
    assert.equal(Number.isInteger(healthPayload.bridge?.pid), true);
    assert.equal(healthPayload.bridge?.canShutdown, true);
    assert.equal(
      healthPayload.bridge?.capabilities?.includes("idle-safe-shutdown-v1"),
      true,
    );
    assert.equal(healthPayload.bridgeState?.registeredThreads, 2);
    assert.equal(healthPayload.bridgeState?.idle, false);

    const send = await bridgeFetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ message: "implement the Mesurer feedback" }),
    });

    assert.equal(send.status, 200);
    const sent = await send.json();
    assert.equal(sent.ok, true);
    assert.equal(sent.thread, "thread-hook-b");
    assert.equal(sent.output, "queued by fake codex");
    assert.equal(sent.delivery, "queued");
    assert.equal(sent.status, "queued");
    assert.match(sent.deliveryId, /^[0-9a-f-]{36}$/);

    const invocations = (await readFile(argsPath, "utf8"))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    assert.deepEqual(invocations, [[
      "queue",
      "--thread",
      "thread-hook-b",
      "--message",
      "implement the Mesurer feedback",
    ]]);

    await waitForUnavailable(bridgeUrl);
  } finally {
    try {
      await bridgeFetch(`${bridgeUrl}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test cleanup" }),
      });
    } catch {}

    await rm(root, { recursive: true, force: true });
  }
});

test("Codex SessionEnd keeps a shared bridge until its last registered thread exits", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-session-end-"));
  const port = await freePort();
  const bridgeUrl = `http://127.0.0.1:${port}`;

  try {
    const first = await runSessionStart({
      bridgeUrl,
      sessionId: "thread-owner-a",
      env: { CODEX_HOME: root },
    });

    assert.equal(first.code, 0, first.stderr);

    const second = await runSessionStart({
      bridgeUrl,
      sessionId: "thread-owner-b",
      env: { CODEX_HOME: root },
    });

    assert.equal(second.code, 0, second.stderr);

    const firstEnd = await runSessionEnd({
      bridgeUrl,
      sessionId: "thread-owner-a",
      env: { CODEX_HOME: root },
    });

    assert.equal(firstEnd.code, 0, firstEnd.stderr);
    assert.equal(firstEnd.stdout, "");

    const health = await bridgeFetch(`${bridgeUrl}/health`);
    assert.equal(health.status, 200);
    const healthPayload = await health.json();
    assert.equal(healthPayload.thread, "thread-owner-b");
    assert.deepEqual(healthPayload.threads, ["thread-owner-b"]);

    const secondEnd = await runSessionEnd({
      bridgeUrl,
      sessionId: "thread-owner-b",
      env: { CODEX_HOME: root },
    });

    assert.equal(secondEnd.code, 0, secondEnd.stderr);
    assert.equal(secondEnd.stdout, "");

    await waitForUnavailable(bridgeUrl);
  } finally {
    try { await bridgeFetch(`${bridgeUrl}/shutdown`, { method: "POST" }); } catch {}

    await rm(root, { recursive: true, force: true });
  }
});

test("Codex Desktop owner loss reaps the detached bridge when SessionEnd cannot run", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-owner-anchor-"));
  const ownerAnchor = join(root, "desktop-owner.sock");
  await writeFile(ownerAnchor, "owner");
  const port = await freePort();
  const bridgeUrl = `http://127.0.0.1:${port}`;

  try {
    const start = await runSessionStart({
      bridgeUrl,
      sessionId: "thread-desktop-owner",
      env: {
        CODEX_HOME: root,
        CODEX_APP_TOOLS_PIPE_PATH: ownerAnchor,
        MESURER_CODEX_OWNER_POLL_MS: "50",
      },
    });

    assert.equal(start.code, 0, start.stderr);

    const health = await bridgeFetch(`${bridgeUrl}/health`);
    assert.equal(health.status, 200);

    await rm(ownerAnchor, { force: true });
    await waitForUnavailable(bridgeUrl);
  } finally {
    try { await bridgeFetch(`${bridgeUrl}/shutdown`, { method: "POST" }); } catch {}

    await rm(root, { recursive: true, force: true });
  }
});

test("Codex SessionStart refuses a legacy healthy bridge instead of silently reusing it", async () => {
  const port = await freePort();
  const bridgeUrl = `http://127.0.0.1:${port}`;
  let registrations = 0;

  const server = createHttpServer((request, response) => {
    response.setHeader("Content-Type", "application/json");

    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({ ok: true, thread: "legacy-thread", threads: ["legacy-thread"] }));

      return;
    }

    if (request.method === "POST" && request.url === "/threads/register") {
      registrations += 1;
      response.end(JSON.stringify({ ok: true }));

      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  try {
    const result = await runSessionStart({ bridgeUrl, sessionId: "thread-current" });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /older Mesurer Codex bridge/);
    assert.equal(registrations, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Codex SessionStart reuses a compatible bridge from another checkout and SessionEnd unregisters it", async () => {
  const port = await freePort();
  const bridgeUrl = `http://127.0.0.1:${port}`;
  const threads = new Set(["thread-existing"]);
  let activeThread = "thread-existing";
  let registrations = 0;
  let unregistrations = 0;
  let shutdowns = 0;

  const server = createHttpServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");

    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({
        ok: true,
        thread: activeThread,
        threads: [...threads],
        bridge: {
          name: "mesurer-codex",
          protocol: 2,
          capabilities: [
            "thread-discovery-v1",
            "durable-queue-v1",
            "history-recovery-v2",
            "client-message-correlation-v1",
            "idle-safe-shutdown-v1",
            "nonterminal-retention-v1",
          ],
          sourceHash: "different-compatible-checkout",
          pid: process.pid,
          canShutdown: true,
        },
        bridgeState: {
          registeredThreads: threads.size,
          deliveries: 0,
          nonTerminalDeliveries: 0,
          idle: threads.size === 0,
        },
      }));

      return;
    }

    if (request.method === "POST" && request.url === "/threads/register") {
      const chunks = [];

      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      threads.add(body.thread);
      activeThread = body.thread;
      registrations += 1;
      response.end(JSON.stringify({ ok: true, thread: activeThread, threads: [...threads] }));

      return;
    }

    if (request.method === "POST" && request.url === "/threads/unregister") {
      const chunks = [];

      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      threads.delete(body.thread);

      if (activeThread === body.thread) activeThread = [...threads][0] ?? null;
      unregistrations += 1;
      response.end(JSON.stringify({
        ok: true,
        removed: true,
        thread: activeThread,
        threads: [...threads],
      }));

      return;
    }

    if (request.method === "POST" && request.url === "/shutdown") {
      shutdowns += 1;
      response.end(JSON.stringify({ ok: true }));

      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  try {
    const startResult = await runSessionStart({
      bridgeUrl,
      sessionId: "thread-current",
    });

    assert.equal(startResult.code, 0, startResult.stderr);
    assert.equal(startResult.stdout, "");
    assert.equal(registrations, 1);
    assert.equal(shutdowns, 0);
    assert.deepEqual([...threads], ["thread-existing", "thread-current"]);

    const endResult = await runSessionEnd({
      bridgeUrl,
      sessionId: "thread-current",
    });

    assert.equal(endResult.code, 0, endResult.stderr);
    assert.equal(endResult.stdout, "");
    assert.equal(unregistrations, 1);
    assert.equal(shutdowns, 0);
    assert.deepEqual([...threads], ["thread-existing"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Codex SessionEnd unregisters its thread from an older self-identifying bridge without shutting it down", async () => {
  const port = await freePort();
  const bridgeUrl = `http://127.0.0.1:${port}`;
  let unregistrations = 0;
  let shutdowns = 0;

  const server = createHttpServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");

    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({
        ok: true,
        thread: "thread-old",
        threads: ["thread-old"],
        bridge: {
          name: "mesurer-codex",
          protocol: 1,
          capabilities: [],
          sourceHash: "old-self-identifying",
          pid: process.pid,
          canShutdown: true,
        },
      }));

      return;
    }

    if (request.method === "POST" && request.url === "/threads/unregister") {
      const chunks = [];

      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      assert.equal(body.thread, "thread-old");
      unregistrations += 1;
      response.end(JSON.stringify({
        ok: true,
        removed: true,
        thread: null,
        threads: [],
      }));

      return;
    }

    if (request.method === "POST" && request.url === "/shutdown") {
      shutdowns += 1;
      response.end(JSON.stringify({ ok: true }));

      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  try {
    const result = await runSessionEnd({
      bridgeUrl,
      sessionId: "thread-old",
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(unregistrations, 1);
    assert.equal(shutdowns, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Codex SessionStart replaces an incompatible idle self-identifying bridge", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-connect-stale-"));
  const port = await freePort();
  const bridgeUrl = `http://127.0.0.1:${port}`;
  let shutdowns = 0;

  const staleServer = createHttpServer((request, response) => {
    response.setHeader("Content-Type", "application/json");

    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({
        ok: true,
        thread: null,
        threads: [],
        bridge: {
          name: "mesurer-codex",
          protocol: 1,
          capabilities: ["idle-safe-shutdown-v1"],
          sourceHash: "stale",
          pid: process.pid,
          canShutdown: true,
        },
        bridgeState: {
          registeredThreads: 0,
          deliveries: 0,
          nonTerminalDeliveries: 0,
          idle: true,
        },
      }));

      return;
    }

    if (request.method === "POST" && request.url === "/shutdown") {
      shutdowns += 1;
      response.setHeader("Connection", "close");
      response.once("finish", () => {
        staleServer.close();
        staleServer.closeAllConnections?.();
      });
      response.end(JSON.stringify({ ok: true }));

      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false }));
  });

  await new Promise((resolve, reject) => {
    staleServer.once("error", reject);
    staleServer.listen(port, "127.0.0.1", resolve);
  });

  try {
    const result = await runSessionStart({
      bridgeUrl,
      sessionId: "thread-current",
      env: { CODEX_HOME: root },
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(shutdowns, 1);

    const health = await bridgeFetch(`${bridgeUrl}/health`);
    assert.equal(health.status, 200);
    const healthPayload = await health.json();

    assert.equal(healthPayload.bridge?.name, "mesurer-codex");
    assert.equal(healthPayload.bridge?.protocol, 2);
    assert.match(healthPayload.bridge?.sourceHash, /^[0-9a-f]{64}$/);
    assert.notEqual(healthPayload.bridge?.sourceHash, "stale");
    assert.equal(healthPayload.thread, "thread-current");
  } finally {
    await runSessionEnd({
      bridgeUrl,
      sessionId: "thread-current",
      env: { CODEX_HOME: root },
    }).catch(() => undefined);

    try { await bridgeFetch(`${bridgeUrl}/shutdown`, { method: "POST" }); } catch {}

    await waitForUnavailable(bridgeUrl);
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex SessionStart never replaces an incompatible bridge that still owns sessions or pending delivery state", async () => {
  const port = await freePort();
  const bridgeUrl = `http://127.0.0.1:${port}`;
  let shutdowns = 0;

  const server = createHttpServer((request, response) => {
    response.setHeader("Content-Type", "application/json");

    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({
        ok: true,
        thread: "busy-thread",
        threads: ["busy-thread"],
        bridge: {
          name: "mesurer-codex",
          protocol: 1,
          capabilities: ["idle-safe-shutdown-v1"],
          sourceHash: "stale-busy",
          pid: process.pid,
          canShutdown: true,
        },
        bridgeState: {
          registeredThreads: 1,
          deliveries: 1,
          nonTerminalDeliveries: 1,
          idle: false,
        },
      }));

      return;
    }

    if (request.method === "POST" && request.url === "/shutdown") {
      shutdowns += 1;
      response.end(JSON.stringify({ ok: true }));

      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  try {
    const result = await runSessionStart({ bridgeUrl, sessionId: "thread-current" });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /incompatible Mesurer Codex Bridge/);
    assert.match(result.stderr, /still in use/);
    assert.match(result.stderr, /1 registered thread/);
    assert.match(result.stderr, /1 queued\/working delivery/);
    assert.equal(shutdowns, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("generated Codex plugin distribution mirrors the canonical companion and keeps a bounded SessionStart hook", async () => {
  const marketplace = JSON.parse(await readFile(new URL("../.agents/plugins/marketplace.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL(".codex-plugin/plugin.json", pluginRoot), "utf8"));
  const hooks = JSON.parse(await readFile(new URL("hooks/hooks.json", pluginRoot), "utf8"));

  assert.equal(marketplace.name, "mesurer-solid");
  assert.deepEqual(
    marketplace.plugins.map((entry) => entry.name),
    ["mesurer-solid", "mesurer-codex"],
  );
  const companionEntry = marketplace.plugins.find((entry) => entry.name === "mesurer-codex");

  assert.equal(companionEntry?.source.path, "./plugins/mesurer-codex");
  assert.equal(manifest.name, "mesurer-codex");
  assert.equal(manifest.version, "0.2.1");
  assert.equal(manifest.interface.displayName, "Mesurer Codex Bridge");

  const sessionStart = hooks.hooks.SessionStart[0];
  assert.equal(sessionStart.matcher, "^(startup|resume|clear)$");
  assert.equal(sessionStart.hooks.length, 1);
  assert.equal(sessionStart.hooks[0].timeout, 15);
  assert.match(sessionStart.hooks[0].command, /\$\{PLUGIN_ROOT\}\/scripts\/codex-connect\.mjs/);
  assert.match(sessionStart.hooks[0].command, /--session-start/);

  const sessionEnd = hooks.hooks.SessionEnd[0];
  assert.equal(sessionEnd.matcher, "^other$");
  assert.equal(sessionEnd.hooks.length, 1);
  assert.equal(sessionEnd.hooks[0].timeout, 1);
  assert.match(sessionEnd.hooks[0].command, /\$\{PLUGIN_ROOT\}\/scripts\/codex-connect\.mjs/);
  assert.match(sessionEnd.hooks[0].command, /--session-end/);

  assert.deepEqual(Object.keys(hooks.hooks), ["SessionStart", "SessionEnd"]);

  assert.equal(
    await readFile(new URL("scripts/codex-connect.mjs", pluginRoot), "utf8"),
    await readFile(connectScript, "utf8"),
  );
  assert.equal(
    await readFile(new URL("scripts/codex-bridge.mjs", pluginRoot), "utf8"),
    await readFile(bridgeScript, "utf8"),
  );
  assert.equal(
    await readFile(new URL("scripts/codex-lifecycle.mjs", pluginRoot), "utf8"),
    await readFile(lifecycleScript, "utf8"),
  );
});
