import { chromium } from "playwright";

const baseUrl = process.env.LAYOUT_GUIDES_URL ?? "http://127.0.0.1:4174/layout-guides.html";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

const waitForHarness = () => page.waitForFunction(() => Boolean(window.__MESURER_LAYOUT_GUIDES_TEST__), undefined, { timeout: 8_000 });

const serviceSnapshot = () => page.evaluate(() => window.__MESURER_LAYOUT_GUIDES_TEST__?.service()?.list() ?? []);

try {
  await page.goto(`${baseUrl}?reset=1&case=a`, { waitUntil: "domcontentloaded" });
  await waitForHarness();

  const tool = page.locator("[data-mesurer-tool-id='layout-guides'] button");
  await tool.waitFor({ state: "visible" });
  await tool.click();
  const panel = page.locator("[data-mesurer-layout-guides-panel='true']");
  await panel.waitFor({ state: "visible" });
  await panel.getByRole("button", { name: "Add layout guide" }).click();

  await page.waitForFunction(() => window.__MESURER_LAYOUT_GUIDES_TEST__?.service()?.list().length === 1);
  const initial = await serviceSnapshot();

  if (initial[0]?.kind !== "columns" || initial[0]?.count !== 5) throw new Error(`Unexpected default layout guide: ${JSON.stringify(initial)}`);

  const bands = page.locator("[data-mesurer-layout-band='true']");

  if (await bands.count() !== 5) throw new Error(`Expected 5 rendered layout bands, got ${await bands.count()}`);

  const context = await page.evaluate(() => window.__MESURER_LAYOUT_GUIDES_TEST__?.subject.context());

  if (context?.visualContext?.layoutGuides?.length !== 1) throw new Error(`Context did not expose Layout Guides: ${JSON.stringify(context?.visualContext)}`);

  await page.evaluate(() => history.pushState({}, "", "?case=b"));
  await page.waitForFunction(() => window.__MESURER_LAYOUT_GUIDES_TEST__?.service()?.list().length === 0);

  if (await page.locator("[data-mesurer-layout-guide]").count() !== 0) throw new Error("Route B retained route A layout guide overlay");

  await page.evaluate(async () => {
    const service = window.__MESURER_LAYOUT_GUIDES_TEST__?.service();

    if (!service) throw new Error("Layout Guides service unavailable");
    await service.add({ kind: "grid", size: 32, color: "#2563eb" });
  });
  await page.waitForFunction(() => window.__MESURER_LAYOUT_GUIDES_TEST__?.service()?.list()[0]?.kind === "grid");

  await page.evaluate(() => history.pushState({}, "", "?case=a"));
  await page.waitForFunction(() => window.__MESURER_LAYOUT_GUIDES_TEST__?.service()?.list()[0]?.kind === "columns");

  await tool.click();
  await panel.waitFor({ state: "hidden" });
  const toolbar = page.locator("[data-mesurer-toolbar='true']");
  const before = await toolbar.boundingBox();

  if (!before) throw new Error("Toolbar has no bounding box");
  await page.mouse.move(before.x + before.width / 2, before.y + 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 110, before.y + 72, { steps: 4 });
  await page.mouse.up();
  const moved = await toolbar.boundingBox();

  if (!moved || moved.x < before.x + 80 || moved.y < before.y + 50) throw new Error(`Toolbar did not drag: ${JSON.stringify({ before, moved })}`);

  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForHarness();
  await page.waitForFunction(() => window.__MESURER_LAYOUT_GUIDES_TEST__?.service()?.list()[0]?.kind === "columns");
  const restored = await page.locator("[data-mesurer-toolbar='true']").boundingBox();

  if (!restored || Math.abs(restored.x - moved.x) > 1 || Math.abs(restored.y - moved.y) > 1) {
    throw new Error(`Toolbar position did not survive reload: ${JSON.stringify({ moved, restored })}`);
  }

  if (errors.length) throw new Error(`Layout Guides browser errors:\n${errors.join("\n")}`);
  console.log("Layout Guides browser contract: PASS");
  console.log(JSON.stringify({ initial, moved, restored }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
