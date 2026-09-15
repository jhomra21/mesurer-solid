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

test("Codex bridge queues one message into the pinned thread", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesurer-codex-bridge-"));
  const argsPath = join(root, "args.json");
  const fakeCodex = join(root, "fake-codex.mjs");
  const child = spawn(process.execPath, [bridgeScript.pathname,
    "--thread", "01test-thread",
    "--port", "0",
    "--codex", fakeCodex,
    "--once",
  ], {
    env: { ...process.env, MESURER_FAKE_CODEX_ARGS: argsPath },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await writeFile(fakeCodex, `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nwriteFileSync(process.env.MESURER_FAKE_CODEX_ARGS, JSON.stringify(process.argv.slice(2)));\nconsole.log("queued by fake codex");\n`);
    await chmod(fakeCodex, 0o755);

    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const bridgeUrl = await waitForLine(child.stdout, "BRIDGE_URL=");

    const health = await fetch(`${bridgeUrl}/health`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, thread: "01test-thread" });
    assert.equal(health.headers.get("access-control-allow-origin"), "http://localhost:5173");

    const forbidden = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
      },
      body: JSON.stringify({ message: "do not send" }),
    });
    assert.equal(forbidden.status, 403);

    const send = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:4255",
      },
      body: JSON.stringify({ message: "fix this" }),
    });
    assert.equal(send.status, 200, stderr);
    assert.deepEqual(await send.json(), {
      ok: true,
      thread: "01test-thread",
      output: "queued by fake codex",
    });

    assert.deepEqual(JSON.parse(await readFile(argsPath, "utf8")), [
      "queue",
      "--thread",
      "01test-thread",
      "--message",
      "fix this",
    ]);

    assert.equal(await waitForExit(child), 0, stderr);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  }
});
