#!/usr/bin/env node
import process from "node:process";
import { parseBrowserHarnessArgs, BROWSER_HARNESS_USAGE } from "./args.mjs";
import { BrowserHarnessSession } from "./session.mjs";
import { createBrowserHarnessDispatcher, executeRpc } from "./rpc.mjs";
import { createBrowserHarnessHttpServer } from "./server.mjs";
import { serveBrowserHarnessStdio } from "./stdio.mjs";

const log = (...args) => console.error(...args);

const waitForSignal = async () => {
  await new Promise((resolve) => {
    const done = () => resolve();
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
};

async function main() {
  let options;
  try {
    options = parseBrowserHarnessArgs(process.argv.slice(2));
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    log("");
    log(BROWSER_HARNESS_USAGE);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    process.stdout.write(BROWSER_HARNESS_USAGE);
    return;
  }

  const session = new BrowserHarnessSession({
    url: options.url,
    cdp: options.cdp,
    page: options.page,
    injectPath: options.injectPath,
    globalName: options.globalName,
    target: options.target,
    headless: options.headless,
    autoInject: options.autoInject && !options.listPages,
    screenshotDir: options.screenshotDir,
  });

  let http = null;
  try {
    await session.start();
    const dispatch = createBrowserHarnessDispatcher(session);

    if (options.listPages) {
      process.stdout.write(`${JSON.stringify(await session.pages(), null, 2)}\n`);
      await session.close();
      return;
    }

    if (options.once) {
      const response = await executeRpc(dispatch, { id: "once", method: options.once, params: options.params });
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      await session.close();
      if (!response.ok) process.exitCode = 1;
      return;
    }

    const status = await session.status();
    if (!options.stdio) {
      log(`Mesurer attached: ${status.page?.title || status.page?.url || "browser tab"}`);
      log(`URL: ${status.page?.url ?? "n/a"}`);
      log(`Agent global: ${status.globalName}`);
    }

    if (options.serve) {
      http = createBrowserHarnessHttpServer({ dispatch, port: options.port, token: options.token });
      const listening = await http.listen();
      log(`Browser harness RPC: ${listening.url}/rpc`);
      log(`Tools: ${listening.url}/tools`);
      log(`Bearer token: ${listening.token}`);
    }

    if (options.stdio) {
      log("Browser harness JSONL RPC is listening on stdin/stdout.");
      await Promise.race([serveBrowserHarnessStdio({ dispatch }), session.waitForDisconnect()]);
    } else {
      if (!options.serve) {
        log("Browser is ready for manual testing. Press Ctrl+C when finished.");
      } else {
        log("RPC server is ready. Press Ctrl+C when finished.");
      }
      await Promise.race([waitForSignal(), session.waitForDisconnect()]);
    }
  } finally {
    await http?.close().catch(() => {});
    await session.close().catch(() => {});
  }
}

await main();
