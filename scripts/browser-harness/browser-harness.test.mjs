import assert from "node:assert/strict";
import test from "node:test";
import { parseBrowserHarnessArgs } from "./args.mjs";
import { createBrowserHarnessDispatcher, executeRpc } from "./rpc.mjs";
import { createBrowserHarnessHttpServer } from "./server.mjs";

test("argument parser keeps launch, attach, and machine modes orthogonal", () => {
  const options = parseBrowserHarnessArgs([
    "https://example.com",
    "--cdp", "http://127.0.0.1:9222",
    "--page", "Docs",
    "--serve", "4888",
    "--stdio",
    "--once", "mesurer.inspect",
    "--params", '{"selector":"h1"}',
  ]);
  assert.equal(options.url, "https://example.com");
  assert.equal(options.cdp, "http://127.0.0.1:9222");
  assert.equal(options.page, "Docs");
  assert.equal(options.serve, true);
  assert.equal(options.port, 4888);
  assert.equal(options.stdio, true);
  assert.equal(options.once, "mesurer.inspect");
  assert.deepEqual(options.params, { selector: "h1" });
});

test("argument parser rejects unknown flags and malformed JSON", () => {
  assert.throws(() => parseBrowserHarnessArgs(["--wat"]), /Unknown option/);
  assert.throws(() => parseBrowserHarnessArgs(["--params", "nope"]), /valid JSON/);
});

test("dispatcher maps stable RPC names onto browser and Mesurer session calls", async () => {
  const calls = [];
  const session = new Proxy({}, {
    get(_target, property) {
      if (property === "callAgent") return async (method, args = []) => { calls.push(["agent", method, args]); return { method, args }; };
      return async (...args) => { calls.push([String(property), ...args]); return { method: property, args }; };
    },
  });
  const dispatch = createBrowserHarnessDispatcher(session);

  await dispatch({ method: "browser.navigate", params: { url: "https://example.com" } });
  await dispatch({ method: "browser.click", params: { selector: "button", index: 2 } });
  await dispatch({ method: "mesurer.inspect", params: { selector: "main", index: 1 } });
  await dispatch({ method: "mesurer.command", params: { id: "guides.toggle", args: { enabled: true } } });

  assert.deepEqual(calls, [
    ["navigate", "https://example.com"],
    ["click", "button", 2],
    ["agent", "inspect", ["main", 1]],
    ["agent", "command", ["guides.toggle", { enabled: true }]],
  ]);
});

test("executeRpc returns structured errors instead of throwing over transport boundaries", async () => {
  const result = await executeRpc(async () => { throw new Error("boom"); }, { id: 7, method: "x" });
  assert.deepEqual(result, {
    id: 7,
    ok: false,
    error: { name: "Error", message: "boom" },
  });
});

test("HTTP bridge is loopback-only and bearer-authenticated", async () => {
  const dispatch = async (request) => request.method === "harness.tools" ? [{ name: "browser.status" }] : { echoed: request.method };
  const server = createBrowserHarnessHttpServer({ dispatch, port: 0, token: "test-token" });
  const { url } = await server.listen();
  try {
    const health = await fetch(`${url}/health`);
    assert.equal(health.status, 200);

    const unauthorized = await fetch(`${url}/tools`);
    assert.equal(unauthorized.status, 401);

    const tools = await fetch(`${url}/tools`, { headers: { authorization: "Bearer test-token" } });
    assert.equal(tools.status, 200);
    assert.deepEqual((await tools.json()).result, [{ name: "browser.status" }]);

    const rpc = await fetch(`${url}/rpc`, {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ id: "a", method: "browser.status", params: {} }),
    });
    assert.equal(rpc.status, 200);
    assert.deepEqual(await rpc.json(), { id: "a", ok: true, result: { echoed: "browser.status" } });
  } finally {
    await server.close();
  }
});
