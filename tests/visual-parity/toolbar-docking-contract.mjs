import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.TOOLBAR_DOCKING_URL ?? "http://localhost:4198/";

const output = process.env.TOOLBAR_DOCKING_OUT ?? "toolbar-docking-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const errors = [];

const evidence = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error" || message.text().includes("[STRICT_")) errors.push(message.text());
});

const toolbar = page.locator("[data-mesurer-toolbar='true']").first();

const bounds = async () => {
  const rect = await toolbar.boundingBox();
  assert(rect, "toolbar has rendered geometry");

  return rect;
};

const settings = page.getByRole("button", { name: /^Settings/ }).first();

const drag = async (x, y) => {
  const box = await bounds();
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await toolbar.evaluate((element) => {
    window.__dockFrames = [];
    window.__dockReleased = false;
    window.__dockSampling = true;

    const sample = () => {
      const rect = element.getBoundingClientRect();
      window.__dockFrames.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, time: performance.now(), released: window.__dockReleased, turning: element.getAnimations().some((animation) => animation.id === "mesurer-toolbar-turn") });

      if (window.__dockSampling) requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });
  await page.mouse.move(640, 500, { steps: 12 });
  await page.mouse.move(x, y, { steps: 18 });
  await page.evaluate(() => { window.__dockReleased = true; });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const frames = await page.evaluate(() => { window.__dockSampling = false;

 return window.__dockFrames; });

  assert(frames.length > 2 && frames.every((frame) => Number.isFinite(frame.x) && frame.width > 0 && frame.height > 0), "glide/turn frames have valid geometry");
  const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

  if (reduced) assert(frames.every((frame) => !frame.turning), "reduced motion has no intermediate turn animation");
  const settled = frames.filter((frame) => frame.released);
  const last = settled.at(-1);
  const lastFrames = settled.filter((frame) => frame.time >= last.time - 80);
  assert(lastFrames.every((frame) => Math.abs(frame.x - last.x) < 2 && Math.abs(frame.y - last.y) < 2), "glide settles without late jumps");
  evidence.push({ drag: { x, y }, frames });
};

const near = (actual, expected, label) => assert(Math.abs(actual - expected) <= 2, `${label}: ${actual} != ${expected}`);

const checkSurface = async (surface, label) => {
  await surface.waitFor({ state: "visible" });
  await page.waitForTimeout(450);
  const panel = await surface.boundingBox();
  const bar = await bounds();
  const viewport = page.viewportSize();
  assert(panel && panel.x >= 7 && panel.y >= 7 && panel.x + panel.width <= viewport.width - 7 && panel.y + panel.height <= viewport.height - 7, `${label} in viewport: ${JSON.stringify(panel)}`);
  assert(panel.x + panel.width <= bar.x || panel.x >= bar.x + bar.width || panel.y + panel.height <= bar.y || panel.y >= bar.y + bar.height, `${label} avoids toolbar`);
  evidence.push({ surface: label, panel, bar });
};

