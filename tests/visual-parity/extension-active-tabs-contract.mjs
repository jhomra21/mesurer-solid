import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.EXTENSION_ACTIVE_TABS_URL ?? "http://127.0.0.1:4174/extension-active-tabs.html";
const out = process.env.EXTENSION_ACTIVE_TABS_OUT ?? "extension-active-tabs-artifacts";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ACTIVE_TAB_TEST__));

  const closeRace = await page.evaluate(async () => {
    const { createActiveTabRegistry } = window.__MESURER_ACTIVE_TAB_TEST__;
    const writes = [];
    let releaseRead;
    const readGate = new Promise((resolve) => {
      releaseRead = resolve;
    });

    const registry = createActiveTabRegistry(
      async () => {
        await readGate;

        return [7];
      },
      async (ids) => {
        writes.push([...ids]);
      },
    );

    const closing = registry.setActive(7, false);
    const restoreCheck = registry.ready.then(() => registry.isActive(7));

    releaseRead();
    await closing;

    return {
      restoreCheck: await restoreCheck,
      activeAfterClose: registry.isActive(7),
      writes,
    };
  });

  assert.equal(closeRace.restoreCheck, false, "navigation must not observe a tab as active after close starts");
  assert.equal(closeRace.activeAfterClose, false, "closed tab must stay inactive");
  assert.deepEqual(closeRace.writes, [[]], "close must persist an empty active-tab set");

  const lastWriteWins = await page.evaluate(async () => {
    const { createActiveTabRegistry } = window.__MESURER_ACTIVE_TAB_TEST__;
    const writes = [];
    let releaseRead;
    const readGate = new Promise((resolve) => {
      releaseRead = resolve;
    });

    const registry = createActiveTabRegistry(
      async () => {
        await readGate;

        return [11];
      },
      async (ids) => {
        writes.push([...ids]);
      },
    );

    const closing = registry.setActive(11, false);
    const reopening = registry.setActive(11, true);

    releaseRead();
    await Promise.all([closing, reopening]);

    return {
      active: registry.isActive(11),
      writes,
    };
  });

  assert.equal(lastWriteWins.active, true, "the newest pending state must win");
  assert.deepEqual(lastWriteWins.writes, [[11]], "only the newest state should be persisted");

  const report = {
    status: "PASS",
    url,
    closeDuringInitialRead: closeRace,
    lastPendingStateWins: lastWriteWins,
  };

  await mkdir(out, { recursive: true });
  await writeFile(`${out}/result.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Extension active-tab contract: PASS", report);
} finally {
  await browser.close();
}
