import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const connectScript = new URL("../packages/mesurer/scripts/codex-connect.mjs", import.meta.url);

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
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : null;
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

test("Codex connect starts a packaged bridge and registers the current thread", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-connect-"));
  const argsPath = join(root, "args.jsonl");
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs";\nappendFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(process.argv.slice(2)) + "\\n");\nconsole.log("queued by fake codex");\n`);
  await chmod(fakeCodex, 0o755);

  const port = await freePort();
  const bridgeUrl = `http://127.0.0.1:${port}`;
  const connect = spawn(process.execPath, [connectScript.pathname,
    "--bridge", bridgeUrl,
    "--codex", fakeCodex,
    "--once",
  ], {
    env: {
      ...process.env,
      CODEX_THREAD_ID: "thread-connect",
      MESURER_FAKE_CODEX_ARGS: argsPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  connect.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    assert.equal(await waitForExit(connect), 0, stderr);

    const health = await fetch(`${bridgeUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      ok: true,
      thread: "thread-connect",
      threads: ["thread-connect"],
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
      thread: "thread-connect",
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
      "thread-connect",
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
