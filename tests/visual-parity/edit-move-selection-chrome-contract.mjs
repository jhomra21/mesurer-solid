import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];

  page.on("pageerror", (error) => errors.push(String(error)));

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const settle = (ms = 500) => page.waitForTimeout(ms);

  const rect = async (locator, stage) => {
    const value = await locator.boundingBox();
    assert(value, `${stage}: expected rendered geometry`);

    return value;
  };

  const assertSameBox = (actual, expected, stage, tolerance = 1.5) => {
    for (const key of ["x", "y", "width", "height"]) {
      assert(
        Math.abs(actual[key] - expected[key]) <= tolerance,
        `${stage}: ${key} stayed behind; element=${expected[key]} chrome=${actual[key]}`,
      );
    }
  };

  // The group outline and the per-element spacing targets are document layers
  // painted from stored rects. They must follow the live elements after an
  // Edit move without any scroll or resize to trigger a re-measure.
  const documentChrome = () => page.evaluate(() => {
    const read = (element) => {
      const { x, y, width, height } = element.getBoundingClientRect();

      return { x, y, width, height };
    };

    return {
      group: [...document.querySelectorAll("[data-mesurer-selection-group-outline]")].map(read),
      spacingTargets: [...document.querySelectorAll("[data-mesurer-selection-spacing-target]")].map(read),
    };
  });

  const union = (boxes) => {
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));

    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  await page.goto(url, { waitUntil: "networkidle" });

  // Select first: leaving Edit restores a Select tool that was off before it,
  // which would clear a selection made only inside Edit.
  await page.locator('button[aria-label="Select (S)"]').click();
  await settle(300);

  const parent = page.locator("#isolated-edit-parent");
  const other = page.locator("#isolated-scroll-target");

  await parent.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await settle(400);

  const parentStart = await rect(parent, "parent before selection");
  await page.mouse.click(parentStart.x + 9, parentStart.y + 9);
  const otherStart = await rect(other, "second target before selection");

  await page.keyboard.down("Shift");
  await page.mouse.click(otherStart.x + 9, otherStart.y + 9);
  await page.keyboard.up("Shift");
  await settle();

  await page.getByRole("button", { name: /^Edit mode/ }).click();
  await settle();

  const selectedBefore = await documentChrome();

  assert.equal(selectedBefore.spacingTargets.length, 2, "Two selected elements must produce two spacing targets");
  assert.equal(selectedBefore.group.length, 1, "Two selected elements must produce one group outline");

  const parentBefore = await rect(parent, "parent before drag");
  const startX = parentBefore.x + parentBefore.width / 2;
  const startY = parentBefore.y + parentBefore.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  for (let step = 1; step <= 10; step += 1) await page.mouse.move(startX + step * 10, startY + step * 12);

  await page.mouse.up();
  await settle(700);

  const parentMoved = await rect(parent, "parent after drag");
  const otherMoved = await rect(other, "second target after drag");

  assert(
    Math.hypot(parentMoved.x - parentBefore.x, parentMoved.y - parentBefore.y) > 80,
    `The Edit drag must actually move the selection: ${JSON.stringify({ parentBefore, parentMoved })}`,
  );

  const afterMove = await documentChrome();

  assertSameBox(afterMove.group[0], union([parentMoved, otherMoved]), "group outline after Edit move");

  const targetsByTop = [...afterMove.spacingTargets].sort((left, right) => left.y - right.y);
  const elementsByTop = [otherMoved, parentMoved].sort((left, right) => left.y - right.y);

  targetsByTop.forEach((target, index) => assertSameBox(target, elementsByTop[index], `spacing target ${index} after Edit move`));

  // Returning to Select clears the transform preview; the chrome must follow
  // that move back too.
  await page.locator('button[aria-label="Select mode (1)"]').click();
  await settle(700);

  const parentReturned = await rect(parent, "parent back in Select");
  const otherReturned = await rect(other, "second target back in Select");
  const afterReturn = await documentChrome();

  assert.equal(afterReturn.spacingTargets.length, 2, "The multi-selection must survive returning to Select");

  const returnedByTop = [...afterReturn.spacingTargets].sort((left, right) => left.y - right.y);
  const returnedElementsByTop = [otherReturned, parentReturned].sort((left, right) => left.y - right.y);

  returnedByTop.forEach((target, index) => assertSameBox(target, returnedElementsByTop[index], `spacing target ${index} after returning to Select`));

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Edit move keeps multi-selection group outline and spacing targets attached to the moved elements without a scroll: PASS");
} finally {
  await browser.close();
}
