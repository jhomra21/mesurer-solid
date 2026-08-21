import assert from "node:assert/strict";
import test from "node:test";
import { parseBrowserHarnessArgs } from "./args.mjs";
import { normalizeBrowserUrl } from "./session.mjs";

test("argument parser keeps launch and attach modes small", () => {
  const options = parseBrowserHarnessArgs([
    "https://example.com",
    "--cdp", "http://127.0.0.1:9222",
    "--page", "Docs",
    "--inject", "/tmp/inject-script.js",
  ]);
  assert.equal(options.url, "https://example.com");
  assert.equal(options.cdp, "http://127.0.0.1:9222");
  assert.equal(options.page, "Docs");
  assert.equal(options.injectPath, "/tmp/inject-script.js");
});

test("argument parser rejects browser-control/RPC flags", () => {
  assert.throws(() => parseBrowserHarnessArgs(["--serve"]), /Unknown option/);
  assert.throws(() => parseBrowserHarnessArgs(["--stdio"]), /Unknown option/);
  assert.throws(() => parseBrowserHarnessArgs(["--once"]), /Unknown option/);
  assert.throws(() => parseBrowserHarnessArgs(["--wat"]), /Unknown option/);
});

test("browser URL normalization handles dev hosts and bare public hosts", () => {
  assert.equal(normalizeBrowserUrl("localhost:5173"), "http://localhost:5173/");
  assert.equal(normalizeBrowserUrl("127.0.0.1:3000/app"), "http://127.0.0.1:3000/app");
  assert.equal(normalizeBrowserUrl("example.com/docs"), "https://example.com/docs");
  assert.equal(normalizeBrowserUrl("https://example.com/x"), "https://example.com/x");
});
