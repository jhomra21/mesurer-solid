import { chromium } from "playwright";
import fs from "node:fs/promises";

// The published plugins and renderer entries are separate bundles with
// separate Solid runtimes. Prove the toolbar's Notes trigger follows the
// plugin-owned panel state immediately and keeps focus ownership on close.
const url = process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192";

const outputDir = process.env.NOTES_TOOLBAR_OUT ?? "packed-notes-toolbar-artifacts";

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__HOST_READY__ && window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());

  const trigger = page.locator('button[data-mesurer-tool-id="context.notes"]');
  const panel = page.getByRole("dialog", { name: "Notes" });
  await trigger.waitFor({ state: "visible" });

  const expanded = () => trigger.getAttribute("aria-expanded");

  if (await expanded() !== "false") throw new Error(`Closed Notes trigger reports aria-expanded=${await expanded()}`);

  await trigger.click();
  await panel.waitFor({ state: "visible" });
  // Read on the next frames, well before any unrelated toolbar refresh.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  if (await expanded() !== "true") {
    throw new Error(`Notes trigger did not reflect the open panel: aria-expanded=${await expanded()}`);
  }

  await page.screenshot({ path: `${outputDir}/notes-open.png` });
  await panel.getByRole("button", { name: "Close Notes", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

  const state = await trigger.evaluate((element) => {
    const root = element.getRootNode();
    const active = root instanceof ShadowRoot ? root.activeElement : element.ownerDocument.activeElement;

    return { expanded: element.getAttribute("aria-expanded"), focused: active === element };
  });

  if (state.expanded !== "false" || !state.focused) {
    throw new Error(`Closing Notes did not restore the trigger state and focus: ${JSON.stringify(state)}`);
  }

  console.log("Packed Solid 2 Notes trigger state and focus: PASS", state);
} finally {
  await browser.close();
}
