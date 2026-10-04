import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { BrowserHarnessSession } from "../../scripts/browser-harness/session.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(here, "../..");

const serverPath = path.join(root, "scripts/mesurer-mcp/server.mjs");

const hostUrl = process.env.SOLID1_URL ?? "http://127.0.0.1:4180";

const freePort = async () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();

    const port = address?.port ?? null;

    server.close((error) => {
      if (error) reject(error);
      else if (port === null) reject(new Error("Could not allocate a CDP port."));
      else resolve(port);
    });
  });
});

const waitForCdp = async (url, processHandle) => {
  let lastError = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Chromium exited before CDP became ready (code ${processHandle.exitCode}).`);
    }

    try {
      const response = await fetch(`${url}/json/version`);

      if (response.ok) return;
      lastError = new Error(`CDP returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw lastError ?? new Error("Timed out waiting for Chromium CDP.");
};

const startMcp = () => {
  const child = spawn("node", [serverPath], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const output = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

  let nextId = 1;

  const pending = new Map();

  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  output.on("line", (line) => {
    let message;

    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    const waiter = pending.get(message.id);

    if (!waiter) return;
    pending.delete(message.id);

    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });

  const request = (method, params) => {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };

  const call = (name, args = {}) => request("tools/call", {
    name,
    arguments: args,
  }).then((result) => result.structuredContent);

  const close = async () => {
    output.close();

    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }

    if (stderr.trim()) process.stderr.write(stderr);
  };

  return { request, call, close };
};

const cdpPort = await freePort();

const cdpUrl = `http://127.0.0.1:${cdpPort}`;

const profile = await mkdtemp(path.join(os.tmpdir(), "mesurer-mcp-chromium-"));

const chromiumProcess = spawn(chromium.executablePath(), [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], {
  stdio: ["ignore", "ignore", "pipe"],
});

let chromiumStderr = "";

chromiumProcess.stderr.setEncoding("utf8");

chromiumProcess.stderr.on("data", (chunk) => { chromiumStderr += chunk; });

let directSession = null;

let mcp = null;