const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
  && a.y < b.y + b.height && a.y + a.height > b.y;

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await toolbar.waitFor();
  const initial = await bounds();
  near(initial.x, 16, "Free initial x");
  near(initial.y, 16, "Free initial y");
  await page.mouse.move(initial.x + 8, initial.y + 8);
  await page.mouse.down();
  await page.mouse.move(initial.x + 13, initial.y + 13);
  await page.mouse.up();
  near((await bounds()).x, initial.x, "5px does not drag");
  await page.mouse.move(initial.x + 8, initial.y + 8);
  await page.mouse.down();
  await page.mouse.move(initial.x + 68, initial.y + 48, { steps: 8 });
  await page.mouse.up();
  near((await bounds()).x, initial.x + 60, "Free drag x unchanged");
  near((await bounds()).y, initial.y + 40, "Free drag y unchanged");
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((key) => key.endsWith(":toolbar-position"));
    const { x, y } = JSON.parse(sessionStorage.getItem(key));
    sessionStorage.setItem(key, JSON.stringify({ x, y }));
  });
  await page.reload({ waitUntil: "networkidle" });
  near((await bounds()).x, initial.x + 60, "legacy x/y placement loads");
  await settings.click();
  const dock = page.getByRole("combobox", { name: "Toolbar dock" });
  assert.equal(await dock.inputValue(), "free");
  assert.equal(await page.getByRole("switch", { name: "Auto-hide", exact: true }).count(), 0);
  await dock.selectOption("snap");
  await settings.click();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
    Object.defineProperty(window, "process", { configurable: true, value: { type: "renderer" } });
    window.__MESURER_HOST__ = { windowControls: { visible: true, bounds: { x: 0, y: 0, width: 90, height: 42 } } };
  });
  await drag(140, 24);
  assert.equal(await toolbar.getAttribute("data-dock-edge"), "top");
  assert.equal(await toolbar.getAttribute("data-dock-align"), "start");
  await settings.click();
  await page.getByRole("switch", { name: "Auto-hide", exact: true }).click();
  await settings.click();
  const controls = { x: 0, y: 0, width: 90, height: 42 };
  await page.mouse.move(900, 900);
  await page.waitForTimeout(1000);
  assert.equal(await toolbar.getAttribute("data-tucked"), "true");
  const tucked = await bounds();
  assert(!intersects(tucked, controls), `tucked toolbar avoids native controls: ${JSON.stringify(tucked)}`);
  await page.mouse.move(100, 45);
  await page.waitForTimeout(350);
  assert.notEqual(await toolbar.getAttribute("data-tucked"), "true", "pointer reveals toolbar");
  const revealed = await bounds();
  assert(!intersects(revealed, controls), `revealed toolbar avoids native controls: ${JSON.stringify(revealed)}`);
  evidence.push({ nativeControls: controls, tucked, revealed });
  await settings.click();
  await page.getByRole("switch", { name: "Auto-hide", exact: true }).click();
  await settings.click();

  for (const [edge, x, y] of [["top", 640, 24], ["bottom", 640, 976], ["left", 24, 500], ["right", 1256, 500]]) {
    await drag(x, y);
    const box = await bounds();
    assert.equal(await toolbar.getAttribute("data-dock-edge"), edge);
    assert.equal(await toolbar.getAttribute("data-orientation"), edge === "left" || edge === "right" ? "vertical" : "horizontal");
    near(edge === "top" ? box.y : edge === "bottom" ? 1000 - box.y - box.height : edge === "left" ? box.x : 1280 - box.x - box.width, 16, `${edge} inset`);
    await settings.click();
    await page.waitForTimeout(450);
    const panel = await page.getByRole("dialog", { name: "Settings", exact: true }).boundingBox();
    assert(panel && panel.x >= 7 && panel.y >= 7 && panel.x + panel.width <= 1273 && panel.y + panel.height <= 993, `${edge} Settings in viewport: ${JSON.stringify(panel)}`);
    assert(panel.x + panel.width <= box.x || panel.x >= box.x + box.width || panel.y + panel.height <= box.y || panel.y >= box.y + box.height, `${edge} Settings avoids toolbar`);
    await settings.click();
    evidence.push({ edge, box, panel });
    const guide = page.getByRole("button", { name: "Guide orientation menu", exact: true });
    await guide.click();
    await checkSurface(page.getByRole("menu").last(), `${edge} Guide menu`);
    await guide.click();
    const plugin = page.getByRole("button", { name: "Edit options", exact: true });
    await plugin.click();
    await checkSurface(page.getByRole("menu").last(), `${edge} plugin menu`);
    await plugin.click();
    await page.getByRole("button", { name: "Compact toolbar", exact: true }).click();
    await page.waitForTimeout(250);
    assert.equal(await page.getByRole("button", { name: "Expand toolbar", exact: true }).isVisible(), true);
    await page.keyboard.press("ControlOrMeta+,");
    await checkSurface(page.getByRole("dialog", { name: "Settings", exact: true }), `${edge} compact Settings`);
    await page.keyboard.press("ControlOrMeta+,");
    await page.getByRole("button", { name: "Expand toolbar", exact: true }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${output}/${edge}.png` });

    if (edge === "left" || edge === "right") {
      const tooltip = page.locator("[role='tooltip']:visible").first();
      const trigger = settings;
      await trigger.hover();
      await page.waitForTimeout(200);
      const tooltipBounds = await tooltip.boundingBox();
      assert(tooltipBounds, `${edge} Settings tooltip is visible`);
      const tooltipStyle = await tooltip.evaluate((element) => ({ side: element.getAttribute("data-tooltip-side"), left: getComputedStyle(element).left, right: getComputedStyle(element).right, translate: getComputedStyle(element).translate, transform: getComputedStyle(element).transform }));
      const viewport = page.viewportSize();
      assert(tooltipBounds.x >= 0 && tooltipBounds.y >= 0
        && tooltipBounds.x + tooltipBounds.width <= viewport.width
        && tooltipBounds.y + tooltipBounds.height <= viewport.height,
      `${edge} tooltip stays inside viewport: ${JSON.stringify(tooltipBounds)}`);
      assert(!intersects(tooltipBounds, box), `${edge} tooltip avoids toolbar: ${JSON.stringify({ tooltipBounds, box, tooltipStyle })}`);
      await page.mouse.move(700, 900);

      const guideMenu = page.getByRole("button", { name: "Guide orientation menu", exact: true });

      for (let cycle = 0; cycle < 3; cycle += 1) {
        await guideMenu.click();
        await page.getByRole("menu").last().waitFor({ state: "visible" });

        const closedSurface = await page.getByRole("menu").last().elementHandle();
        await page.waitForTimeout(450);
        await guideMenu.click();
        await page.getByRole("menu").waitFor({ state: "detached" });
        await page.waitForTimeout(50);

        const remainingPlacement = await closedSurface.evaluate((element) => ({
          position: element.style.getPropertyValue("position"),
          width: element.style.getPropertyValue("width"),
        }));

        assert.deepEqual(remainingPlacement, { position: "", width: "" },
          `${edge} closed menu releases its temporary placement styles`);
        assert.equal(await toolbar.locator("[role='menu'], [role='dialog']").count(), 0,
          `${edge} closed surfaces are removed from toolbar DOM`);
      }

      await guideMenu.click();
      const surface = page.getByRole("menu").last();
      await page.setViewportSize({ width: 210, height: 1000 });
      await page.waitForTimeout(450);
      const narrow = await surface.boundingBox();
      assert(narrow && narrow.width < 176,
        `${edge} menu constrains to narrow viewport: ${narrow?.width}`);
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.waitForTimeout(500);
      const restored = await surface.boundingBox();
      assert(restored && restored.width >= 176,
        `${edge} menu restores preferred width after viewport expands: ${narrow?.width} -> ${restored?.width}`);
      await guideMenu.click();
    }
  }

  await drag(140, 24);
  assert.equal(await toolbar.getAttribute("data-dock-align"), "start");
  near((await bounds()).x, 16, "top start corner");
  await drag(1100, 24);
  assert.equal(await toolbar.getAttribute("data-dock-align"), "end");
  const endBox = await bounds();
  near(1280 - endBox.x - endBox.width, 16, "top end corner");
  await drag((1280 - endBox.width) / 2 + 8, 24);
  assert.equal(await toolbar.getAttribute("data-dock-align"), "center");
  const centered = await bounds();
  near(centered.x, (1280 - centered.width) / 2, "top center alignment");
  await drag(640, 500);
  assert(await toolbar.getAttribute("data-dock-edge"), "release in middle chooses nearest zone");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await drag(24, 500);
  assert.equal(await toolbar.evaluate((element) => element.getAnimations().filter((animation) => animation.id === "mesurer-toolbar-turn").length), 0, "reduced motion skips turn");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await drag(1256, 500);
  // Held-edge hysteresis and neutral corners are pointer zones, not bar bounds.
  const held = await bounds();
  await page.mouse.move(held.x + 8, held.y + 8);
  await page.mouse.down();
  await page.mouse.move(640, 500, { steps: 12 });
  await page.mouse.move(640, 70, { steps: 12 });
  assert.equal(await toolbar.getAttribute("data-dock-edge"), "top", "72px band glues");
  await page.mouse.move(640, 79, { steps: 3 });
  assert.equal(await toolbar.getAttribute("data-dock-edge"), "top", "8px hold depth");
  await page.mouse.move(640, 90, { steps: 3 });
  assert.equal(await toolbar.getAttribute("data-dock-edge"), null, "leaving hold band releases");
  await page.mouse.move(640, 500, { steps: 12 });
  await page.mouse.move(20, 20, { steps: 18 });
  assert.equal(await toolbar.getAttribute("data-dock-edge"), null, "120px corner is neutral");
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert(await toolbar.getAttribute("data-dock-edge"), "corner release docks");
  await drag(1256, 500);
  const savedAlign = await toolbar.getAttribute("data-dock-align");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await toolbar.getAttribute("data-dock-edge"), "right");
  assert.equal(await toolbar.getAttribute("data-dock-align"), savedAlign);
  assert.equal(await toolbar.getAttribute("data-orientation"), "vertical");
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.waitForTimeout(500);
  const resized = await bounds();
  near(1400 - resized.x - resized.width, 16, "resize holds edge");
  assert.equal(await toolbar.getAttribute("data-dock-align"), savedAlign, "resize holds alignment");
  await settings.click();
  await page.getByRole("switch", { name: "Auto-hide", exact: true }).click();
  await page.mouse.move(700, 1000);
  await page.waitForTimeout(1000);
  assert.notEqual(await toolbar.getAttribute("data-tucked"), "true", "Settings holds toolbar visible");
  await settings.click();
  await page.reload({ waitUntil: "networkidle" });
  await page.mouse.move(700, 1000);
  await page.waitForTimeout(1000);
  assert.notEqual(await toolbar.getAttribute("data-tucked"), "true", "reload waits for first reach");
  const reached = await bounds();
  await page.mouse.move(reached.x + reached.width / 2, reached.y + 10);
  await page.mouse.move(700, 1000);
  await page.waitForTimeout(400);
  assert.notEqual(await toolbar.getAttribute("data-tucked"), "true", "does not tuck before 600ms");
  await page.waitForTimeout(600);
  assert.equal(await toolbar.getAttribute("data-tucked"), "true");
  await page.mouse.move(1390, reached.y + 10);
  await page.waitForTimeout(350);
  assert.notEqual(await toolbar.getAttribute("data-tucked"), "true", "48px hot zone reveals");
  const guideTrigger = page.getByRole("button", { name: "Guide orientation menu", exact: true });
  await guideTrigger.click();
  await page.mouse.move(700, 1000);
  await page.waitForTimeout(1000);
  assert.notEqual(await toolbar.getAttribute("data-tucked"), "true", "open menu holds toolbar visible");
  await guideTrigger.click();
  await settings.focus();
  await page.keyboard.press("Tab");
  await page.mouse.move(700, 1000);
  await page.waitForTimeout(1000);
  assert.notEqual(await toolbar.getAttribute("data-tucked"), "true", "keyboard focus holds toolbar visible");
  // The independent Motion fixture uses the same basic example and real Select input.
  await page.goto(new URL("/motion-contract.html", url).href, { waitUntil: "networkidle" });
  await settings.click();
  await page.getByRole("combobox", { name: "Toolbar dock" }).selectOption("snap");
  await page.getByRole("switch", { name: "Auto-hide", exact: true }).click();
  await settings.click();
  await page.locator("button[data-mesurer-builtin='select']").click();
  const target = await page.locator("[data-testid='css-motion']").boundingBox();
  assert(target);
  await page.mouse.click(target.x + target.width - 24, target.y + target.height / 2);
  const motion = page.locator("[data-mesurer-motion-surface='true']");
  await motion.waitFor();

  for (const [edge, x, y] of [["left", 24, 500], ["right", 1376, 500], ["top", 700, 24], ["bottom", 700, 1076]]) {
    await drag(x, y);
    await checkSurface(motion, `${edge} Motion player`);
    assert.equal(await motion.getAttribute("data-mesurer-motion-detached"), "false");
    await page.mouse.move(700, 900);
    await page.waitForTimeout(1000);
    assert.notEqual(await toolbar.getAttribute("data-tucked"), "true", "Motion holds toolbar visible");
  }

  assert.deepEqual(errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ passed: true, evidence, errors }, null, 2));
  console.log("Toolbar docking contract: PASS", output);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  await writeFile(`${output}/result.json`, JSON.stringify({ passed: false, evidence, errors, error: String(error) }, null, 2));
  throw error;
} finally {
  await browser.close();
}
