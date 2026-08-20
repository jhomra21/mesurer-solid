const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const stringValue = (params, key) => {
  const value = params[key];
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
};
const requiredString = (params, key) => {
  const value = stringValue(params, key);
  if (value.length === 0) throw new Error(`${key} must be a non-empty string`);
  return value;
};
const optionalIndex = (params) => {
  const value = params.index ?? 0;
  if (!Number.isInteger(value) || value < 0) throw new Error("index must be a non-negative integer");
  return value;
};
const finiteNumber = (params, key) => {
  const value = params[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
  return value;
};

export const BROWSER_HARNESS_TOOLS = [
  { name: "browser.status", description: "Return the selected browser tab, injection state, and harness mode.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser.pages", description: "List browser tabs available to the current Playwright/CDP connection.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser.selectPage", description: "Select a tab by zero-based index or URL/title substring.", inputSchema: { type: "object", properties: { page: { anyOf: [{ type: "integer", minimum: 0 }, { type: "string" }] } }, required: ["page"], additionalProperties: false } },
  { name: "browser.navigate", description: "Navigate the selected tab and reinject Mesurer when auto-injection is enabled.", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } },
  { name: "browser.back", description: "Navigate the selected tab backward.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser.forward", description: "Navigate the selected tab forward.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser.reload", description: "Reload the selected tab and reinject Mesurer.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "browser.click", description: "Click a host-page element by CSS selector.", inputSchema: { type: "object", properties: { selector: { type: "string" }, index: { type: "integer", minimum: 0 } }, required: ["selector"], additionalProperties: false } },
  { name: "browser.hover", description: "Hover a host-page element by CSS selector.", inputSchema: { type: "object", properties: { selector: { type: "string" }, index: { type: "integer", minimum: 0 } }, required: ["selector"], additionalProperties: false } },
  { name: "browser.fill", description: "Fill or clear an input/textarea by CSS selector.", inputSchema: { type: "object", properties: { selector: { type: "string" }, value: { type: "string" }, index: { type: "integer", minimum: 0 } }, required: ["selector", "value"], additionalProperties: false } },
  { name: "browser.press", description: "Press a keyboard key globally or on a selected host-page element.", inputSchema: { type: "object", properties: { key: { type: "string" }, selector: { type: "string" }, index: { type: "integer", minimum: 0 } }, required: ["key"], additionalProperties: false } },
  { name: "browser.screenshot", description: "Capture the selected tab to a PNG file.", inputSchema: { type: "object", properties: { path: { type: "string" }, fullPage: { type: "boolean" } }, additionalProperties: false } },
  { name: "mesurer.inject", description: "Inject or reinject the exact Mesurer Solid browser bundle into the selected tab.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "mesurer.describe", description: "Describe the active Mesurer plugin/command surface.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "mesurer.inspect", description: "Inspect one host-page element and return geometry, box model, typography, appearance, layout, and overflow.", inputSchema: { type: "object", properties: { selector: { type: "string" }, index: { type: "integer", minimum: 0 } }, required: ["selector"], additionalProperties: false } },
  { name: "mesurer.inspectAll", description: "Inspect multiple elements matching a CSS selector.", inputSchema: { type: "object", properties: { selector: { type: "string" }, limit: { type: "integer", minimum: 0, maximum: 200 } }, required: ["selector"], additionalProperties: false } },
  { name: "mesurer.at", description: "Inspect the element at viewport coordinates.", inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false } },
  { name: "mesurer.distance", description: "Measure spacing and center deltas between two CSS-selected elements.", inputSchema: { type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a", "b"], additionalProperties: false } },
  { name: "mesurer.viewport", description: "Return viewport, scroll, document dimensions, DPR, and overflow state.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "mesurer.feedback", description: "Return a stable viewport snapshot, selected element inspections, plugin description, and plugin state.", inputSchema: { type: "object", properties: { selectors: { type: "array", items: { type: "string" }, maxItems: 50 } }, additionalProperties: false } },
  { name: "mesurer.command", description: "Execute a Mesurer command by its registered command id.", inputSchema: { type: "object", properties: { id: { type: "string" }, args: {} }, required: ["id"], additionalProperties: false } },
  { name: "mesurer.state", description: "Serialize all current Mesurer plugin state.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "mesurer.stable", description: "Wait for fonts and one or more animation frames before another inspection.", inputSchema: { type: "object", properties: { frames: { type: "integer", minimum: 1, maximum: 120 } }, additionalProperties: false } },
];

export function createBrowserHarnessDispatcher(session) {
  return async function dispatch(request) {
    const method = request?.method;
    const params = object(request?.params);
    if (typeof method !== "string") throw new Error("RPC method must be a string");

    switch (method) {
      case "harness.tools": return BROWSER_HARNESS_TOOLS;
      case "browser.status": return session.status();
      case "browser.pages": return session.pages();
      case "browser.selectPage": return session.selectPage(params.page);
      case "browser.navigate": return session.navigate(requiredString(params, "url"));
      case "browser.back": return session.back();
      case "browser.forward": return session.forward();
      case "browser.reload": return session.reload();
      case "browser.click": return session.click(requiredString(params, "selector"), optionalIndex(params));
      case "browser.hover": return session.hover(requiredString(params, "selector"), optionalIndex(params));
      case "browser.fill": return session.fill(requiredString(params, "selector"), stringValue(params, "value"), optionalIndex(params));
      case "browser.press": return session.press(requiredString(params, "key"), typeof params.selector === "string" ? params.selector : null, optionalIndex(params));
      case "browser.screenshot": return session.screenshot({
        path: typeof params.path === "string" ? params.path : null,
        fullPage: params.fullPage === true,
      });
      case "mesurer.inject": return session.inject();
      case "mesurer.describe": return session.callAgent("describe");
      case "mesurer.inspect": return session.callAgent("inspect", [requiredString(params, "selector"), optionalIndex(params)]);
      case "mesurer.inspectAll": {
        const limit = params.limit ?? 50;
        if (!Number.isInteger(limit) || limit < 0 || limit > 200) throw new Error("limit must be an integer between 0 and 200");
        return session.callAgent("inspectAll", [requiredString(params, "selector"), limit]);
      }
      case "mesurer.at": return session.callAgent("at", [finiteNumber(params, "x"), finiteNumber(params, "y")]);
      case "mesurer.distance": return session.callAgent("distance", [requiredString(params, "a"), requiredString(params, "b")]);
      case "mesurer.viewport": return session.callAgent("viewport");
      case "mesurer.feedback": {
        const selectors = params.selectors ?? [];
        if (!Array.isArray(selectors) || selectors.some((item) => typeof item !== "string")) throw new Error("selectors must be an array of strings");
        return session.callAgent("feedback", [selectors]);
      }
      case "mesurer.command": return session.callAgent("command", [requiredString(params, "id"), params.args]);
      case "mesurer.state": return session.callAgent("state");
      case "mesurer.stable": {
        const frames = params.frames ?? 2;
        if (!Number.isInteger(frames) || frames < 1 || frames > 120) throw new Error("frames must be an integer between 1 and 120");
        return session.callAgent("stable", [frames]);
      }
      default: throw new Error(`Unknown browser harness RPC method: ${method}`);
    }
  };
}

export async function executeRpc(dispatch, request) {
  const id = request?.id ?? null;
  try {
    const result = await dispatch(request);
    return { id, ok: true, result: result === undefined ? null : result };
  } catch (error) {
    return {
      id,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
