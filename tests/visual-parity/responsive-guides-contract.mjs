import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.RESPONSIVE_GUIDES_URL ?? "http://127.0.0.1:4192/responsive-preview.html";

const output = process.env.RESPONSIVE_GUIDES_OUT ?? "responsive-guides-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

const frame = page.locator("iframe[data-mesurer-responsive-frame]");

const openResponsive = async () => {
  if (!await frame.count()) await page.locator("[data-mesurer-builtin='responsive'] button").click();
  await frame.first().waitFor();
  await page.waitForFunction(() => Boolean(document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-responsive-frame]")?.contentDocument?.body));
};

const addSecondPreview = async () => {
  await page.getByLabel("Add a size").selectOption("430x932");
  await frame.nth(1).waitFor();
  await page.waitForFunction(() => Boolean(document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("[data-mesurer-responsive-frame]")[1]?.contentDocument?.body));
};

const projectedGuideLine = (index, id) => page.locator("[data-mesurer-island]").evaluateHandle((host, args) =>
  host.shadowRoot.querySelectorAll("[data-mesurer-preview-guides]")[args.index]?.querySelector(`[data-mesurer-preview-guide="${args.id}"] > div`),
{ index, id });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await page.locator("[data-mesurer-builtin='guides'] button").click();
  await page.mouse.click(250, 420);
  await page.mouse.move(8, 8);
  const rootGuideCount = await page.locator("[data-mesurer-guide='true']").count();
  assert(rootGuideCount > 0, "Set up a root guide before opening Responsive");
  await page.locator("[data-mesurer-builtin='guides'] button").click();
  await page.locator("[data-mesurer-builtin='select'] button").click();
  const rootTarget = await page.locator("#root-only-target").boundingBox();
  assert(rootTarget, "Root annotation target is visible");
  await page.mouse.click(rootTarget.x + rootTarget.width / 2, rootTarget.y + rootTarget.height / 2);
  const rootTrigger = page.locator("[data-mesurer-annotation-trigger='true']");
  await rootTrigger.waitFor({ state: "visible" });
  const triggerBox = await rootTrigger.boundingBox();
  assert(triggerBox, "Root annotation trigger is visible");
  await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
  await page.mouse.click(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
  const composer = page.locator("[data-mesurer-annotation-composer='true']");
  const composerBox = await composer.boundingBox();
  assert(composerBox, "Root note composer is visible");
  await page.mouse.move(composerBox.x + composerBox.width / 2, composerBox.y + composerBox.height / 2);
  await composer.locator("textarea").fill("Root annotation stays page-owned");
  await composer.locator("textarea").press("Enter");
  await composer.waitFor({ state: "hidden" });
  const rootAnnotationCount = await page.evaluate(async () => (await window.__MESURER__.annotations()).length);
  assert(rootAnnotationCount > 0, "Save a root annotation before opening Responsive");
  await openResponsive();
  await addSecondPreview();
  await page.locator("[data-mesurer-builtin='guides'] button").click();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-preview-guides]")?.dataset.mesurerGuidesActive === "true");

  const firstBox = await frame.nth(0).boundingBox();
  const scale = await frame.nth(0).evaluate((node) => node.getBoundingClientRect().width / node.offsetWidth);
  assert(firstBox && scale > 0, "First preview has a rendered scale");
  const clickPoint = { x: firstBox.x + 132 * scale, y: firstBox.y + 286 * scale };
  await page.mouse.move(clickPoint.x, clickPoint.y);
  await page.mouse.down();
  await page.mouse.move(clickPoint.x + 110 * scale, clickPoint.y + 20 * scale, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("[data-mesurer-preview-guide]").length > 0);

  const storedFirst = await page.locator("[data-mesurer-island]").evaluate((host) => {
    const guide = host.shadowRoot.querySelector("[data-mesurer-preview-guide]");
    const layer = guide?.parentElement;

    return { id: guide?.dataset.mesurerPreviewGuide, orientation: guide?.dataset.orientation, position: Number(guide?.dataset.position), active: layer?.dataset.mesurerGuidesActive };
  });

  assert.equal(storedFirst.orientation, "vertical");

  const snapEdges = await frame.first().evaluate((node) => [...node.contentDocument.querySelectorAll("body *")]
    .filter((element) => {
      const rect = element.getBoundingClientRect();

      return rect.width > 2 && rect.height > 2;
    })
    .flatMap((element) => {
      const rect = element.getBoundingClientRect();

      return [rect.left, rect.right, rect.left + rect.width / 2];
    }));

  assert(snapEdges.some((edge) => Math.abs(edge - storedFirst.position) < 1),
    `Snapped guide must equal a preview element edge/center in preview CSS px: ${JSON.stringify({ storedFirst, snapEdges })}`);

  const nestedTarget = await frame.first().evaluate((node) => {
    const nestedFrame = node.contentDocument.querySelector('[data-testid="nested-preview-frame"]');
    const nestedTarget = nestedFrame.contentDocument.querySelector('[data-testid="nested-inspection-target"]');
    const frameRect = nestedFrame.getBoundingClientRect();
    const targetRect = nestedTarget.getBoundingClientRect();

    return {
      left: frameRect.left + nestedFrame.clientLeft + targetRect.left,
      centerY: frameRect.top + nestedFrame.clientTop + targetRect.top + targetRect.height / 2,
    };
  });

  await page.mouse.move(firstBox.x + (nestedTarget.left + 4) * scale, firstBox.y + nestedTarget.centerY * scale);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction((expected) => {
    const guides = document.querySelector("[data-mesurer-island]")?.shadowRoot
      ?.querySelectorAll("[data-mesurer-preview-guides]")[0]?.querySelectorAll("[data-mesurer-preview-guide]");

    return guides?.length === 2 && Math.abs(Number(guides[1].dataset.position) - expected) < 1;
  }, nestedTarget.left);
  assert.equal(
    await page.locator("[data-mesurer-island]").evaluate((host) =>
      Number(host.shadowRoot.querySelectorAll("[data-mesurer-preview-guides]")[0]
        .querySelectorAll("[data-mesurer-preview-guide]")[1].dataset.position)),
    nestedTarget.left,
    "Nested-frame snap uses its edge projected into preview CSS pixels",
  );

  const snapTarget = await frame.first().evaluate((node) => {
    const rect = node.contentDocument.querySelector("#inspection-target").getBoundingClientRect();

    return { left: rect.left, centerY: rect.top + rect.height / 2 };
  });

  const guideHit = await page.locator("[data-mesurer-island]").evaluateHandle((host) =>
    host.shadowRoot.querySelector("[data-mesurer-preview-guides] [data-mesurer-preview-guide]"));

  const guideHitBox = await guideHit.boundingBox();
  assert(guideHitBox, "Guide has a physical drag target");
  await page.mouse.move(guideHitBox.x + 8, firstBox.y + snapTarget.centerY * scale);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + snapTarget.left * scale, firstBox.y + snapTarget.centerY * scale, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction((expected) => {
    const actual = Number(document.querySelector("[data-mesurer-island]")?.shadowRoot
      ?.querySelector("[data-mesurer-preview-guides] [data-mesurer-preview-guide]")?.dataset.position);

    return Math.abs(actual - expected) < 1;
  }, snapTarget.left);

  const draggedPosition = await page.locator("[data-mesurer-island]").evaluate((host) =>
    Number(host.shadowRoot.querySelector("[data-mesurer-preview-guides] [data-mesurer-preview-guide]")?.dataset.position));

  assert(Math.abs(draggedPosition - snapTarget.left) < 1, "Dragging snaps guide to the preview element's CSS-pixel edge");
  const firstProjected = await projectedGuideLine(0, storedFirst.id);
  const lineBox = await firstProjected.boundingBox();
  assert(lineBox && Math.abs(lineBox.x - (firstBox.x + draggedPosition * scale)) < 1.5, "Rendered guide aligns to scaled root coordinates");
  await page.screenshot({ path: join(output, "responsive-guides-light.png"), fullPage: true });

  const dragStartGuide = await projectedGuideLine(0, storedFirst.id);
  const dragStartBox = await dragStartGuide.boundingBox();
  assert(dragStartBox, "Selected guide has a hit target for drag ownership checks");
  await page.locator("[data-responsive-width]").first().focus();
  await page.mouse.click(dragStartBox.x + dragStartBox.width / 2, firstBox.y + 100 * scale);
  await page.keyboard.press("Delete");
  await page.waitForFunction((id) => {
    const guide = document.querySelector("[data-mesurer-island]")?.shadowRoot
      ?.querySelector(`[data-mesurer-preview-guide="${id}"]`);

    return !guide;
  }, storedFirst.id);
  assert.equal(await page.locator("[data-mesurer-preview-guide]").count(), 1,
    "Clicking a guide transfers keyboard ownership so Delete removes it despite a focused Width input");

  const widthInput = page.locator("[data-responsive-width]").first();

  await widthInput.focus();
  await widthInput.fill("400");
  await widthInput.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot
    ?.querySelector("[data-mesurer-responsive-frame]")?.getAttribute("width") === "400");
  assert.equal(await widthInput.inputValue(), "400", "Width remains editable while it retains focus");
  await widthInput.fill("393");
  await widthInput.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot
    ?.querySelector("[data-mesurer-responsive-frame]")?.getAttribute("width") === "393");

  await page.mouse.move(firstBox.x + 250 * scale, firstBox.y + 360 * scale);
  await page.mouse.down();
  await page.mouse.move(firstBox.x - 24, firstBox.y + 360 * scale, { steps: 2 });
  assert.equal(await page.locator("[data-mesurer-preview-guide]").count(), 2,
    "The in-progress guide remains present after crossing the preview edge");
  await page.mouse.move(firstBox.x + 250 * scale, firstBox.y + 360 * scale, { steps: 2 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot
    ?.querySelectorAll("[data-mesurer-preview-guides]")[0]?.querySelectorAll("[data-mesurer-preview-guide]").length === 2);
  assert.equal(await page.locator("[data-mesurer-preview-guide]").count(), 2,
    "Dragging outside and back inside before release keeps the guide");

  await page.mouse.move(firstBox.x + 330 * scale, firstBox.y + 420 * scale);
  await page.mouse.down();
  await page.mouse.move(firstBox.x - 24, firstBox.y + 420 * scale, { steps: 2 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot
    ?.querySelectorAll("[data-mesurer-preview-guides]")[0]?.querySelectorAll("[data-mesurer-preview-guide]").length === 2);
  assert.equal(await page.locator("[data-mesurer-preview-guide]").count(), 2, "Releasing a guide outside removes only the dragged guide");

  const blurGuide = await projectedGuideLine(0, (await page.locator("[data-mesurer-island]").evaluate((host) =>
    host.shadowRoot.querySelector("[data-mesurer-preview-guides] [data-mesurer-preview-guide]")?.dataset.mesurerPreviewGuide)));

  const blurGuideBox = await blurGuide.boundingBox();

  assert(blurGuideBox, "Guide has a hit target for blur cancellation");

  const blurBefore = await page.locator("[data-mesurer-island]").evaluate((host) =>
    Number(host.shadowRoot.querySelector("[data-mesurer-preview-guides] [data-mesurer-preview-guide]")?.dataset.position));

  await page.mouse.move(blurGuideBox.x + blurGuideBox.width / 2, firstBox.y + 140 * scale);

  await page.mouse.down();

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));

  await page.mouse.move(firstBox.x + (blurBefore + 30) * scale, firstBox.y + 140 * scale);

  await page.mouse.up();

  await page.waitForTimeout(50);

  const blurAfter = await page.locator("[data-mesurer-island]").evaluate((host) =>
    Number(host.shadowRoot.querySelector("[data-mesurer-preview-guides] [data-mesurer-preview-guide]")?.dataset.position));

  assert.equal(blurAfter, blurBefore, "A window blur ends guide dragging before later pointer movement");

  const secondBox = await frame.nth(1).boundingBox();
  assert(secondBox, "Second preview has rendered bounds");
  const secondScale = await frame.nth(1).evaluate((node) => node.getBoundingClientRect().width / node.offsetWidth);

  await page.mouse.move(secondBox.x + 120 * secondScale, secondBox.y + 220 * secondScale);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + 160 * secondScale, secondBox.y + 220 * secondScale, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("[data-mesurer-preview-guides]")[1]?.querySelectorAll("[data-mesurer-preview-guide]").length > 0);

  const guideCounts = await page.locator("[data-mesurer-island]").evaluate((host) =>
    [...host.shadowRoot.querySelectorAll("[data-mesurer-preview-guides]")].map((layer) => layer.querySelectorAll("[data-mesurer-preview-guide]").length));

  assert.deepEqual(guideCounts, [2, 1], "Preview guides are independent per frame");

  const guidePositions = await page.locator("[data-mesurer-island]").evaluate((host) =>
    [...host.shadowRoot.querySelectorAll("[data-mesurer-preview-guides]")[0]
      .querySelectorAll("[data-mesurer-preview-guide]")].map((guide) => Number(guide.dataset.position)));

  await page.mouse.click(firstBox.x + guidePositions[0] * scale, firstBox.y + 400 * scale);

  await page.keyboard.down("Shift");
  await page.mouse.click(firstBox.x + guidePositions[1] * scale, firstBox.y + 400 * scale);
  await page.keyboard.up("Shift");

  const multiSelected = await page.locator("[data-mesurer-island]").evaluate((host) =>
    host.shadowRoot.querySelector("[data-mesurer-preview-guides]").dataset.mesurerGuideSelection.split(",").filter(Boolean));

  assert.equal(multiSelected.length, 2, "Shift adds a second preview guide to the selection");

  await page.keyboard.down("Alt");

  const altTargetBox = await frame.first().evaluate((node) => {
    const rect = node.contentDocument.querySelector("#inspection-target").getBoundingClientRect();

    return { left: rect.left, right: rect.right, top: rect.top, height: rect.height };
  });

  await page.mouse.move(firstBox.x + (altTargetBox.left + 5) * scale,
    firstBox.y + (altTargetBox.top + altTargetBox.height / 2) * scale);

  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-preview-guide-distance]"));

  const distanceAtFirstPoint = await page.locator("[data-mesurer-island]").evaluate((host) =>
    host.shadowRoot.querySelector("[data-mesurer-preview-guide-distance]")?.textContent);

  await page.mouse.move(firstBox.x + (altTargetBox.left + 10) * scale,
    firstBox.y + (altTargetBox.top + altTargetBox.height / 2) * scale);

  const distanceAtSecondPoint = await page.locator("[data-mesurer-island]").evaluate((host) =>
    host.shadowRoot.querySelector("[data-mesurer-preview-guide-distance]")?.textContent);

  assert.equal(distanceAtSecondPoint, distanceAtFirstPoint,
    "Alt distance remains tied to element geometry while the pointer moves within the same element");

  const altGuidePosition = await page.locator("[data-mesurer-island]").evaluate((host) => {
    const layer = host.shadowRoot.querySelector("[data-mesurer-preview-guides]");
    const selected = layer.dataset.mesurerGuideSelection.split(",").filter(Boolean);
    const guide = layer.querySelector(`[data-mesurer-preview-guide="${selected.at(-1)}"]`);

    return Number(guide?.dataset.position);
  });

  const expectedDistance = await frame.first().evaluate((node, guidePosition) => {
    const target = node.contentDocument.querySelector("#inspection-target").getBoundingClientRect();

    return `${Math.round(Math.min(Math.abs(guidePosition - target.left), Math.abs(guidePosition - target.right)))}px`;
  }, altGuidePosition);

  assert.equal(distanceAtFirstPoint, expectedDistance,
    "Alt feedback equals the selected guide-to-element-edge distance in preview CSS pixels");
  await page.keyboard.up("Alt");

  const secondGuide = await page.locator("[data-mesurer-island]").evaluateHandle((host) =>
    host.shadowRoot.querySelectorAll("[data-mesurer-preview-guides]")[1].querySelector("[data-mesurer-preview-guide]"));

  const secondGuideBox = await secondGuide.boundingBox();
  assert(secondGuideBox, "Second preview guide hit target renders");
  await page.mouse.click(secondGuideBox.x + 8, secondGuideBox.y + 120);
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("[data-mesurer-preview-guides]")[1]?.dataset.mesurerGuideSelection);
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("[data-mesurer-preview-guides]")[1]?.querySelectorAll("[data-mesurer-preview-guide]").length === 0);
  assert.equal(await page.locator("[data-mesurer-island]").evaluate((host) =>
    host.shadowRoot.querySelectorAll("[data-mesurer-preview-guides]")[0].querySelectorAll("[data-mesurer-preview-guide]").length), 2,
  "Delete removes only the selected preview's guide");
  assert.equal(await page.locator("[data-mesurer-guide='true']").count(), 0, "Root guides are hidden while Responsive is open");
  assert.equal(await page.evaluate(async () => (await window.__MESURER__.annotations()).length), rootAnnotationCount,
    "Delete while Responsive is open leaves root annotations untouched");

  await page.mouse.move(secondBox.x + 180 * secondScale, secondBox.y + 340 * secondScale);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + 220 * secondScale, secondBox.y + 340 * secondScale, { steps: 2 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("[data-mesurer-preview-guides]")[1]?.querySelectorAll("[data-mesurer-preview-guide]").length === 1);
  await page.locator("[data-preview]").nth(1).getByLabel("Remove preview").click();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("[data-mesurer-responsive-frame]").length === 1);
  assert.equal(await page.locator("[data-mesurer-preview-guide]").count(), 2, "Removing a preview drops that preview's guide records");
  await addSecondPreview();

  const firstPositionBeforeZoom = await page.locator("[data-mesurer-island]").evaluate((host) =>
    Number(host.shadowRoot.querySelector("[data-mesurer-preview-guides] [data-mesurer-preview-guide]")?.dataset.position));

  const zoomGuideId = await page.locator("[data-mesurer-island]").evaluate((host) =>
    host.shadowRoot.querySelector("[data-mesurer-preview-guides] [data-mesurer-preview-guide]")?.dataset.mesurerPreviewGuide);

  await page.getByLabel("Zoom").selectOption("0.5");

  const firstPositionAfterZoom = await page.locator("[data-mesurer-island]").evaluate((host) =>
    Number(host.shadowRoot.querySelector("[data-mesurer-preview-guides] [data-mesurer-preview-guide]")?.dataset.position));

  assert.equal(firstPositionAfterZoom, firstPositionBeforeZoom, "Zoom preserves stored preview CSS position");
  const zoomedLine = await projectedGuideLine(0, zoomGuideId);
  const zoomedLineBox = await zoomedLine.boundingBox();
  const zoomedFrameBox = await frame.first().boundingBox();
  assert(zoomedLineBox && zoomedFrameBox
    && Math.abs(zoomedLineBox.x - (zoomedFrameBox.x + firstPositionAfterZoom * 0.5)) < 1.5,
  "Zoom renders the guide at its stored CSS position projected through the selected scale");
  await page.getByLabel("Zoom").selectOption("fit");

  await page.locator("[data-mesurer-tool-id='layout-guides'] button").click();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("[data-mesurer-responsive-layout-guides]").length === 2);

  const projectedBands = await page.locator("[data-mesurer-island]").evaluate((host) =>
    [...host.shadowRoot.querySelectorAll("[data-mesurer-responsive-layout-guides]")].map((overlay) => {
      const bands = [...overlay.querySelectorAll("[data-mesurer-layout-band]")];

      return bands.map((band) => {
        const rect = band.getBoundingClientRect();

        return { left: rect.left, width: rect.width };
      });
    }));

  const layoutFrameBoxes = await Promise.all([frame.nth(0).boundingBox(), frame.nth(1).boundingBox()]);

  const layoutScales = await Promise.all([0, 1].map((index) => frame.nth(index).evaluate((node) =>
    node.getBoundingClientRect().width / node.offsetWidth)));

  const expectedColumns = await Promise.all(layoutScales.map(async (scale, index) => {
    const width = index === 0 ? 393 : 430;
    const count = projectedBands[index].length;
    const gutter = 20;
    const columnWidth = (width - gutter * (count - 1)) / count;

    return projectedBands[index].map((band, bandIndex) => ({
      left: layoutFrameBoxes[index].x + (bandIndex * (columnWidth + gutter)) * scale,
      width: columnWidth * scale,
    }));
  }));

  for (let previewIndex = 0; previewIndex < 2; previewIndex += 1) {
    assert.equal(projectedBands[previewIndex].length, 5, "Default Layout Guide projects five rendered columns");

    for (let bandIndex = 0; bandIndex < 5; bandIndex += 1) {
      assert(Math.abs(projectedBands[previewIndex][bandIndex].left - expectedColumns[previewIndex][bandIndex].left) < 1.5
        && Math.abs(projectedBands[previewIndex][bandIndex].width - expectedColumns[previewIndex][bandIndex].width) < 1.5,
      `Projected band ${bandIndex} matches column math at preview width ${previewIndex === 0 ? 393 : 430}: ${JSON.stringify({ actual: projectedBands[previewIndex][bandIndex], expected: expectedColumns[previewIndex][bandIndex] })}`);
    }
  }

  await page.locator("[data-mesurer-tool-id='layout-guides'] button").click();

  await page.locator("[data-mesurer-builtin='guides'] button").click();
  await page.waitForFunction(() => [...document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("[data-mesurer-preview-guides]") ?? []]
    .every((layer) => layer.dataset.mesurerGuidesActive === "false"));
  await page.mouse.click(firstBox.x + 170 * scale, firstBox.y + 280 * scale);
  assert.equal(await page.locator("[data-mesurer-island]").evaluate((host) =>
    host.shadowRoot.querySelectorAll("[data-mesurer-preview-guides]")[0].dataset.mesurerGuidesActive), "false",
  "Leaving Guides keeps evidence visible but deactivates its hit layer");

  await page.locator("[data-mesurer-builtin='responsive'] button").click();
  await frame.waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-mesurer-guide='true']").count(), rootGuideCount, "Root guides return unchanged after close");
  await openResponsive();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("[data-mesurer-preview-guides]")[0]?.querySelectorAll("[data-mesurer-preview-guide]").length === 2);
  await page.locator("[data-mesurer-builtin='rulers'] button").click();
  await frame.waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-mesurer-guide='true']").count(), rootGuideCount, "Rulers close the stage and leave page guides scoped to root");

  await page.evaluate(() => history.pushState({}, "", `${location.pathname}?responsive-page-key=changed`));
  await page.waitForTimeout(80);
  await openResponsive();
  assert.equal(await page.locator("[data-mesurer-preview-guide]").count(), 0, "Page-key changes clear preview guides");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: join(output, "responsive-guides-dark.png"), fullPage: true });
  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);
  await writeFile(join(output, "responsive-guides.json"), `${JSON.stringify({ url, rootGuideCount, storedFirst, guideCounts, errors, rulersCloseStage: true }, null, 2)}\n`);
  console.log(`Responsive Guides contract passed. Evidence: ${output}`);
} catch (error) {
  await page.screenshot({ path: join(output, "responsive-guides-failure.png"), fullPage: true }).catch(() => undefined);
  await writeFile(join(output, "responsive-guides-failure.json"), `${JSON.stringify({ error: String(error), stack: error?.stack, errors }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
