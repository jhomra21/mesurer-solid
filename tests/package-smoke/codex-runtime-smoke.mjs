import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const bridgePath = process.env.MESURER_CODEX_BRIDGE_PATH?.trim();
const artifactDir = process.env.MESURER_CODEX_RUNTIME_ARTIFACT_DIR?.trim()
  || join(process.cwd(), "codex-runtime-artifacts");

if (!bridgePath) {
  throw new Error("MESURER_CODEX_BRIDGE_PATH must point at the packed Codex Bridge module.");
}

const { codexBridge } = await import(pathToFileURL(bridgePath).href);
const root = await mkdtemp(join(tmpdir(), "mesurer-codex-runtime-"));
const originalPath = process.env.PATH;
const originalCodexBin = process.env.CODEX_BIN;
const originalCodexHome = process.env.CODEX_HOME;
const originalHelper = process.env.MESURER_CODEX_SMOKE_HELPER;

const result = {
  bridgePath,
  desktop: {
    bundledExecutableRan: null,
    rejectedPrivateRuntime: false,
    error: null,
  },
  standalone: {
    packagedExecutableRan: false,
    healthOk: false,
    threads: null,
  },
};

const restoreEnvironment = () => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;

  if (originalCodexBin === undefined) delete process.env.CODEX_BIN;
  else process.env.CODEX_BIN = originalCodexBin;

  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;

  if (originalHelper === undefined) delete process.env.MESURER_CODEX_SMOKE_HELPER;
  else process.env.MESURER_CODEX_SMOKE_HELPER = originalHelper;
};

try {
  const desktopHome = join(root, "desktop-home");
  const desktopBinDir = join(root, "ChatGPT.app", "Contents", "Resources");
  const desktopBin = join(desktopBinDir, "codex");
  const desktopMarker = join(root, "desktop-executed.txt");

  await mkdir(desktopBinDir, { recursive: true });
  await writeFile(
    desktopBin,
    `#!/bin/sh
printf '%s\\n' executed > "${desktopMarker}"
exit 0
`,
    "utf8",
  );
  await chmod(desktopBin, 0o755);

  process.env.PATH = desktopBinDir;
  process.env.CODEX_HOME = desktopHome;
  delete process.env.CODEX_BIN;

  try {
    await codexBridge({ action: "health" }, { codexHome: desktopHome });
    throw new Error("Codex Bridge unexpectedly accepted a private Desktop runtime.");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);

    result.desktop.error = message;
    result.desktop.rejectedPrivateRuntime = message.includes("private app-server");

    if (!result.desktop.rejectedPrivateRuntime) throw cause;
  }

  result.desktop.bundledExecutableRan = await readFile(desktopMarker, "utf8")
    .then(() => true)
    .catch(() => false);

  assert.equal(result.desktop.bundledExecutableRan, false);

  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;

  const standaloneHome = join(root, "standalone-home");
  const standaloneBin = join(
    standaloneHome,
    "packages",
    "standalone",
    "current",
    "codex",
  );
  const standaloneMarker = join(standaloneHome, "standalone-started.json");
  const helperPath = join(root, "fake-app-server.mjs");

  await mkdir(dirname(standaloneBin), { recursive: true });
  await writeFile(
    helperPath,
    `import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

const home = process.argv[2];
const controlDir = join(home, "app-server-control");
const socketPath = join(controlDir, "app-server-control.sock");

await mkdir(controlDir, { recursive: true });
await rm(socketPath, { force: true });

let requests = 0;
const server = createServer((socket) => {
  socket.setEncoding("utf8");
  let buffer = "";

  const send = (value) => socket.write(JSON.stringify(value) + "\\n");

  socket.on("data", (chunk) => {
    buffer += chunk;

    while (true) {
      const newline = buffer.indexOf("\\n");

      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);

      if (!line) continue;
      const message = JSON.parse(line);

      if (message.method === "initialize") {
        send({ id: message.id, result: { userAgent: "fake-codex-runtime-smoke" } });
        continue;
      }

      if (message.method === "initialized") continue;

      requests += 1;

      if (message.method === "thread/loaded/list" || message.method === "thread/list") {
        send({ id: message.id, result: { data: [], nextCursor: null } });
      } else {
        send({
          id: message.id,
          error: { code: -32601, message: "unsupported method " + message.method },
        });
      }

      if (requests >= 2) {
        setTimeout(() => server.close(() => process.exit(0)), 100);
      }
    }
  });
});

server.listen(socketPath);

setTimeout(() => server.close(() => process.exit(0)), 5_000);
`,
    "utf8",
  );

  await writeFile(
    standaloneBin,
    `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

if (process.argv.slice(2).join(" ") !== "app-server daemon start") {
  process.exit(2);
}

writeFileSync(
  "${standaloneMarker}",
  JSON.stringify({ args: process.argv.slice(2), codexHome: process.env.CODEX_HOME }),
);

const child = spawn(
  process.execPath,
  [process.env.MESURER_CODEX_SMOKE_HELPER, process.env.CODEX_HOME],
  { detached: true, env: process.env, stdio: "ignore" },
);
child.unref();
`,
    "utf8",
  );
  await chmod(standaloneBin, 0o755);

  process.env.CODEX_HOME = standaloneHome;
  process.env.MESURER_CODEX_SMOKE_HELPER = helperPath;
  delete process.env.CODEX_BIN;

  const health = await codexBridge(
    { action: "health" },
    { codexHome: standaloneHome },
  );

  const marker = JSON.parse(await readFile(standaloneMarker, "utf8"));

  assert.deepEqual(marker.args, ["app-server", "daemon", "start"]);
  assert.equal(marker.codexHome, standaloneHome);
  assert.equal(health.ok, true);
  assert.deepEqual(health.threads, []);

  result.standalone.packagedExecutableRan = true;
  result.standalone.healthOk = true;
  result.standalone.threads = health.threads;

  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    join(artifactDir, "result.json"),
    `${JSON.stringify(result, null, 2)}\\n`,
    "utf8",
  );

  console.log(JSON.stringify(result, null, 2));
} finally {
  restoreEnvironment();
  await rm(root, { recursive: true, force: true });
}
