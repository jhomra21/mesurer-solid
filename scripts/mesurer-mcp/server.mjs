#!/usr/bin/env node
import process from "node:process";
import readline from "node:readline";

const SERVER_NAME = "Mesurer Solid Local";

const SERVER_VERSION = "0.1.0";

const DEFAULT_GLOBAL_NAME = "__MESURER__";

const JsonRpcError = {
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

let session = null;

const send = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const sendResult = (id, result) => {
  send({ jsonrpc: "2.0", id, result });
};

const sendError = (id, code, message) => {
  send({ jsonrpc: "2.0", id, error: { code, message } });
};

const asObject = (value) =>
  value !== null && value?.constructor === Object
    ? value
    : { result: value ?? null };

const toolResult = (id, value, text) => {
  const structuredContent = asObject(value);

  sendResult(id, {
    content: [{
      type: "text",
      text: text ?? JSON.stringify(structuredContent, null, 2),
    }],
    structuredContent,
  });
};

const toolErrorResult = (id, error) => {
  const message = error instanceof Error ? error.message : String(error);

  sendResult(id, {
    content: [{ type: "text", text: message }],
    isError: true,
  });
};

const requireString = (value, name) => {
  if (value?.constructor !== String || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
};

const optionalString = (value) =>
  value?.constructor === String && value.trim().length > 0 ? value.trim() : undefined;

const optionalBoolean = (value) =>
  value?.constructor === Boolean ? value : undefined;

const optionalNumber = (value) =>
  value?.constructor === Number && Number.isFinite(value) ? value : undefined;

const envBoolean = (name) => {
  const value = process.env[name];

  if (value === undefined) return undefined;

  return value === "1" || value.toLowerCase() === "true";
};

const requireConnectedSession = () => {
  if (!session) {
    throw new Error(
      "No Mesurer browser session is connected. Call connect_mesurer_page first, or use your existing browser tool to operate Mesurer directly.",
    );
  }

  if (!session.page || session.page.isClosed()) {
    throw new Error("The selected browser page is no longer available. Reconnect with connect_mesurer_page.");
  }

  return session;
};

const browserPage = () => requireConnectedSession().page;

const waitForMesurer = async () => {
  const active = requireConnectedSession();
  const status = await active.status();

  if (!status.injected) {
    throw new Error(
      "Mesurer is not available in the selected page. Use the page's existing Mesurer instance, reconnect with inject=true, or inject Mesurer through your normal browser harness.",
    );
  }

  await active.page.evaluate(async (globalName) => {
    const api = globalThis[globalName];

    if (!api?.ready) throw new Error(`Mesurer global is unavailable: ${globalName}`);

    await api.ready();
  }, status.globalName);

  return status;
};

const closeSession = async () => {
  const active = session;
  session = null;

  if (active) await active.close().catch(() => {});
};

const connectSession = async (args = {}) => {
  const previous = session;
  const { BrowserHarnessSession } = await import("../browser-harness/session.mjs");

  const globalName = optionalString(args.globalName)
    ?? optionalString(process.env.MESURER_GLOBAL_NAME)
    ?? DEFAULT_GLOBAL_NAME;

  const url = optionalString(args.url)
    ?? optionalString(process.env.MESURER_URL)
    ?? null;

  const target = optionalString(args.target)
    ?? optionalString(process.env.MESURER_TARGET)
    ?? null;

  const injectPath = optionalString(args.injectPath)
    ?? optionalString(process.env.MESURER_INJECT_PATH)
    ?? null;

  const headless = optionalBoolean(args.headless)
    ?? envBoolean("MESURER_HEADLESS")
    ?? false;

  const shouldInject = optionalBoolean(args.inject) ?? true;
  let next = null;

  try {
    next = new BrowserHarnessSession({
      url,
      target,
      injectPath,
      globalName,
      headless,
      autoInject: false,
    });

    await next.start();
    let status = await next.status();

    if (shouldInject && !status.injected) {
      await next.inject();
      status = await next.status();
    }

    const pages = await next.pages();

    session = next;

    if (previous) await previous.close().catch(() => {});

    return { status, pages };
  } catch (error) {
    if (next) await next.close().catch(() => {});

    session = previous;
    throw error;
  }
};

const liveControls = async () => {
  const status = await waitForMesurer();

  return browserPage().evaluate((globalName) => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const root = island?.shadowRoot ?? island ?? document;
    const seen = new Set();
    const controls = [];

    for (const element of root.querySelectorAll("[data-mesurer-tool-id], [data-mesurer-builtin]")) {
      const toolId = element.getAttribute("data-mesurer-tool-id");
      const builtin = element.getAttribute("data-mesurer-builtin");
      const id = toolId || builtin;

      if (!id || seen.has(id)) continue;
      seen.add(id);

      const button = element instanceof HTMLButtonElement
        ? element
        : element.querySelector("button");

      if (!(button instanceof HTMLButtonElement)) continue;

      const style = getComputedStyle(button);

      controls.push({
        id,
        toolId,
        builtin,
        label: button.getAttribute("aria-label") || button.textContent?.trim() || id,
        pressed: button.getAttribute("aria-pressed"),
        expanded: button.getAttribute("aria-expanded"),
        disabled: button.disabled,
        visible: button.getClientRects().length > 0
          && style.display !== "none"
          && style.visibility !== "hidden",
      });
    }

    return {
      globalName,
      controls,
    };
  }, status.globalName);
};

const statusSnapshot = async () => {
  if (!session) {
    return {
      connected: false,
      message: "No MCP-owned browser session. This is normal when the agent is using Mesurer directly through its existing browser harness.",
    };
  }

  const browser = await session.status();
  let mesurer = null;

  if (browser.injected) {
    mesurer = await browserPage().evaluate(async (globalName) => {
      const api = globalThis[globalName];
      await api.ready();

      return {
        capabilities: api.capabilities(),
        description: await api.describe(),
        state: await api.state(),
      };
    }, browser.globalName);

    mesurer.ui = (await liveControls()).controls;
  }

  return {
    connected: browser.connected,
    browser,
    mesurer,
  };
};

const listPages = async () => {
  if (session) return { pages: await session.pages() };

  return {
    pages: [],
    message: "No MCP-owned browser session. Use connect_mesurer_page only when the agent does not already have a browser harness.",
  };
};

const inspectUi = async (args = {}) => {
  const status = await waitForMesurer();
  const selector = optionalString(args.selector);
  const x = optionalNumber(args.x);
  const y = optionalNumber(args.y);

  if (selector) {
    const index = Math.max(0, Math.trunc(optionalNumber(args.index) ?? 0));
    const limit = Math.max(0, Math.trunc(optionalNumber(args.limit) ?? 50));
    const all = args.all === true;

    return browserPage().evaluate(async ({ globalName, selector, index, limit, all }) => {
      const api = globalThis[globalName];
      await api.ready();

      return all
        ? api.inspectAll(selector, limit)
        : api.inspect(selector, index);
    }, {
      globalName: status.globalName,
      selector,
      index,
      limit,
      all,
    });
  }

  if (x !== undefined && y !== undefined) {
    return browserPage().evaluate(async ({ globalName, x, y }) => {
      const api = globalThis[globalName];
      await api.ready();

      return api.at(x, y);
    }, { globalName: status.globalName, x, y });
  }

  throw new Error("inspect_ui requires selector, or both x and y viewport coordinates.");
};

const measureUi = async (args = {}) => {
  const status = await waitForMesurer();
  const a = requireString(args.a, "a");
  const b = requireString(args.b, "b");

  return browserPage().evaluate(async ({ globalName, a, b }) => {
    const api = globalThis[globalName];
    await api.ready();

    return api.distance(a, b);
  }, { globalName: status.globalName, a, b });
};

const getUiContext = async (args = {}) => {
  const status = await waitForMesurer();
  const scope = args.scope === "selection" ? "selection" : "workspace";
  const annotationId = optionalString(args.annotationId);

  return browserPage().evaluate(async ({ globalName, scope, annotationId }) => {
    const api = globalThis[globalName];

    await api.ready();

    const request = annotationId
      ? { annotation: annotationId }
      : scope === "selection"
        ? { scope: "selection" }
        : undefined;

    return api.context(request);
  }, { globalName: status.globalName, scope, annotationId });
};

const selectUi = async (args = {}) => {
  const status = await waitForMesurer();

  const selectors = Array.isArray(args.selectors)
    ? args.selectors.map((value) => requireString(value, "selectors[]"))
    : [requireString(args.selector, "selector")];

  return browserPage().evaluate(async ({ globalName, selectors }) => {
    const api = globalThis[globalName];
    await api.ready();

    return api.select(selectors);
  }, { globalName: status.globalName, selectors });
};

const useMesurerTool = async (args = {}) => {
  await waitForMesurer();
  const tool = requireString(args.tool, "tool");
  const desiredActive = optionalBoolean(args.active);

  return browserPage().evaluate(async ({ tool, desiredActive }) => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const root = island?.shadowRoot ?? island ?? document;
    const candidates = [...root.querySelectorAll("[data-mesurer-tool-id], [data-mesurer-builtin]")];

    const owner = candidates.find((element) =>
      element.getAttribute("data-mesurer-tool-id") === tool
      || element.getAttribute("data-mesurer-builtin") === tool);

    if (!owner) throw new Error(`Mesurer tool is not mounted: ${tool}`);

    const button = owner instanceof HTMLButtonElement
      ? owner
      : owner.querySelector("button");

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Mesurer tool has no button: ${tool}`);
    }

    const visible = () => {
      const style = getComputedStyle(button);

      return button.getClientRects().length > 0
        && style.display !== "none"
        && style.visibility !== "hidden";
    };

    if (!visible()) {
      throw new Error(`Mesurer tool is not currently visible: ${tool}. Switch toolbar mode through the UI first.`);
    }

    if (button.disabled) throw new Error(`Mesurer tool is disabled: ${tool}`);

    const before = button.getAttribute("aria-pressed");
    const beforeActive = before === null ? null : before === "true";

    if (desiredActive !== undefined && beforeActive === null) {
      throw new Error(`Mesurer tool does not expose toggle state: ${tool}. Omit active to invoke it once.`);
    }

    const shouldClick = desiredActive === undefined || beforeActive !== desiredActive;

    if (shouldClick) button.click();

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const after = button.getAttribute("aria-pressed");

    return {
      tool,
      clicked: shouldClick,
      active: after === null ? null : after === "true",
      expanded: button.getAttribute("aria-expanded"),
      label: button.getAttribute("aria-label") || button.textContent?.trim() || tool,
      visible: visible(),
      disabled: button.disabled,
    };
  }, { tool, desiredActive });
};

const getSavedIntent = async (args = {}) => {
  const status = await waitForMesurer();
  const kind = requireString(args.kind, "kind");
  const id = optionalString(args.id);

  if (!["annotations", "edit", "text"].includes(kind)) {
    throw new Error("kind must be annotations, edit, or text.");
  }

  const value = await browserPage().evaluate(async ({ globalName, kind, id }) => {
    const api = globalThis[globalName];

    await api.ready();

    if (kind === "annotations") {
      if (id) return api.context({ annotation: id });

      return api.annotations();
    }

    if (kind === "edit") {
      if (id) return api.arrange(id);

      return api.arrangements();
    }

    if (id) return api.textEdit(id);

    return api.textEdits();
  }, { globalName: status.globalName, kind, id });

  return id
    ? { kind, id, item: value }
    : { kind, items: value };
};

const setMesurerPlugin = async (args = {}) => {
  const status = await waitForMesurer();
  const pluginId = requireString(args.pluginId, "pluginId");
  const enabled = optionalBoolean(args.enabled);

  if (enabled === undefined) throw new Error("enabled must be a boolean.");

  return browserPage().evaluate(async ({ globalName, pluginId, enabled }) => {
    const api = globalThis[globalName];

    await api.ready();

    const island = document.querySelector("[data-mesurer-island='true']");
    const root = island?.shadowRoot ?? island ?? document;
    const settingsButton = root.querySelector("[data-mesurer-builtin='settings'] button");

    if (!(settingsButton instanceof HTMLButtonElement)) {
      throw new Error("Mesurer Settings is not mounted.");
    }

    const visible = (element) =>
      element instanceof HTMLElement
      && element.getClientRects().length > 0
      && getComputedStyle(element).display !== "none"
      && getComputedStyle(element).visibility !== "hidden";

    const findDialog = () =>
      [...root.querySelectorAll("[role='dialog']")]
        .find((element) => element.getAttribute("aria-label") === "Settings" && visible(element));

    const settingsWasOpen = Boolean(findDialog());

    if (!settingsWasOpen) {
      settingsButton.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const dialog = findDialog();

    if (!(dialog instanceof HTMLElement)) throw new Error("Mesurer Settings did not open.");

    const activeTab = [...dialog.querySelectorAll("[role='tab']")]
      .find((element) => element.getAttribute("aria-selected") === "true");

    const generalTab = [...dialog.querySelectorAll("[role='tab']")]
      .find((element) => element.textContent?.trim() === "General");

    if (!(generalTab instanceof HTMLButtonElement)) {
      throw new Error("Mesurer General settings tab is unavailable.");
    }

    if (generalTab.getAttribute("aria-selected") !== "true") {
      generalTab.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const disclosure = dialog.querySelector("[data-mesurer-plugin-settings-disclosure='plugins']");

    if (!(disclosure instanceof HTMLButtonElement)) {
      throw new Error("Mesurer plugin settings are unavailable.");
    }

    const pluginsWereExpanded = disclosure.getAttribute("aria-expanded") === "true";

    if (!pluginsWereExpanded) {
      disclosure.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const selector = `[data-mesurer-plugin-toggle="${CSS.escape(pluginId)}"]`;
    const findToggle = () => dialog.querySelector(selector);
    const toggle = findToggle();

    if (!(toggle instanceof HTMLButtonElement)) {
      throw new Error(`Mesurer plugin is not registered: ${pluginId}`);
    }

    const pluginLoaded = async () => {
      const description = await api.describe();

      return description.plugins.some((plugin) => plugin.id === pluginId);
    };

    const current = await pluginLoaded();

    if (current !== enabled) {
      toggle.click();

      for (let frame = 0; frame < 180; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));

        const liveToggle = findToggle();

        if (
          await pluginLoaded() === enabled
          && liveToggle instanceof HTMLButtonElement
          && !liveToggle.disabled
        ) {
          break;
        }
      }
    }

    const settledToggle = findToggle();

    if (!(settledToggle instanceof HTMLButtonElement)) {
      throw new Error(`Mesurer plugin switch disappeared: ${pluginId}`);
    }

    const result = {
      pluginId,
      enabled: await pluginLoaded(),
      busy: settledToggle.disabled,
      error: dialog.querySelector(`[data-mesurer-plugin-error="${CSS.escape(pluginId)}"]`)?.textContent?.trim() ?? null,
    };

    if (!pluginsWereExpanded && disclosure.getAttribute("aria-expanded") === "true") {
      disclosure.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    if (activeTab instanceof HTMLButtonElement && activeTab !== generalTab) {
      activeTab.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    if (!settingsWasOpen && findDialog()) {
      settingsButton.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    if (result.enabled !== enabled || result.busy) {
      throw new Error(
        result.error
          ? `Mesurer plugin ${pluginId} could not reach the requested state: ${result.error}`
          : `Mesurer plugin ${pluginId} did not reach enabled=${enabled}.`,
      );
    }

    return result;
  }, { globalName: status.globalName, pluginId, enabled });
};

const reviewUi = async (args = {}) => {
  const status = await waitForMesurer();
  const annotationId = optionalString(args.annotationId);
  const editId = optionalString(args.editId);
  const tolerance = optionalNumber(args.tolerance);

  if (annotationId && editId) {
    throw new Error("review_ui accepts annotationId or editId, not both.");
  }

  const value = await browserPage().evaluate(async ({ globalName, annotationId, editId, tolerance }) => {
    const api = globalThis[globalName];

    await api.ready();

    if (editId) return api.reviewArrange(editId, tolerance);

    return api.review(annotationId);
  }, {
    globalName: status.globalName,
    annotationId,
    editId,
    tolerance,
  });

  if (editId) return { kind: "edit", id: editId, review: value };

  if (annotationId) return { kind: "annotation", id: annotationId, review: value };

  return { kind: "annotations", reviews: value };
};

const tool = (name, title, description, inputSchema, annotations) => ({
  name,
  title,
  description,
  inputSchema,
  annotations,
});

const TOOLS = [
  tool(
    "connect_mesurer_page",
    "Connect Mesurer Page",
    "Launch an optional local Chromium page for Mesurer MCP shortcuts when the agent does not already have a browser/computer-use harness. Existing Mesurer in that page is reused. When inject is true and Mesurer is absent, the repository-built injector is loaded. Do not use this tool to create a second browser when normal browser control already exists.",
    {
      type: "object",
      properties: {
        url: { type: "string", description: "Optional URL to navigate to after connecting." },
        inject: { type: "boolean", default: true, description: "Inject Mesurer only when the selected page does not already expose it." },
        injectPath: { type: "string", description: "Optional path to built inject-script.js. Its directory must also contain mediabunny-vendor.js." },
        globalName: { type: "string", default: DEFAULT_GLOBAL_NAME },
        target: { type: "string", description: "Optional host element selector for injected Mesurer." },
        headless: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  ),
  tool(
    "list_browser_pages",
    "List Browser Pages",
    "List pages in the optional MCP-owned fallback browser. Use the normal browser harness for page discovery whenever one already exists.",
    { type: "object", properties: {}, additionalProperties: false },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ),
  tool(
    "get_mesurer_status",
    "Get Mesurer Status",
    "Read the optional MCP browser connection, Mesurer capabilities, registered tools/commands/services, plugin state, and visible human toolbar controls without changing the page.",
    { type: "object", properties: {}, additionalProperties: false },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ),
  tool(
    "inspect_ui",
    "Inspect Rendered UI",
    "Inspect exact rendered geometry, box model, typography, appearance, layout, and overflow through Mesurer. Supply a selector, or a viewport x/y point. Use the browser UI itself when visual interaction is the task.",
    {
      type: "object",
      properties: {
        selector: { type: "string" },
        index: { type: "integer", minimum: 0, default: 0 },
        all: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 0, maximum: 200, default: 50 },
        x: { type: "number" },
        y: { type: "number" },
      },
      additionalProperties: false,
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ),
  tool(
    "measure_ui",
    "Measure Rendered UI",
    "Measure the exact rendered relationship between two selector targets, including horizontal/vertical gaps and center deltas.",
    {
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "string" },
      },
      required: ["a", "b"],
      additionalProperties: false,
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ),
  tool(
    "get_ui_context",
    "Get UI Context",
    "Read structured Mesurer Context for the whole workspace, current selection, or one saved annotation. This returns rendered evidence and human visual intent without changing source.",
    {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["workspace", "selection"], default: "workspace" },
        annotationId: { type: "string" },
      },
      additionalProperties: false,
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ),
  tool(
    "select_ui",
    "Select Rendered UI",
    "Select one or more exact rendered targets through Mesurer and return selection Context. This changes Mesurer's visible selection but does not edit application source.",
    {
      type: "object",
      properties: {
        selector: { type: "string" },
        selectors: { type: "array", items: { type: "string" }, minItems: 1 },
      },
      additionalProperties: false,
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ),
  tool(
    "use_mesurer_tool",
    "Use Mesurer Tool",
    "Invoke a visible Mesurer toolbar control through the same rendered button a person uses. Supports built-ins and plugin tools such as select, xray, rulers, guides, text-inspector, arrange, layout-guides, screenshot, recording, and settings. Pass active for idempotent toggle controls; omit it for one-shot actions.",
    {
      type: "object",
      properties: {
        tool: { type: "string" },
        active: { type: "boolean" },
      },
      required: ["tool"],
      additionalProperties: false,
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  ),
  tool(
    "get_saved_ui_intent",
    "Get Saved UI Intent",
    "Read saved annotations, Edit movement intent, or direct text/style intent. Supply an id for one record or omit it to list that intent kind.",
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["annotations", "edit", "text"] },
        id: { type: "string" },
      },
      required: ["kind"],
      additionalProperties: false,
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ),
  tool(
    "set_mesurer_plugin",
    "Set Mesurer Plugin",
    "Enable or disable one registered Mesurer plugin through the visible Settings switch, then restore the Settings UI state it had before the call. Use a plugin id from get_mesurer_status.description.plugins.",
    {
      type: "object",
      properties: {
        pluginId: { type: "string" },
        enabled: { type: "boolean" },
      },
      required: ["pluginId", "enabled"],
      additionalProperties: false,
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ),
  tool(
    "review_ui",
    "Review UI Intent",
    "Compare the current Live page against a saved annotation baseline or Edit Desired geometry. Omit both ids to review all saved annotations.",
    {
      type: "object",
      properties: {
        annotationId: { type: "string" },
        editId: { type: "string" },
        tolerance: { type: "number", minimum: 0 },
      },
      additionalProperties: false,
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  ),
];

const handlers = {
  connect_mesurer_page: connectSession,
  list_browser_pages: listPages,
  get_mesurer_status: statusSnapshot,
  inspect_ui: inspectUi,
  measure_ui: measureUi,
  get_ui_context: getUiContext,
  select_ui: selectUi,
  use_mesurer_tool: useMesurerTool,
  get_saved_ui_intent: getSavedIntent,
  set_mesurer_plugin: setMesurerPlugin,
  review_ui: reviewUi,
};

const handleToolCall = async (id, params) => {
  const name = params?.name;
  const handler = handlers[name];

  if (!handler) {
    sendError(id, JsonRpcError.INVALID_PARAMS, `Unknown tool: ${name ?? ""}`);

    return;
  }

  try {
    const value = await handler(params?.arguments ?? {});
    toolResult(id, value);
  } catch (error) {
    toolErrorResult(id, error);
  }
};

const handleRequest = async (message) => {
  const { id, method, params } = message;

  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: params?.protocolVersion ?? "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      instructions:
        "Mesurer is UI-first. If you already have a browser/computer-use harness, interact with the visible Mesurer controls directly like any other web UI. Use these MCP tools only when a structured shortcut is clearer or more precise. Preserve existing human Mesurer state, prefer exact rendered evidence over screenshot guessing, and verify final source changes against Live.",
    });

    return;
  }

  if (method === "ping") {
    sendResult(id, {});

    return;
  }

  if (method === "tools/list") {
    sendResult(id, { tools: TOOLS });

    return;
  }

  if (method === "tools/call") {
    await handleToolCall(id, params);

    return;
  }

  if (id !== undefined) {
    sendError(id, JsonRpcError.METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
};

const lines = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

lines.on("line", (line) => {
  if (line.trim().length === 0) return;

  let message;

  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  void handleRequest(message).catch((error) => {
    if (message.id !== undefined) {
      sendError(
        message.id,
        JsonRpcError.INTERNAL_ERROR,
        error instanceof Error ? error.message : String(error),
      );
    }
  });
});

const shutdown = async () => {
  await closeSession();
  process.exit(0);
};

process.once("SIGINT", () => { void shutdown(); });

process.once("SIGTERM", () => { void shutdown(); });
