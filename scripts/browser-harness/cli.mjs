#!/usr/bin/env node
import process from "node:process";
import { parseBrowserHarnessArgs, BROWSER_HARNESS_USAGE } from "./args.mjs";
import { BrowserHarnessSession } from "./session.mjs";

const log = (...args) => console.error(...args);
const waitForSignal = async () => new Promise((resolve) => {
  const done = () => resolve();
  process.once("SIGINT", done);
  process.once("SIGTERM", done);
});

async function main() {
  let options;
  try { options = parseBrowserHarnessArgs(process.argv.slice(2)); }
  catch (error) {
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

  const session = new BrowserHarnessSession({ ...options, autoInject: options.autoInject && !options.listPages });
  try {
    await session.start();
    if (options.listPages) {
      process.stdout.write(`${JSON.stringify(await session.pages(), null, 2)}\n`);
      return;
    }
    const status = await session.status();
    log(`Mesurer attached: ${status.page?.title || status.page?.url || "browser tab"}`);
    log(`URL: ${status.page?.url ?? "n/a"}`);
    log(`Agent global: ${status.globalName}`);
    log("Reference browser is ready. Your coding agent should normally use its own browser tool instead. Press Ctrl+C when finished.");
    await Promise.race([waitForSignal(), session.waitForDisconnect()]);
  } finally {
    await session.close().catch(() => {});
  }
}

await main();
