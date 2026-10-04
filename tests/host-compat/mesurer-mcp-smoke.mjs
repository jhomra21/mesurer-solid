import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { BrowserHarnessSession } from "../../scripts/browser-harness/session.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(here, "../..");

const serverPath = path.join(root, "scripts/mesurer-mcp/server.mjs");

const hostUrl = process.env.SOLID1_URL ?? "http://127.0.0.1:4180";

const startMcp = () => {
  const child = spawn("node", [serverPath], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const output = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

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
  }).then((result) => {
    if (result.isError) {
      throw new Error(result.content?.[0]?.text ?? `Mesurer MCP tool failed: ${name}`);
    }

    return result.structuredContent;
  });

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

const exerciseDirectBrowserUi = async () => {
  const session = new BrowserHarnessSession({
    url: hostUrl,
    headless: true,
    autoInject: true,
  });

  try {
    await session.start();

    const page = session.page;

    await page.waitForSelector("[data-testid='solid1-counter']");
    await page.waitForFunction(() => Boolean(window.__MESURER__));
    await page.evaluate(() => window.__MESURER__.ready());

    assert.equal(await page.locator("[data-mesurer-island='true']").count(), 1);

    const xrayButton = page.locator("button[data-mesurer-builtin='xray']").first();

    const xrayBefore = await xrayButton.getAttribute("aria-pressed");

    const xrayVisibleBefore = await page.evaluate(
      () => document.body.classList.contains("mesurer-solid-xray"),
    );

    await xrayButton.click();
    await page.waitForFunction(
      (before) => document.body.classList.contains("mesurer-solid-xray") !== before,
      xrayVisibleBefore,
    );

    const xrayAfter = await xrayButton.getAttribute("aria-pressed");

    const xrayVisible = await page.evaluate(
      () => document.body.classList.contains("mesurer-solid-xray"),
    );

    assert.notEqual(xrayAfter, xrayBefore);
    assert.notEqual(xrayVisible, xrayVisibleBefore);
    assert.equal(xrayVisible, xrayAfter === "true");

    const settingsButton = page.locator("button[data-mesurer-builtin='settings']").first();

    await settingsButton.click();
    await page.getByRole("dialog", { name: "Settings" }).waitFor({ state: "visible" });
    await settingsButton.click();
    await page.getByRole("dialog", { name: "Settings" }).waitFor({ state: "hidden" });

    const layoutGuidesButton = page.locator("[data-mesurer-tool-id='layout-guides'] button");

    await layoutGuidesButton.click();
    await page.locator("[data-mesurer-layout-guides-panel='true']").waitFor({ state: "visible" });
    await layoutGuidesButton.click();
    await page.locator("[data-mesurer-layout-guides-panel='true']").waitFor({ state: "hidden" });

    // Screenshot and Recording remain ordinary Mesurer controls. Their actual
    // capture flows are covered by capability-aware browser/Electron contracts;
    // this generic headless host cannot approve getDisplayMedia system UI.
    for (const id of ["screenshot", "recording"]) {
      const button = page.locator(`[data-mesurer-tool-id='${id}'] button`);

      await button.waitFor({ state: "visible" });
      assert.equal(await button.isEnabled(), true, `${id} should remain directly operable`);
    }
  } finally {
    await session.close();
  }
};

const exerciseMcpFallback = async () => {
  const mcp = startMcp();

  try {
    const initialized = await mcp.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "mesurer-host-compat", version: "0.1.0" },
    });

    assert.equal(initialized.serverInfo.name, "Mesurer Solid Local");

    const connected = await mcp.call("connect_mesurer_page", {
      url: hostUrl,
      headless: true,
      inject: true,
    });

    assert.equal(connected.status.injected, true);
    assert.equal(connected.status.mode, "launch");

    const status = await mcp.call("get_mesurer_status");

    assert.equal(status.connected, true);
    assert.equal(status.mesurer.capabilities.protocol, "mesurer.agent/v1");

    await assert.rejects(
      () => mcp.call("connect_mesurer_page", {
        url: "not a valid url",
        headless: true,
        inject: true,
      }),
      /Invalid URL/,
    );

    const recoveredStatus = await mcp.call("get_mesurer_status");

    assert.equal(recoveredStatus.connected, true);
    assert.equal(recoveredStatus.mesurer.capabilities.protocol, "mesurer.agent/v1");
    assert.equal(recoveredStatus.browser.page.url.startsWith(hostUrl), true);

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

    assert.deepEqual(annotations, { kind: "annotations", items: [] });

    const editIntents = await mcp.call("get_saved_ui_intent", {
      kind: "edit",
    });

    assert.deepEqual(editIntents, { kind: "edit", items: [] });

    const textIntents = await mcp.call("get_saved_ui_intent", {
      kind: "text",
    });

    assert.deepEqual(textIntents, { kind: "text", items: [] });

    const annotationReview = await mcp.call("review_ui");

    assert.deepEqual(annotationReview, { kind: "annotations", reviews: [] });

    const pluginIds = new Set(status.mesurer.description.plugins.map((plugin) => plugin.id));

    assert.equal(pluginIds.has("mesurer.recording"), true);

    const recordingDisabled = await mcp.call("set_mesurer_plugin", {
      pluginId: "mesurer.recording",
      enabled: false,
    });

    assert.equal(recordingDisabled.enabled, false);
    assert.equal(recordingDisabled.busy, false);

    const recordingEnabled = await mcp.call("set_mesurer_plugin", {
      pluginId: "mesurer.recording",
      enabled: true,
    });

    assert.equal(recordingEnabled.enabled, true);
    assert.equal(recordingEnabled.busy, false);
  } finally {
    await mcp.close();
  }
};

await exerciseDirectBrowserUi();

await exerciseMcpFallback();

process.stdout.write("Mesurer direct browser UI + optional local MCP smoke passed.\n");
