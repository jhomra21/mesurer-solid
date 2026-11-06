import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.TOOLBAR_PLACEMENT_URL ?? "http://127.0.0.1:4174/toolbar-placement-contract.html";

const output = process.env.TOOLBAR_PLACEMENT_OUT ?? "toolbar-placement-artifacts";

const viewport = { width: 1280, height: 800 };

const INSET = 16;

const STORAGE_KEY = "mesurer-toolbar-placement-contract:toolbar-position";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const errors = [];

const evidence = [];

// Where each public position lands: the edge it docks to and its spot on that edge.
const expectedFor = (position, size) => {
  const centerX = Math.round((viewport.width - size.width) / 2);
  const centerY = Math.round((viewport.height - size.height) / 2);
  const right = viewport.width - size.width - INSET;
  const bottom = viewport.height - size.height - INSET;

  return {
    "top-left": { x: INSET, y: INSET, edge: "top", align: "start" },
    top: { x: centerX, y: INSET, edge: "top", align: "center" },
    "top-right": { x: right, y: INSET, edge: "top", align: "end" },
    "bottom-left": { x: INSET, y: bottom, edge: "bottom", align: "start" },
    bottom: { x: centerX, y: bottom, edge: "bottom", align: "center" },
    "bottom-right": { x: right, y: bottom, edge: "bottom", align: "end" },
    left: { x: INSET, y: centerY, edge: "left", align: "center" },
    right: { x: right, y: centerY, edge: "right", align: "center" },
  }[position];
};

const near = (actual, expected, label) => assert(Math.abs(actual - expected) <= 2, `${label}: ${actual} != ${expected}`);

const open = async (query, { saved } = {}) => {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" || message.text().includes("[STRICT_")) errors.push(message.text());
  });

  if (saved) await page.addInitScript(([key, value]) => sessionStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(saved)]);
  await page.goto(`${base}?${query}`, { waitUntil: "networkidle" });
  const toolbar = page.locator("[data-mesurer-toolbar='true']").first();
  await toolbar.waitFor({ timeout: 8000 }).catch((cause) => { throw new Error(`toolbar did not render for ?${query}`, { cause }); });
  await page.waitForTimeout(700);

  return { page, toolbar, box: async () => (await toolbar.boundingBox()) };
};

const dragBy = async (page, box, dx, dy) => {
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 8 + dx, box.y + 8 + dy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
};

