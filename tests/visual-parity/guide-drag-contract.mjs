import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.GUIDE_DRAG_URL ?? "http://127.0.0.1:4174/";

const out = process.env.GUIDE_DRAG_OUT ?? "guide-drag-artifacts";

const HITBOX_RADIUS = 7;

const SNAP_DISTANCE = 10;

await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

const diagnostics = [];

page.on("pageerror", (error) => diagnostics.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") diagnostics.push(message.text());
});

const fail = (message, detail) => {
  throw new Error(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`);
};

const guideButton = () => page.getByRole("button", { name: /^Guides/ });

// A guide's hit box is centred on its position, so position = hit box left + radius.
const guidePositions = () => page.evaluate((radius) =>
  [...document.querySelectorAll('[data-mesurer-guide="true"]')].map((node) => node.getBoundingClientRect().left + radius),
HITBOX_RADIUS);

const setSnap = async (enabled) => {
  await page.keyboard.press("Control+,");
  const toggle = page.getByRole("switch", { name: "Snap", exact: true });
  await toggle.waitFor({ state: "visible" });

  if ((await toggle.getAttribute("aria-checked")) !== String(enabled)) await toggle.click();
  await page.keyboard.press("Escape");
};

const setGuidesTool = async (on) => {
  const pressed = (await guideButton().getAttribute("aria-pressed")) === "true";

  if (pressed !== on) await guideButton().click();
};

const addGuide = async (x) => {
  await setGuidesTool(true);
  await page.mouse.click(x, 450);
  await setGuidesTool(false);
};

// Drag the single guide while the Guides tool is on or off. The Guides tool
// takes a short hold before a guide follows the pointer.
const dragGuide = async (from, to, y, { guidesTool }) => {
  await setGuidesTool(guidesTool);
  await page.mouse.move(from, y);
  await page.mouse.down();

  if (guidesTool) await page.waitForTimeout(450);
  await page.mouse.move((from + to) / 2, y, { steps: 6 });
  await page.mouse.move(to, y, { steps: 6 });
  const selectionDuringDrag = await page.evaluate(() => getSelection()?.toString() ?? "");
  await page.mouse.up();
  const selectionAfterDrag = await page.evaluate(() => getSelection()?.toString() ?? "");
  await setGuidesTool(false);

  return { selectionDuringDrag, selectionAfterDrag };
};

const results = { passiveSnap: null, passiveNoSnap: null, guidesToolSnap: null, selection: [], paint: {} };

try {
  await page.goto(url, { waitUntil: "networkidle" });

  // A fixture box with an unmistakable left edge and no other page edge within
  // twice the snap distance, so the expected snap target is unambiguous.
  const edge = await page.evaluate((snap) => {
    const probe = document.createElement("div");
    probe.id = "guide-drag-probe";
    probe.style.cssText = "position:fixed;top:640px;width:90px;height:90px;background:#0af;z-index:1";
    document.body.append(probe);

    const others = [...document.body.querySelectorAll("*")].flatMap((node) => {
      const rect = node.getBoundingClientRect();

      if (node === probe || node.closest("[data-mesurer-island]") || rect.width <= 2 || rect.height <= 2) return [];

      return [rect.left, rect.right, rect.left + rect.width / 2];
    });

    for (let left = 100; left < 1100; left += 1) {
      const edges = [left, left + 90, left + 45];

      if (edges.every((value) => others.every((other) => Math.abs(other - value) > snap + 4))) {
        probe.style.left = `${left}px`;

        return left;
      }
    }

    return null;
  }, SNAP_DISTANCE);

  if (edge === null) fail("No clear snap target found on the fixture page");
  results.edge = edge;

  // Item 1: a passive drag (no tool) must snap exactly like a Guides-tool drag.
  await setSnap(true);
  await addGuide(200);
  const [start] = await guidePositions();

  if (start === undefined) fail("Guide was not created");
  const target = edge + 4;
  await dragGuide(start, target, 450, { guidesTool: false });
  const [passiveSnapped] = await guidePositions();
  results.passiveSnap = { start, pointer: target, edge, position: passiveSnapped };

  if (Math.abs(passiveSnapped - edge) > 0.01) fail("Passive guide drag did not snap to the element edge", results.passiveSnap);

  await dragGuide(passiveSnapped, edge + 90 + 4, 450, { guidesTool: false });
  const [passiveRightSnapped] = await guidePositions();

  if (Math.abs(passiveRightSnapped - (edge + 90)) > 0.01) fail("Passive guide drag did not snap to the element right edge", { passiveRightSnapped, expected: edge + 90 });

  await dragGuide(passiveRightSnapped, target, 450, { guidesTool: true });
  const [toolSnapped] = await guidePositions();
  results.guidesToolSnap = { position: toolSnapped, edge };

  if (Math.abs(toolSnapped - edge) > 0.01) fail("Guides-tool drag did not snap to the element edge", results.guidesToolSnap);

  await setSnap(false);
  await dragGuide(toolSnapped, target, 450, { guidesTool: false });
  const [passiveFree] = await guidePositions();
  results.passiveNoSnap = { pointer: target, position: passiveFree };

  if (Math.abs(passiveFree - target) > 0.01) fail("Passive guide drag with Snap off must follow the pointer exactly", results.passiveNoSnap);

  // Item 5: dragging a guide across selectable text must never select it.
  const textY = await page.evaluate(() => {
    const paragraph = [...document.querySelectorAll("p")].find((node) => node.textContent.includes("intentionally mixes"));
    const rect = paragraph.getBoundingClientRect();

    return Math.round(rect.top + rect.height / 4);
  });

  // Control: the same text is selectable by an ordinary drag away from any guide.
  await page.mouse.move(60, textY);
  await page.mouse.down();
  await page.mouse.move(500, textY, { steps: 6 });
  await page.mouse.up();
  results.textSelectableControl = await page.evaluate(() => getSelection()?.toString() ?? "");

  if (results.textSelectableControl === "") fail("Fixture text is not selectable, so the guide selection assertions prove nothing");
  await page.evaluate(() => getSelection()?.removeAllRanges());

  await setSnap(false);
  const [textGuide] = await guidePositions();
  await dragGuide(textGuide, 300, textY, { guidesTool: false });

  for (const guidesTool of [false, true]) {
    const [current] = await guidePositions();
    await page.evaluate(() => getSelection()?.removeAllRanges());
    const selection = await dragGuide(current, current + 260, textY, { guidesTool });
    results.selection.push({ guidesTool, ...selection });

    if (selection.selectionDuringDrag !== "" || selection.selectionAfterDrag !== "") {
      fail(`${guidesTool ? "Guides-tool" : "Passive"} guide drag selected page text`, selection);
    }

    const [moved] = await guidePositions();

    if (Math.abs(moved - (current + 260)) > 0.01) fail("Guide did not follow the text-crossing drag", { current, moved });
  }

  // Item 2: compare the painted stroke with the stored guide position at a
  // fractional position (Snap is off, so the pointer position is kept).
  for (const position of [100.5, 100]) {
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:140px;top:600px;width:80px;height:80px;background:#0af;z-index:1";
      document.body.append(probe);
    });
    await setSnap(false);
    await addGuide(position);
    const [stored] = await guidePositions();
    await page.mouse.move(640, 880);
    const strip = await page.screenshot({ clip: { x: 80, y: 500, width: 80, height: 1 } });

    const painted = await page.evaluate(async (base64) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, 1);
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, bitmap.width, 1);
      const columns = [];

      for (let column = 0; column < bitmap.width; column += 1) {
        if (data[column * 4] > 180 && data[column * 4 + 1] < 120 && data[column * 4 + 2] < 120) columns.push(80 + column);
      }

      return columns;
    }, strip.toString("base64"));

    const strokeLeft = await page.evaluate(() => document.querySelector('[data-mesurer-guide="true"]').firstElementChild.getBoundingClientRect().left);
    const paintedSpan = painted.length ? { first: painted[0], last: painted.at(-1) + 1 } : null;
    const boxEdge = 140;

    results.paint = {
      ...results.paint,
      [String(position)]: {
        requested: position,
        stored,
        strokeLayoutLeft: strokeLeft,
        paintedSpan,
        measuredDistanceToBox: boxEdge - stored,
        paintedGapToBox: paintedSpan ? boxEdge - paintedSpan.last : null,
      },
    };

    // The guide is selected right after creation, so this also proves a
    // selected guide keeps its configured 1px weight on the rounded column.
    if (!paintedSpan || paintedSpan.first !== Math.round(position) || paintedSpan.last - paintedSpan.first !== 1) {
      fail("Painted guide stroke does not match its measured position", results.paint[String(position)]);
    }

    await page.screenshot({ path: `${out}/guide-stroke-${String(position).replace(".", "_")}.png`, clip: { x: 60, y: 400, width: 200, height: 120 } });
  }

  if (diagnostics.length) fail("Guide drag contract emitted browser diagnostics", diagnostics);

  await writeFile(`${out}/guide-drag-contract.json`, JSON.stringify(results, null, 2));
  console.log("Guide drag contract: PASS");
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(`${out}/guide-drag-contract.json`, JSON.stringify(results, null, 2)).catch(() => undefined);
  await browser.close();
}


