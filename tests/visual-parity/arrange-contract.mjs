import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.ARRANGE_URL ?? "http://127.0.0.1:4174/";

const outDir = process.env.ARRANGE_OUT ?? "arrange-artifacts";

await mkdir(outDir, { recursive: true });

const evidence = {};

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const pageErrors = [];

const consoleErrors = [];

page.on("pageerror", (error) => pageErrors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const selectButton = page.locator("[data-mesurer-builtin='select'] button");
  const xrayButton = page.locator("[data-mesurer-builtin='xray'] button");
  const settingsButton = page.locator("button[data-mesurer-builtin='settings']");
  const arrangeButton = page.locator("button[data-mesurer-tool-id='arrange']");
  const target = page.locator(".primary-action");
  const reference = page.locator(".feature-copy");

  await selectButton.waitFor({ state: "visible" });
  await xrayButton.waitFor({ state: "visible" });
  await settingsButton.waitFor({ state: "visible" });
  await arrangeButton.waitFor({ state: "visible" });
  await target.waitFor({ state: "visible" });
  await reference.waitFor({ state: "visible" });
  assert.equal(await arrangeButton.isDisabled(), false, "Arrange should be available before a page selection exists");

  // Arrange is allowed to be the first tool the user chooses. Activating it must turn Select on
  // automatically; the user can then choose what to arrange without an extra toolbar step.
  await arrangeButton.click();
  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");

    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "true"
      && arrange instanceof HTMLButtonElement
      && arrange.getAttribute("aria-pressed") === "true";
  });

  const arrangeBox = page.locator("[data-mesurer-arrange-box='true']");

  const nested = await page.evaluate(() => {
    const parent = document.createElement("div");
    parent.dataset.testid = "arrange-regression-parent";
    Object.assign(parent.style, {
      position: "fixed",
      left: "930px",
      top: "520px",
      width: "260px",
      height: "220px",
      background: "rgba(255,255,255,0.02)",
      zIndex: "2147480000",
    });

    const child = document.createElement("div");
    child.dataset.testid = "arrange-regression-child";
    Object.assign(child.style, {
      width: "100%",
      height: "120px",
      background: "rgba(255,255,255,0.02)",
    });

    parent.append(child);

    const pageRoot = document.getElementById("root");

    if (!pageRoot) throw new Error("Arrange regression fixture requires #root.");
    pageRoot.append(parent);

    const parentRect = parent.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();

    return {
      parent: {
        x: parentRect.x,
        y: parentRect.y,
        width: parentRect.width,
        height: parentRect.height,
      },
      child: {
        x: childRect.x,
        y: childRect.y,
        width: childRect.width,
        height: childRect.height,
      },
    };
  });

  await page.mouse.click(
    nested.child.x + nested.child.width / 2,
    nested.child.y + nested.child.height / 2,
  );
  await arrangeBox.waitFor({ state: "visible" });
  const nestedArrangeBox = await arrangeBox.boundingBox();
  assert(nestedArrangeBox, "Arrange should render a box for the nested child");
  assert(
    Math.abs(nestedArrangeBox.x - nested.child.x) <= 1
      && Math.abs(nestedArrangeBox.y - nested.child.y) <= 1
      && Math.abs(nestedArrangeBox.width - nested.child.width) <= 1
      && Math.abs(nestedArrangeBox.height - nested.child.height) <= 1,
    `Arrange should select the nested child before testing hover ownership: ${JSON.stringify({
      expected: nested.child,
      actual: nestedArrangeBox,
    })}`,
  );

  await page.mouse.move(
    nested.parent.x + nested.parent.width / 2,
    nested.parent.y + nested.parent.height - 24,
  );
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ));

  assert.equal(
    await page.locator("[data-mesurer-selected-measurement='true']").count(),
    1,
    "Arrange should keep one logical selection for the nested child",
  );
  assert.equal(
    await page.locator("[data-mesurer-hover-measurement='true']").count(),
    0,
    "Arrange should not paint a second Select hover box while a target is selected",
  );

  await page.keyboard.press("Escape");
  await arrangeBox.waitFor({ state: "hidden" });
  assert.equal(
    await arrangeButton.getAttribute("aria-pressed"),
    "true",
    "Escape should clear the current Arrange target without deactivating Arrange",
  );
  assert.equal(
    await selectButton.getAttribute("aria-pressed"),
    "true",
    "Escape should keep Select active while clearing an Arrange target",
  );
  assert.equal(
    await page.locator("[data-mesurer-selected-measurement='true']").count(),
    0,
    "Escape should clear the current Arrange selection",
  );

  await page.mouse.move(
    nested.parent.x + nested.parent.width / 2 + 8,
    nested.parent.y + nested.parent.height - 32,
  );

  const resumedHover = page.locator("[data-mesurer-hover-measurement='true']");
  await resumedHover.waitFor({ state: "visible" });
  const resumedHoverBox = await resumedHover.boundingBox();
  assert(resumedHoverBox, "Select hover should resume after Escape clears the Arrange selection");
  assert(
    Math.abs(resumedHoverBox.x - nested.parent.x) <= 1
      && Math.abs(resumedHoverBox.y - nested.parent.y) <= 1
      && Math.abs(resumedHoverBox.width - nested.parent.width) <= 1
      && Math.abs(resumedHoverBox.height - nested.parent.height) <= 1,
    `Select hover should resume on the nested parent after Arrange clears selection: ${JSON.stringify({
      expected: nested.parent,
      actual: resumedHoverBox,
    })}`,
  );

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");

    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "false"
      && arrange instanceof HTMLButtonElement
      && arrange.getAttribute("aria-pressed") === "false";
  });
  evidence.arrangeEscape = { first: "clears selection", second: "deactivates Arrange and Select" };

  await arrangeButton.click();
  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");

    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "true"
      && arrange instanceof HTMLButtonElement
      && arrange.getAttribute("aria-pressed") === "true";
  });

  await page.evaluate(() => document.querySelector("[data-testid='arrange-regression-parent']")?.remove());

  const multiSelect = await page.evaluate(() => {
    const first = document.createElement("button");
    first.dataset.testid = "arrange-multi-first";
    first.textContent = "First";
    const middle = document.createElement("button");
    middle.dataset.testid = "arrange-multi-middle";
    middle.textContent = "Middle";
    const last = document.createElement("button");
    last.dataset.testid = "arrange-multi-last";
    last.textContent = "Last";

    for (const [element, left] of [[first, 700], [middle, 800], [last, 900]]) {
      Object.assign(element.style, {
        position: "fixed",
        left: `${left}px`,
        top: "540px",
        width: "64px",
        height: "48px",
        zIndex: "20",
      });
    }

    const pageRoot = document.getElementById("root");

    if (!pageRoot) throw new Error("Arrange multi-select fixture requires #root.");
    pageRoot.append(first, middle, last);

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { first: rect(first), middle: rect(middle), last: rect(last) };
  });

  await page.mouse.click(
    multiSelect.first.x + multiSelect.first.width / 2,
    multiSelect.first.y + multiSelect.first.height / 2,
  );
  await page.keyboard.down("Shift");
  await page.mouse.click(
    multiSelect.last.x + multiSelect.last.width / 2,
    multiSelect.last.y + multiSelect.last.height / 2,
  );
  await page.keyboard.up("Shift");
  assert.equal(
    await page.locator("[data-mesurer-selected-measurement='true']").count(),
    2,
    "Shift-click should build a two-element Arrange selection",
  );

  const twoTargetArrangeBox = await arrangeBox.boundingBox();
  assert(twoTargetArrangeBox, "Arrange should render the two-target group box");
  assert(
    multiSelect.middle.x > twoTargetArrangeBox.x
      && multiSelect.middle.x + multiSelect.middle.width < twoTargetArrangeBox.x + twoTargetArrangeBox.width,
    "The third fixture target should sit underneath the two-target Arrange group box",
  );

  await page.keyboard.down("Shift");
  await page.mouse.click(
    multiSelect.middle.x + multiSelect.middle.width / 2,
    multiSelect.middle.y + multiSelect.middle.height / 2,
  );
  await page.keyboard.up("Shift");
  assert.equal(
    await page.locator("[data-mesurer-selected-measurement='true']").count(),
    3,
    "Shift-click through the Arrange group box should add another page element",
  );
  evidence.shiftExtendThroughArrangeBox = 3;

  await page.keyboard.press("Escape");
  await arrangeBox.waitFor({ state: "hidden" });
  await page.evaluate(() => {
    document.querySelector("[data-testid='arrange-multi-first']")?.remove();
    document.querySelector("[data-testid='arrange-multi-middle']")?.remove();
    document.querySelector("[data-testid='arrange-multi-last']")?.remove();
  });

  const nestedMove = await page.evaluate(() => {
    const parent = document.createElement("div");
    parent.dataset.testid = "arrange-move-parent";
    Object.assign(parent.style, {
      position: "fixed",
      left: "760px",
      top: "620px",
      width: "260px",
      height: "180px",
      background: "rgba(255,255,255,0.02)",
      zIndex: "20",
    });

    const child = document.createElement("button");
    child.dataset.testid = "arrange-move-child";
    child.textContent = "Nested";
    Object.assign(child.style, {
      position: "absolute",
      left: "24px",
      top: "28px",
      width: "88px",
      height: "52px",
    });
    parent.append(child);

    const pageRoot = document.getElementById("root");

    if (!pageRoot) throw new Error("Arrange nested-move fixture requires #root.");
    pageRoot.append(parent);

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { parent: rect(parent), child: rect(child) };
  });

  await page.mouse.click(
    nestedMove.parent.x + nestedMove.parent.width - 24,
    nestedMove.parent.y + nestedMove.parent.height - 24,
  );
  await page.keyboard.down("Shift");
  await page.mouse.click(
    nestedMove.child.x + nestedMove.child.width / 2,
    nestedMove.child.y + nestedMove.child.height / 2,
  );
  await page.keyboard.up("Shift");
  assert.equal(
    await page.locator("[data-mesurer-selected-measurement='true']").count(),
    2,
    "Arrange should allow a parent and its child in the same multi-selection",
  );

  const nestedGroupBefore = await arrangeBox.boundingBox();

  assert(nestedGroupBefore, "Nested Arrange multi-selection should have a group box");

  const dragStart = {
    x: nestedMove.parent.x + nestedMove.parent.width - 28,
    y: nestedMove.parent.y + nestedMove.parent.height - 28,
  };

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 46, dragStart.y + 31, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ));

  const nestedAfter = await page.evaluate(() => {
    const parent = document.querySelector("[data-testid='arrange-move-parent']");
    const child = document.querySelector("[data-testid='arrange-move-child']");

    if (!(parent instanceof HTMLElement) || !(child instanceof HTMLElement)) {
      throw new Error("Arrange nested-move fixture disappeared.");
    }

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { parent: rect(parent), child: rect(child) };
  });

  const parentDelta = {
    x: nestedAfter.parent.x - nestedMove.parent.x,
    y: nestedAfter.parent.y - nestedMove.parent.y,
  };

  const childDelta = {
    x: nestedAfter.child.x - nestedMove.child.x,
    y: nestedAfter.child.y - nestedMove.child.y,
  };

  const nestedGroupAfter = await arrangeBox.boundingBox();

  assert(nestedGroupAfter, "Nested Arrange group box should remain visible after drag");

  const groupDelta = {
    x: nestedGroupAfter.x - nestedGroupBefore.x,
    y: nestedGroupAfter.y - nestedGroupBefore.y,
  };

  assert(
    Math.abs(parentDelta.x - childDelta.x) <= 1
      && Math.abs(parentDelta.y - childDelta.y) <= 1,
    `Nested Arrange targets must move by the same visual delta: ${JSON.stringify({ parentDelta, childDelta })}`,
  );
  assert(
    Math.abs(parentDelta.x - groupDelta.x) <= 1
      && Math.abs(parentDelta.y - groupDelta.y) <= 1,
    `Nested Arrange target movement must match the group box: ${JSON.stringify({ parentDelta, groupDelta })}`,
  );
  evidence.nestedMultiDrag = { parentDelta, childDelta, groupDelta };

  await page.keyboard.press("Escape");
  await arrangeBox.waitFor({ state: "hidden" });
  const regressionArrangeOptions = page.getByRole("button", { name: "Arrange options", exact: true });
  const regressionArrangeMenu = page.getByRole("menu", { name: "Arrange options", exact: true });

  await regressionArrangeOptions.click();
  await regressionArrangeMenu.waitFor({ state: "visible" });
  const regressionResetAll = regressionArrangeMenu.getByRole("menuitem", { name: "Reset all positions", exact: true });
  assert.equal(await regressionResetAll.isDisabled(), false, "Nested multi-drag should create resettable Arrange intent");
  await regressionResetAll.click();
  await regressionArrangeMenu.waitFor({ state: "hidden" });
  await page.waitForFunction(({ parentX, parentY, childX, childY }) => {
    const parent = document.querySelector("[data-testid='arrange-move-parent']");
    const child = document.querySelector("[data-testid='arrange-move-child']");

    if (!(parent instanceof HTMLElement) || !(child instanceof HTMLElement)) return false;
    const parentRect = parent.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();

    return Math.abs(parentRect.x - parentX) <= 1
      && Math.abs(parentRect.y - parentY) <= 1
      && Math.abs(childRect.x - childX) <= 1
      && Math.abs(childRect.y - childY) <= 1;
  }, {
    parentX: nestedMove.parent.x,
    parentY: nestedMove.parent.y,
    childX: nestedMove.child.x,
    childY: nestedMove.child.y,
  });
  await page.evaluate(() => document.querySelector("[data-testid='arrange-move-parent']")?.remove());

  const before = await target.boundingBox();
  const referenceBox = await reference.boundingBox();
  assert(before, "Arrange contract target must have a bounding box");
  assert(referenceBox, "Arrange reference element must have a bounding box");
  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);

  await arrangeBox.waitFor({ state: "visible" });
  assert.equal(await arrangeButton.isDisabled(), false, "Arrange should remain available after selecting a page element");

  const arrangeOptionsButton = page.getByRole("button", { name: "Arrange options", exact: true });
  const arrangeMenu = page.getByRole("menu", { name: "Arrange options", exact: true });
  const quickSnapping = () => arrangeMenu.getByRole("menuitemcheckbox", { name: "Snapping", exact: true });
  const resetAllPositions = () => arrangeMenu.getByRole("menuitem", { name: "Reset all positions", exact: true });

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  const expectedArrangeOptions = ["Snapping", "Element edges", "Element centers", "Guides", "Prefer X-ray edges", "Alignment rulers"];
  assert.deepEqual((await arrangeMenu.getByRole("menuitemcheckbox").allTextContents()).map((value) => value.trim()), expectedArrangeOptions);
  assert.equal(await resetAllPositions().isDisabled(), true, "Reset all positions should be disabled before any Arrange move exists");

  const arrangeMenuMetrics = await arrangeMenu.getByRole("menuitemcheckbox").evaluateAll((items) => items.map((item) => ({
    whiteSpace: getComputedStyle(item).whiteSpace,
    height: item.getBoundingClientRect().height,
  })));

  assert(
    arrangeMenuMetrics.every((metrics) => metrics.whiteSpace === "nowrap" && metrics.height <= 28.5),
    `Arrange quick-menu entries should stay on one compact line: ${JSON.stringify(arrangeMenuMetrics)}`,
  );
  assert.equal(await quickSnapping().getAttribute("aria-checked"), "true", "Arrange quick-menu snapping should default on");
  await quickSnapping().click();
  await arrangeMenu.waitFor({ state: "hidden" });

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  assert.equal(await quickSnapping().getAttribute("aria-checked"), "false", "Arrange quick-menu should disable snapping and close after the choice");
  await quickSnapping().click();
  await arrangeMenu.waitFor({ state: "hidden" });

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  assert.equal(await quickSnapping().getAttribute("aria-checked"), "true", "Arrange quick-menu should re-enable snapping after reopening");
  await arrangeOptionsButton.focus();
  await page.keyboard.press("Escape");
  await arrangeMenu.waitFor({ state: "hidden" });
  assert.equal(await arrangeButton.getAttribute("aria-pressed"), "true", "Closing Arrange options with Escape should not deactivate Arrange");

  await xrayButton.click();
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-mesurer-builtin='xray'] button");

    return button instanceof HTMLButtonElement && button.getAttribute("aria-pressed") === "true";
  });

  const referenceOutline = await reference.evaluate((element) => {
    const style = getComputedStyle(element);

    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) || 0 };
  });

  assert.equal(referenceOutline.style, "solid", "X-ray should render a solid outline on page elements");
  assert(referenceOutline.width > 0, "X-ray outline should have visible width");

  await settingsButton.click();
  const generalTab = page.getByRole("tab", { name: "General", exact: true });
  await generalTab.click();
  const pluginsDisclosure = page.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  await pluginsDisclosure.click();
  const arrangeSettings = page.locator("[data-mesurer-plugin-settings-section='mesurer.arrange']");
  await arrangeSettings.waitFor({ state: "visible" });
  await arrangeSettings.locator("[data-mesurer-plugin-settings-disclosure='mesurer.arrange']").click();
  const compactSettingsSurfaces = page.locator("[data-mesurer-plugin-settings='true'], [data-mesurer-plugin-settings-list='true'], [data-mesurer-plugin-settings-section='mesurer.arrange'], [data-mesurer-plugin-settings-controls='mesurer.arrange']");

  const compactSettingsBorders = await compactSettingsSurfaces.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);

    return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
  }));

  assert(
    compactSettingsBorders.every((edges) => edges.every((width) => width === "0px")),
    `Compact plugin Settings should not render boxed borders: ${JSON.stringify(compactSettingsBorders)}`,
  );
  const arrangeControls = arrangeSettings.locator("[data-mesurer-plugin-settings-controls='mesurer.arrange']");

  const settingLabels = (await arrangeControls.getByRole("switch").allTextContents())
    .map((label) => label.trim());

  assert.deepEqual(settingLabels, [
    "Snapping",
    "Element edges",
    "Element centers",
    "Guides",
    "Prefer X-ray edges",
    "Alignment rulers",
  ]);
  const snappingSwitch = arrangeControls.getByRole("switch", { name: "Snapping", exact: true });
  assert.equal(await snappingSwitch.getAttribute("aria-checked"), "true", "Arrange snapping should default on");
  await snappingSwitch.click();
  await page.waitForFunction(() => {
    const controls = document.querySelector("[data-mesurer-plugin-settings-controls='mesurer.arrange']");
    const control = controls?.querySelector("button[role='switch']");

    return control instanceof HTMLButtonElement && control.getAttribute("aria-checked") === "false";
  });
  await snappingSwitch.click();
  await page.waitForFunction(() => {
    const controls = document.querySelector("[data-mesurer-plugin-settings-controls='mesurer.arrange']");
    const control = controls?.querySelector("button[role='switch']");

    return control instanceof HTMLButtonElement && control.getAttribute("aria-checked") === "true";
  });
  await settingsButton.click();

  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");

    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "true"
      && arrange instanceof HTMLButtonElement
      && arrange.getAttribute("aria-pressed") === "true";
  });

  const verticalSnapLine = page.locator("[data-mesurer-arrange-snap-line='vertical']");
  const dragBox = await arrangeBox.boundingBox();
  assert(dragBox, "Arrange drag surface must follow the current selection");

  // Aim within the 10px snap radius of a visible X-ray edge. With X-ray edge preference on,
  // invisible element centers are not valid element snap targets.
  const rawDesiredLeft = referenceBox.x + 7;
  const dx = rawDesiredLeft - before.x;
  const startX = dragBox.x + dragBox.width / 2;
  const startY = dragBox.y + dragBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY, { steps: 4 });

  await page.waitForFunction(() => {
    const line = document.querySelector("[data-mesurer-arrange-snap-line='vertical']");

    return line instanceof HTMLElement && line.style.display === "block";
  });

  const duringDrag = await target.boundingBox();
  const snapLineBox = await verticalSnapLine.boundingBox();
  assert(duringDrag, "Arrange target must keep a bounding box while dragging");
  assert(snapLineBox, "Arrange should show a vertical alignment ruler while snapped");

  const movingEdges = [duringDrag.x, duringDrag.x + duringDrag.width];
  assert(
    movingEdges.some((edge) => Math.abs(edge - snapLineBox.x) <= 1),
    `Arrange target edge should land on the active X-ray edge ruler at ${snapLineBox.x}px; edges were ${movingEdges.join(", ")}`,
  );

  const snapMatchesXrayEdge = await page.evaluate(({ snapX, movingTop, movingBottom }) => {
    const moving = document.querySelector(".primary-action");

    if (!(moving instanceof HTMLElement)) return false;

    const rangeGap = (aStart, aEnd, bStart, bEnd) =>
      Math.max(0, Math.max(aStart, bStart) - Math.min(aEnd, bEnd));

    for (const candidate of document.querySelectorAll("*")) {
      if (!(candidate instanceof HTMLElement)) continue;

      if (candidate === moving || moving.contains(candidate)) continue;

      if (candidate.closest("[data-mesurer-island='true'], [data-mesurer-inspector-ui='true'], [data-mesurer-root='true']")) continue;
      const style = getComputedStyle(candidate);

      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") continue;

      if (style.outlineStyle !== "solid" || (Number.parseFloat(style.outlineWidth) || 0) <= 0) continue;
      const rect = candidate.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) continue;

      if (rangeGap(movingTop, movingBottom, rect.top, rect.bottom) > 160) continue;

      if ([rect.left, rect.right].some((edge) => Math.abs(edge - snapX) <= 1)) return true;
    }

    return false;
  }, {
    snapX: snapLineBox.x,
    movingTop: duringDrag.y,
    movingBottom: duringDrag.y + duringDrag.height,
  });

  assert.equal(
    snapMatchesXrayEdge,
    true,
    `Arrange ruler at ${snapLineBox.x}px should correspond to a visible X-ray box edge`,
  );

  const visibleMeasurementGhosts = await page.locator("[data-mesurer-measurement='true']").evaluateAll((elements) =>
    elements.filter((element) => getComputedStyle(element).visibility !== "hidden").length,
  );

  assert.equal(visibleMeasurementGhosts, 0, "Mesurer measurement ghosts should be hidden while Arrange is active");

  await page.mouse.up();

  await page.waitForFunction(({ left, top }) => {
    const element = document.querySelector(".primary-action");

    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();

    return Math.abs(rect.left - left) <= 1 && Math.abs(rect.top - top) <= 1;
  }, { left: duringDrag.x, top: duringDrag.y });

  const afterRelease = await target.boundingBox();
  assert(afterRelease, "Arrange target must keep a bounding box after release");
  assert(Math.abs(afterRelease.x - duringDrag.x) <= 1, "Arrange should keep the snapped Desired X position after release");
  assert(Math.abs(afterRelease.y - duringDrag.y) <= 1, "Arrange should keep the snapped Desired Y position after release");
  assert.equal(await verticalSnapLine.isVisible(), false, "Arrange alignment ruler should hide after release");

  const hiddenAfterRelease = await page.locator("[data-mesurer-measurement='true']").evaluateAll((elements) =>
    elements.every((element) => getComputedStyle(element).visibility === "hidden"),
  );

  assert.equal(hiddenAfterRelease, true, "Stale Mesurer measurement overlays should stay hidden while Arrange remains active");

  const resetPositionButton = page.getByRole("button", { name: "Reset position", exact: true });
  await resetPositionButton.waitFor({ state: "visible" });
  const resetButtonBox = await resetPositionButton.boundingBox();
  assert(resetButtonBox, "Moved Arrange targets should expose a reset-position button");
  assert(
    Math.abs(resetButtonBox.width - 24) <= 1 && Math.abs(resetButtonBox.height - 24) <= 1,
    `Reset position should use the compact 24px contextual control: ${JSON.stringify(resetButtonBox)}`,
  );
  await page.screenshot({ path: `${outDir}/arrange-reset-position.png`, fullPage: true });

  evidence.before = before;
  evidence.moved = afterRelease;
  evidence.resetButton = resetButtonBox;

  await resetPositionButton.click();
  await page.waitForFunction(({ left, top }) => {
    const element = document.querySelector(".primary-action");

    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();

    return Math.abs(rect.left - left) <= 1 && Math.abs(rect.top - top) <= 1;
  }, { left: before.x, top: before.y });
  await resetPositionButton.waitFor({ state: "hidden" });
  const afterElementReset = await target.boundingBox();
  assert(afterElementReset, "Arrange target must keep geometry after resetting one position");
  evidence.afterElementReset = afterElementReset;

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  await quickSnapping().click();
  await arrangeMenu.waitFor({ state: "hidden" });

  for (const delta of [{ x: 36, y: 18 }, { x: 24, y: 14 }]) {
    const boxValue = await arrangeBox.boundingBox();
    assert(boxValue, "Arrange box should remain available for cumulative reset-all setup");
    const x = boxValue.x + boxValue.width / 2;
    const y = boxValue.y + boxValue.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + delta.x, y + delta.y, { steps: 3 });
    await page.mouse.up();
  }

  const beforeResetAll = await target.boundingBox();
  assert(beforeResetAll, "Arrange target must have geometry before reset all");
  assert(
    Math.abs(beforeResetAll.x - before.x) > 1 || Math.abs(beforeResetAll.y - before.y) > 1,
    "Cumulative Arrange moves should move the target before Reset all positions",
  );
  evidence.beforeResetAll = beforeResetAll;

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  assert.equal(await resetAllPositions().isDisabled(), false, "Reset all positions should enable after Arrange moves exist");
  await resetAllPositions().click();
  await arrangeMenu.waitFor({ state: "hidden" });
  await page.waitForFunction(({ left, top }) => {
    const element = document.querySelector(".primary-action");

    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();

    return Math.abs(rect.left - left) <= 1 && Math.abs(rect.top - top) <= 1;
  }, { left: before.x, top: before.y });
  await resetPositionButton.waitFor({ state: "hidden" });
  const afterResetAll = await target.boundingBox();
  assert(afterResetAll, "Arrange target must keep geometry after resetting all positions");
  evidence.afterResetAll = afterResetAll;

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  await quickSnapping().click();
  await arrangeMenu.waitFor({ state: "hidden" });

  await arrangeButton.click();
  await page.waitForFunction(({ left, top }) => {
    const element = document.querySelector(".primary-action");

    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();

    return Math.abs(rect.left - left) <= 1 && Math.abs(rect.top - top) <= 1;
  }, { left: before.x, top: before.y });

  const afterDeactivate = await target.boundingBox();
  assert(afterDeactivate, "Arrange target must keep a bounding box after deactivation");
  assert(Math.abs(afterDeactivate.x - before.x) <= 1, "Deactivating Arrange should return the page to its Live X position");
  assert(Math.abs(afterDeactivate.y - before.y) <= 1, "Deactivating Arrange should return the page to its Live Y position");

  const restoredMeasurementState = await page.locator("[data-mesurer-measurement='true']").evaluateAll((elements) =>
    elements.map((element) => ({
      connected: element.isConnected,
      selected: element.getAttribute("data-mesurer-selected-measurement"),
      inspectorUi: element.getAttribute("data-mesurer-inspector-ui"),
      inlineVisibility: element.style.getPropertyValue("visibility"),
      inlinePriority: element.style.getPropertyPriority("visibility"),
      computedVisibility: getComputedStyle(element).visibility,
      parentTag: element.parentElement?.tagName ?? null,
      parentMesurerRoot: element.parentElement?.getAttribute("data-mesurer-root") ?? null,
      parentInspectorUi: element.parentElement?.getAttribute("data-mesurer-inspector-ui") ?? null,
    })),
  );

  assert(
    restoredMeasurementState.some((element) => element.computedVisibility !== "hidden"),
    `Mesurer measurement overlays should be restored after Arrange deactivates: ${JSON.stringify(restoredMeasurementState)}`,
  );

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");

    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "true"
      && document.querySelectorAll("[data-mesurer-selected-measurement='true']").length === 0;
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");

    return select instanceof HTMLButtonElement && select.getAttribute("aria-pressed") === "false";
  });
  evidence.selectEscape = { first: "clears selection", second: "deactivates Select" };

  await writeFile(
    `${outDir}/arrange-contract.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );

  assert.equal(pageErrors.length, 0, `Arrange browser contract page errors: ${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Arrange browser contract console errors: ${consoleErrors.join("\n")}`);
  console.log("Arrange Escape lifecycle + per-element reset + reset all + snapping + presentation: PASS");
} finally {
  await browser.close();
}