try {
  const positions = ["top-left", "top", "top-right", "bottom-left", "bottom", "bottom-right", "left", "right"];

  // Free dock: the toolbar keeps its horizontal shape and rests at the placement's 16px-inset spot.
  for (const position of positions) {
    const { page, toolbar, box } = await open(`position=${position}`);
    const rect = await box();
    const want = expectedFor(position, rect);
    near(rect.x, want.x, `free ${position} x`);
    near(rect.y, want.y, `free ${position} y`);
    assert.equal(await toolbar.getAttribute("data-dock-edge"), null, `free ${position} has no dock edge`);
    await page.screenshot({ path: `${output}/free-${position}.png` });
    evidence.push({ dock: "free", position, rect, want });
    await page.close();
  }

  // Snap dock: the placement is the edge and spot, and left/right stand the toolbar up.
  for (const position of positions) {
    const { page, toolbar, box } = await open(`position=${position}&dock=snap`);
    const rect = await box();
    const want = expectedFor(position, rect);
    near(rect.x, want.x, `snap ${position} x`);
    near(rect.y, want.y, `snap ${position} y`);
    assert.equal(await toolbar.getAttribute("data-dock-edge"), want.edge, `snap ${position} edge`);
    assert.equal(await toolbar.getAttribute("data-dock-align"), want.align, `snap ${position} align`);
    assert.equal(await toolbar.getAttribute("data-orientation"), want.edge === "left" || want.edge === "right" ? "vertical" : "horizontal", `snap ${position} orientation`);
    await page.screenshot({ path: `${output}/snap-${position}.png` });
    evidence.push({ dock: "snap", position, rect, want });
    await page.close();
  }

  // Dock alone, without a position, snaps the default toolbar to its nearest edge.
  {
    const { page, toolbar } = await open("dock=snap");
    assert.equal(await toolbar.getAttribute("data-dock-edge"), "top", "dock:snap without position glues the default spot to the top");
    await page.close();
  }

  // Absent option: Free at the existing 16,16, and a drag still moves it.
  {
    const { page, toolbar, box } = await open("none=1");
    const rect = await box();
    near(rect.x, INSET, "default x");
    near(rect.y, INSET, "default y");
    assert.equal(await toolbar.getAttribute("data-dock-edge"), null);
    await dragBy(page, rect, 120, 80);
    const moved = await box();
    near(moved.x, rect.x + 120, "default drag x");
    near(moved.y, rect.y + 80, "default drag y");
    evidence.push({ defaults: { rect, moved } });
    await page.close();
  }

  // An option that sets nothing but draggable keeps the default spot.
  {
    const { page, box } = await open("draggable=true");
    const rect = await box();
    near(rect.x, INSET, "draggable-only x");
    near(rect.y, INSET, "draggable-only y");
    await page.close();
  }

  // A saved tab-session placement wins over the option while the toolbar is draggable.
  {
    const { page, box } = await open("position=bottom-right", { saved: { x: 200, y: 300 } });
    const rect = await box();
    near(rect.x, 200, "saved placement x wins");
    near(rect.y, 300, "saved placement y wins");
    await page.screenshot({ path: `${output}/saved-wins.png` });
    evidence.push({ saved: { rect } });
    await page.close();
  }

  // A drag the user makes is saved for the tab and wins after a reload.
  {
    const { page, box } = await open("position=top-right");
    const rect = await box();
    await dragBy(page, rect, -300, 200);
    const moved = await box();
    near(moved.x, rect.x - 300, "drag from option x");
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("[data-mesurer-toolbar='true']").first().waitFor();
    await page.waitForTimeout(700);
    near((await box()).x, moved.x, "dragged placement survives reload");
    near((await box()).y, moved.y, "dragged placement survives reload y");
    await page.close();
  }

  // draggable:false ignores a saved placement, blocks the pointer drag and keeps the buttons working.
  for (const dock of ["free", "snap"]) {
    const { page, toolbar, box } = await open(`position=top-right&dock=${dock}&draggable=false`, { saved: { x: 200, y: 300 } });
    const rect = await box();
    const want = expectedFor("top-right", rect);
    near(rect.x, want.x, `${dock} fixed x ignores saved placement`);
    near(rect.y, want.y, `${dock} fixed y ignores saved placement`);
    const edge = await toolbar.getAttribute("data-dock-edge");
    await dragBy(page, rect, -300, 300);
    const after = await box();
    near(after.x, rect.x, `${dock} fixed drag x`);
    near(after.y, rect.y, `${dock} fixed drag y`);
    assert.equal(await toolbar.getAttribute("data-dock-edge"), edge, `${dock} fixed drag keeps the edge`);
    assert.equal(await page.evaluate(() => document.documentElement.style.userSelect), "", `${dock} fixed drag leaves text selection alone`);

    const settings = page.getByRole("button", { name: /^Settings/ }).first();
    await settings.click();
    await page.getByRole("combobox", { name: "Toolbar dock" }).waitFor({ state: "visible" });
    await page.screenshot({ path: `${output}/fixed-${dock}-settings.png` });
    await settings.click();

    await page.setViewportSize({ width: 900, height: 600 });
    await page.waitForTimeout(700);
    const resized = await box();
    near(resized.x, 900 - resized.width - INSET, `${dock} fixed follows the right edge on resize`);
    near(resized.y, INSET, `${dock} fixed top after resize`);
    evidence.push({ fixed: dock, rect, after, resized });
    await page.close();
  }

  assert.deepEqual(errors, [], `Browser diagnostics stay clean: ${errors.join("\n")}`);
  await writeFile(`${output}/toolbar-placement.json`, JSON.stringify({ viewport, evidence }, null, 2));
  console.log(`Toolbar placement contract passed: ${evidence.length} observations.`);
} finally {
  await browser.close();
}