try {
  await waitForCdp(cdpUrl, chromiumProcess);

  directSession = new BrowserHarnessSession({
    cdp: cdpUrl,
    url: hostUrl,
    autoInject: true,
  });

  await directSession.start();

  const directPage = directSession.page;

  await directPage.waitForSelector("[data-testid='solid1-counter']");
  await directPage.waitForFunction(() => Boolean(window.__MESURER__));
  await directPage.evaluate(() => window.__MESURER__.ready());

  // A normal browser harness can drive Mesurer without MCP.
  const layoutGuidesButton = directPage.locator("[data-mesurer-tool-id='layout-guides'] button");

  await layoutGuidesButton.click();
  await directPage.locator("[data-mesurer-layout-guides-panel='true']").waitFor({ state: "visible" });
  await layoutGuidesButton.click();
  await directPage.locator("[data-mesurer-layout-guides-panel='true']").waitFor({ state: "detached" });

  const screenshotButton = directPage.locator("[data-mesurer-tool-id='screenshot'] button");

  await screenshotButton.click();
  await directPage.locator("[data-mesurer-screenshot-select='true']").waitFor({ state: "visible" });
  await directPage.keyboard.press("Escape");
  await directPage.locator("[data-mesurer-screenshot-select='true']").waitFor({ state: "detached" });

  const recordingButton = directPage.locator("[data-mesurer-tool-id='recording'] button");

  await recordingButton.click();
  await directPage.locator("[data-mesurer-recording-select='true']").waitFor({ state: "visible" });
  await directPage.keyboard.press("Escape");
  await directPage.locator("[data-mesurer-recording-select='true']").waitFor({ state: "detached" });

  const islandCountBeforeMcp = await directPage.locator("[data-mesurer-island='true']").count();

  assert.equal(islandCountBeforeMcp, 1);

  // Release only this CDP client. The externally-owned Chromium process and the
  // already-injected Mesurer instance remain alive for the local MCP to reuse.
  await directSession.close();
  directSession = null;

  mcp = startMcp();

  const initialized = await mcp.request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "mesurer-host-compat", version: "0.1.0" },
  });

  assert.equal(initialized.serverInfo.name, "Mesurer Solid Local");

  const connected = await mcp.call("connect_mesurer_page", {
    cdpUrl,
    page: "127.0.0.1:4180",
    inject: true,
  });

  assert.equal(connected.status.injected, true);
  assert.equal(connected.status.mode, "cdp");

  const status = await mcp.call("get_mesurer_status");
  assert.equal(status.connected, true);
  assert.equal(status.mesurer.capabilities.protocol, "mesurer.agent/v1");

  const describedIds = new Set(status.mesurer.description.tools.map((item) => item.id));

  for (const id of [
    "select",
    "xray",
    "color-picker",
    "rulers",
    "guides",
    "text-inspector",
    "arrange",
    "layout-guides",
    "screenshot",
    "recording",
  ]) {
    assert.equal(describedIds.has(id), true, `${id} should be registered in the live Mesurer tool surface`);
  }

  const visibleIds = new Set(
    status.mesurer.ui.filter((item) => item.visible).map((item) => item.id),
  );

  for (const id of [
    "select",
    "xray",
    "rulers",
    "guides",
    "text-inspector",
    "arrange",
    "layout-guides",
    "screenshot",
    "recording",
  ]) {
    assert.equal(visibleIds.has(id), true, `${id} should be available to browser automation`);
  }

  const pages = await mcp.call("list_browser_pages");

  assert.equal(pages.pages.some((item) => item.url.startsWith(hostUrl)), true);

  const inspected = await mcp.call("inspect_ui", {
    selector: "[data-testid='solid1-counter']",
  });

  assert.equal(inspected.tag, "button");
  assert.match(inspected.text, /Solid 1 host/);
  assert.ok(inspected.rect.width > 0);
  assert.ok(inspected.rect.height > 0);

  const measured = await mcp.call("measure_ui", {
    a: "[data-testid='solid1-counter']",
    b: "[data-testid='solid1-sibling']",
  });

  assert.equal(measured.horizontalGap, 12);
  assert.equal(measured.verticalGap, 0);

  const xray = await mcp.call("use_mesurer_tool", {
    tool: "xray",
    active: true,
  });

  assert.equal(xray.clicked, true);
  assert.equal(xray.active, true);

  const xrayStatus = await mcp.call("get_mesurer_status");
  const xrayControl = xrayStatus.mesurer.ui.find((item) => item.id === "xray");

  assert.equal(xrayControl?.pressed, "true");

  const selected = await mcp.call("select_ui", {
    selector: "[data-testid='solid1-sibling']",
  });

  assert.equal(selected.schema, "mesurer.context/v1");
  assert.equal(selected.scope.kind, "selection");
  assert.equal(
    selected.targets.some((target) => target.inspection.text === "Measured sibling"),
    true,
  );

  const selectionContext = await mcp.call("get_ui_context", {
    scope: "selection",
  });

  assert.equal(selectionContext.scope.kind, "selection");

  const annotations = await mcp.call("get_saved_ui_intent", {
    kind: "annotations",
  });

  assert.deepEqual(annotations, []);

  const editIntents = await mcp.call("get_saved_ui_intent", {
    kind: "edit",
  });

  assert.deepEqual(editIntents, []);

  const textIntents = await mcp.call("get_saved_ui_intent", {
    kind: "text",
  });

  assert.deepEqual(textIntents, []);

  const annotationReview = await mcp.call("review_ui");

  assert.deepEqual(annotationReview, []);

  const commands = status.mesurer.description.commands;

  assert.equal(commands.includes("layout-guides.add"), true);
  assert.equal(commands.includes("recording.toggle"), true);
  assert.equal(commands.includes("screenshot.toggle"), true);

  const addedGuide = await mcp.call("run_mesurer_command", {
    command: "layout-guides.add",
    args: { kind: "columns", count: 3 },
  });

  assert.equal(addedGuide.kind, "columns");
  assert.equal(addedGuide.count, 3);

  const workspace = await mcp.call("get_ui_context", {
    scope: "workspace",
  });

  assert.equal(
    workspace.visualContext.layoutGuides.some((guide) => guide.id === addedGuide.id),
    true,
  );

  process.stdout.write("Mesurer local MCP + direct browser UI smoke passed.\n");
} finally {
  if (mcp) await mcp.close().catch(() => {});

  if (directSession) await directSession.close().catch(() => {});

  if (chromiumProcess.exitCode === null) {
    chromiumProcess.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      chromiumProcess.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  await rm(profile, { recursive: true, force: true });

  if (chromiumProcess.exitCode && chromiumProcess.exitCode !== 0 && chromiumStderr.trim()) {
    process.stderr.write(chromiumStderr);
  }
}
