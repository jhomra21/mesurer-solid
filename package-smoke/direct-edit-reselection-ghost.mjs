import { chromium } from "playwright";

const url = process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const waitFrames = (count = 2) => page.evaluate(async (frames) => {
  for (let index = 0; index < frames; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}, count);
const sameBox = (a, b, tolerance = 3) => a && b && ["x", "y", "width", "height"]
  .every((key) => Math.abs(a[key] - b[key]) <= tolerance);
const box = (rect) => rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__HOST_READY__ && window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await page.waitForFunction(() => Boolean(
    document.querySelector("[data-mesurer-island='true']")?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"),
  ));

  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "260px";
    spacer.dataset.testid = "ghost-reselection-spacer";
    document.querySelector("#root")?.before(spacer);
    document.body.style.minHeight = "1800px";
    window.scrollTo(0, 234);
  });
  await waitFrames(2);
  await page.evaluate(() => window.__MESURER__.command("builtin.select"));

  const target = page.locator("[data-testid='consumer-sibling']");
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error("Reselection target has no geometry");
  const x = targetBox.x + targetBox.width / 2;
  const y = targetBox.y + targetBox.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await page.mouse.dblclick(x, y);
  const editor = page.locator("[data-mesurer-text-editor='true']");
  await editor.waitFor({ state: "visible", timeout: 5000 });

  const parentPoint = await target.evaluate((element) => {
    const parent = element.parentElement;
    if (!(parent instanceof HTMLElement)) return null;
    const rect = parent.getBoundingClientRect();
    return { x: rect.left + 4, y: rect.top + 4, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  });
  if (!parentPoint) throw new Error("Reselection target has no selectable parent");

  await page.mouse.move(parentPoint.x, parentPoint.y);
  await page.mouse.click(parentPoint.x, parentPoint.y);
  await page.waitForFunction(() => !document.querySelector("[data-mesurer-text-editor='true']"));
  await waitFrames(1);

  const selectedChrome = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  await selectedChrome.waitFor({ state: "visible", timeout: 5000 });
  const parentSelected = await selectedChrome.boundingBox();
  if (sameBox(parentSelected, targetBox)) {
    throw new Error(`Parent overwrite did not replace child selection: ${JSON.stringify({ parentSelected, targetBox })}`);
  }

  // Return to the original child, then re-enter editing. This is the exact manual
  // sequence that exposed a same-size ghost displaced by roughly window.scrollY.
  const liveTargetBox = await target.boundingBox();
  if (!liveTargetBox) throw new Error("Reselection target disappeared");
  const childX = liveTargetBox.x + liveTargetBox.width / 2;
  const childY = liveTargetBox.y + liveTargetBox.height / 2;
  await page.mouse.move(childX, childY);
  await page.mouse.click(childX, childY);
  await waitFrames(1);
  const childSelected = await selectedChrome.boundingBox();
  if (!sameBox(childSelected, liveTargetBox)) {
    throw new Error(`Child selection did not return before edit: ${JSON.stringify({ childSelected, liveTargetBox })}`);
  }

  await page.mouse.dblclick(childX, childY);
  await editor.waitFor({ state: "visible", timeout: 5000 });
  await page.locator("[data-mesurer-text-inspector-info='true']").waitFor({ state: "visible", timeout: 5000 });
  await waitFrames(1);

  const state = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const read = (element, layer, kind) => {
      const rect = element.getBoundingClientRect();
      return {
        layer,
        kind,
        opacity: Number(getComputedStyle(element).opacity),
        selectionSuppressed: element.getAttribute("data-mesurer-direct-edit-selection-suppressed"),
        hoverSuppressed: element.getAttribute("data-mesurer-direct-edit-hover-suppressed"),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    };
    const surfaces = [
      ...Array.from(document.body.querySelectorAll("[data-mesurer-selected-measurement='true']")).map((e) => read(e, "document", "selection")),
      ...Array.from(document.body.querySelectorAll("[data-mesurer-hover-measurement='true']")).map((e) => read(e, "document", "hover")),
      ...(island?.shadowRoot ? Array.from(island.shadowRoot.querySelectorAll("[data-mesurer-selected-measurement='true']")).map((e) => read(e, "shadow", "selection")) : []),
      ...(island?.shadowRoot ? Array.from(island.shadowRoot.querySelectorAll("[data-mesurer-hover-measurement='true']")).map((e) => read(e, "shadow", "hover")) : []),
    ];
    const target = document.querySelector("[data-testid='consumer-sibling']")?.getBoundingClientRect();
    const ring = document.querySelector("[data-mesurer-text-edit-ring='true']")?.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      target: target ? { x: target.x, y: target.y, width: target.width, height: target.height } : null,
      ring: ring ? { x: ring.x, y: ring.y, width: ring.width, height: ring.height } : null,
      surfaces,
    };
  });

  if (state.scrollY < 150) throw new Error(`Regression lost non-zero scroll context: ${JSON.stringify(state)}`);
  if (!sameBox(state.target, state.ring, 2)) {
    throw new Error(`Direct-edit ring is not source-locked after reselection: ${JSON.stringify(state)}`);
  }
  const visibleDuplicates = state.surfaces.filter((surface) => surface.opacity > 0.01);
  if (visibleDuplicates.length) {
    throw new Error(`Parent→child reselection exposed duplicate selection/hover chrome before scroll: ${JSON.stringify(state)}`);
  }

  console.log("Packed Solid 2 parent→child direct-edit reselection ghost regression: PASS", state);
} finally {
  await page.close();
  await browser.close();
}
