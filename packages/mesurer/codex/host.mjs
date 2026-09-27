import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const DEFAULT_BRIDGE = "http://127.0.0.1:47365";
const BRIDGE_NAME = "mesurer-codex";
const BRIDGE_PROTOCOL_VERSION = 1;
const START_TIMEOUT_MS = 8_000;
const STOP_TIMEOUT_MS = 3_000;

const bridgeScript = new URL("./codex-bridge.mjs", import.meta.url);

const normalizeBase = (value) => value.endsWith("/") ? value : `${value}/`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sourceHash = async () => createHash("sha256")
  .update(await readFile(bridgeScript))
  .digest("hex");

const readHealth = async (bridgeUrl) => {
  try {
    const response = await fetch(new URL("health", normalizeBase(bridgeUrl)), {
      signal: AbortSignal.timeout(500),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
};

const matchesBridge = (health, expectedHash) =>
  health?.bridge?.name === BRIDGE_NAME
  && health.bridge.protocol === BRIDGE_PROTOCOL_VERSION
  && health.bridge.sourceHash === expectedHash;

const waitFor = async (predicate, timeoutMs, failureMessage) => {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const value = await predicate();

    if (value) return value;
    await sleep(50);
  }

  throw new Error(failureMessage);
};

export async function ensureMesurerCodexBridge(options = {}) {
  const bridgeUrl = options.bridgeUrl?.trim() || DEFAULT_BRIDGE;
  const expectedHash = await sourceHash();
  const existing = await readHealth(bridgeUrl);

  if (matchesBridge(existing, expectedHash)) {
    return { endpoint: bridgeUrl, pid: existing.bridge.pid, reused: true };
  }

  if (existing) {
    if (existing.bridge?.name !== BRIDGE_NAME || existing.bridge?.canShutdown !== true) {
      throw new Error(`Port ${new URL(bridgeUrl).port || "47365"} is already in use by another local service.`);
    }

    await fetch(new URL("shutdown", normalizeBase(bridgeUrl)), {
      method: "POST",
      signal: AbortSignal.timeout(750),
    }).catch(() => undefined);

    await waitFor(
      async () => (await readHealth(bridgeUrl)) === null,
      STOP_TIMEOUT_MS,
      "The previous Mesurer Codex companion did not stop cleanly.",
    );
  }

  const args = [bridgeScript.pathname, "--origin", options.origin ?? "null"];

  if (options.codex?.trim()) args.push("--codex", options.codex.trim());

  const child = spawn(process.execPath, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  child.unref();

  const health = await waitFor(
    async () => {
      const next = await readHealth(bridgeUrl);

      return matchesBridge(next, expectedHash) ? next : null;
    },
    START_TIMEOUT_MS,
    `Mesurer could not start its local Codex companion at ${bridgeUrl}.`,
  );

  return { endpoint: bridgeUrl, pid: health.bridge.pid, reused: false };
}
