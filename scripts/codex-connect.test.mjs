import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const connectScript = new URL("../packages/mesurer/scripts/codex-connect.mjs", import.meta.url);
const bridgeScript = new URL("../packages/mesurer/scripts/codex-bridge.mjs", import.meta.url);
const pluginRoot = new URL("../plugins/mesurer-codex/", import.meta.url);

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
  const server = createServer();
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
      await fetch(`${url}/health`);
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
    env: { ...process.env, ...env, CODEX_THREAD_ID: "ignored-in-hook-mode" },
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
      env: { MESURER_FAKE_CODEX_ARGS: argsPath },
    });
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stdout, "", "SessionStart success must not add developer context.");

    const second = await runSessionStart({ bridgeUrl, sessionId: "thread-hook-b" });
    assert.equal(second.code, 0, second.stderr);
    assert.equal(second.stdout, "", "Reusing the bridge must also stay silent.");

    const health = await fetch(`${bridgeUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      ok: true,
      thread: "thread-hook-b",
      threads: ["thread-hook-a", "thread-hook-b"],
    });

    const send = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ message: "implement the Mesurer feedback" }),
    });
    assert.equal(send.status, 200);
    assert.deepEqual(await send.json(), {
      ok: true,
      thread: "thread-hook-b",
      output: "queued by fake codex",
    });

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
      await fetch(`${bridgeUrl}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test cleanup" }),
      });
    } catch {}
    await rm(root, { recursive: true, force: true });
  }
});

test("repo Codex plugin packages the same companion and a bounded SessionStart hook", async () => {
  const marketplace = JSON.parse(await readFile(new URL("../.agents/plugins/marketplace.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL(".codex-plugin/plugin.json", pluginRoot), "utf8"));
  const hooks = JSON.parse(await readFile(new URL("hooks/hooks.json", pluginRoot), "utf8"));

  assert.equal(marketplace.name, "mesurer-local");
  assert.deepEqual(marketplace.plugins.map((entry) => entry.name), ["mesurer-codex"]);
  assert.equal(marketplace.plugins[0].source.path, "./plugins/mesurer-codex");
  assert.equal(manifest.name, "mesurer-codex");
  assert.equal(manifest.version, "0.1.8-beta.1");

  const sessionStart = hooks.hooks.SessionStart[0];
  assert.equal(sessionStart.matcher, "^(startup|resume|clear)$");
  assert.equal(sessionStart.hooks.length, 1);
  assert.equal(sessionStart.hooks[0].timeout, 15);
  assert.match(sessionStart.hooks[0].command, /\$\{PLUGIN_ROOT\}\/scripts\/codex-connect\.mjs/);
  assert.match(sessionStart.hooks[0].command, /--session-start/);

  assert.equal(
    await readFile(new URL("scripts/codex-connect.mjs", pluginRoot), "utf8"),
    await readFile(connectScript, "utf8"),
  );
  assert.equal(
    await readFile(new URL("scripts/codex-bridge.mjs", pluginRoot), "utf8"),
    await readFile(bridgeScript, "utf8"),
  );
});
