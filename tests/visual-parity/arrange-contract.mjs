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
  assert.equal(await arrangeButton.isDisabled(), false, "Edit should be available before a page selection exists");

  // Edit is allowed to be the first tool the user chooses. Activating it must turn Select on
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

    if (!pageRoot) throw new Error("Edit regression fixture requires #root.");
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
  assert.equal(
    await arrangeBox.getAttribute("aria-label"),
    "Edit selected elements",
    "Edit movement box must use the public Edit name",
  );
  const nestedArrangeBox = await arrangeBox.boundingBox();
  assert(nestedArrangeBox, "Edit should render a box for the nested child");
  assert(
    Math.abs(nestedArrangeBox.x - nested.child.x) <= 1
      && Math.abs(nestedArrangeBox.y - nested.child.y) <= 1
      && Math.abs(nestedArrangeBox.width - nested.child.width) <= 1
      && Math.abs(nestedArrangeBox.height - nested.child.height) <= 1,
    `Edit should select the nested child before testing hover ownership: ${JSON.stringify({
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
    "Edit should keep one logical selection for the nested child",
  );

  const editHover = page.locator("[data-mesurer-hover-measurement='true']");
  await editHover.waitFor({ state: "visible" });
  const editHoverBox = await editHover.boundingBox();

  assert(editHoverBox, "Edit should show a hover preview for another selectable element");
  assert(
    Math.abs(editHoverBox.x - nested.parent.x) <= 1
      && Math.abs(editHoverBox.y - nested.parent.y) <= 1
      && Math.abs(editHoverBox.width - nested.parent.width) <= 1
      && Math.abs(editHoverBox.height - nested.parent.height) <= 1,
    `Edit hover should preview the unselected parent without changing selection: ${JSON.stringify({
      expected: nested.parent,
      actual: editHoverBox,
    })}`,
  );

  await page.mouse.move(
    nested.child.x + nested.child.width / 2,
    nested.child.y + nested.child.height / 2,
  );
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ));
  assert.equal(
    await page.locator("[data-mesurer-hover-measurement='true']").count(),
    0,
    "Edit should suppress redundant hover inside the already-selected subtree",
  );

  await page.keyboard.press("Escape");
  await arrangeBox.waitFor({ state: "hidden" });
  assert.equal(
    await arrangeButton.getAttribute("aria-pressed"),
    "true",
    "Escape should clear the current Edit target without deactivating Edit",
  );
  assert.equal(
    await selectButton.getAttribute("aria-pressed"),
    "true",
    "Escape should keep Select active while clearing an Edit target",
  );
  assert.equal(
    await page.locator("[data-mesurer-selected-measurement='true']").count(),
    0,
    "Escape should clear the current Edit selection",
  );

  await page.mouse.move(
    nested.parent.x + nested.parent.width / 2 + 8,
    nested.parent.y + nested.parent.height - 32,
  );

  const resumedHover = page.locator("[data-mesurer-hover-measurement='true']");
  await resumedHover.waitFor({ state: "visible" });
  const resumedHoverBox = await resumedHover.boundingBox();
  assert(resumedHoverBox, "Select hover should resume after Escape clears the Edit selection");
  assert(
    Math.abs(resumedHoverBox.x - nested.parent.x) <= 1
      && Math.abs(resumedHoverBox.y - nested.parent.y) <= 1
      && Math.abs(resumedHoverBox.width - nested.parent.width) <= 1
      && Math.abs(resumedHoverBox.height - nested.parent.height) <= 1,
    `Select hover should resume on the nested parent after Edit clears selection: ${JSON.stringify({
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
  evidence.arrangeEscape = { first: "clears selection", second: "deactivates Edit and Select" };

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

    if (!pageRoot) throw new Error("Edit multi-select fixture requires #root.");
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
    await page.locator("[data-mesurer-selection-spacing-target='true']").count(),
    2,
    "Shift-click should build a two-element Edit selection",
  );

  const twoTargetArrangeBox = await arrangeBox.boundingBox();
  assert(twoTargetArrangeBox, "Edit should render the two-target group box");
  assert(
    multiSelect.middle.x > twoTargetArrangeBox.x
      && multiSelect.middle.x + multiSelect.middle.width < twoTargetArrangeBox.x + twoTargetArrangeBox.width,
    "The third fixture target should sit underneath the two-target Edit group box",
  );

  await page.mouse.move(
    multiSelect.middle.x + multiSelect.middle.width / 2,
    multiSelect.middle.y + multiSelect.middle.height / 2,
  );
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ));

  const coveredHover = page.locator("[data-mesurer-hover-measurement='true']");
  await coveredHover.waitFor({ state: "visible" });
  const coveredHoverBox = await coveredHover.boundingBox();

  assert(coveredHoverBox, "Edit should hover an unselected target underneath the movement group box");
  assert(
    Math.abs(coveredHoverBox.x - multiSelect.middle.x) <= 1
      && Math.abs(coveredHoverBox.y - multiSelect.middle.y) <= 1
      && Math.abs(coveredHoverBox.width - multiSelect.middle.width) <= 1
      && Math.abs(coveredHoverBox.height - multiSelect.middle.height) <= 1,
    `Edit hover should pass through movement chrome to the unselected page target: ${JSON.stringify({
      expected: multiSelect.middle,
      actual: coveredHoverBox,
    })}`,
  );
  assert.equal(
    await page.locator("[data-mesurer-selection-spacing-target='true']").count(),
    2,
    "Hovering through the Edit group box must not change selection",
  );

  await page.keyboard.down("Shift");
  await page.mouse.click(
    multiSelect.middle.x + multiSelect.middle.width / 2,
    multiSelect.middle.y + multiSelect.middle.height / 2,
  );
  await page.keyboard.up("Shift");
  assert.equal(
    await page.locator("[data-mesurer-selection-spacing-target='true']").count(),
    3,
    "Shift-click through the Edit group box should add another page element",
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

    if (!pageRoot) throw new Error("Edit nested-move fixture requires #root.");
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
    await page.locator("[data-mesurer-selection-spacing-target='true']").count(),
    2,
    "Edit should allow a parent and its child in the same multi-selection",
  );

  const nestedGroupBefore = await arrangeBox.boundingBox();

  assert(nestedGroupBefore, "Nested Edit multi-selection should have a group box");

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
      throw new Error("Edit nested-move fixture disappeared.");
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

  assert(nestedGroupAfter, "Nested Edit group box should remain visible after drag");

  const groupDelta = {
    x: nestedGroupAfter.x - nestedGroupBefore.x,
    y: nestedGroupAfter.y - nestedGroupBefore.y,
  };

  assert(
    Math.abs(parentDelta.x - childDelta.x) <= 1
      && Math.abs(parentDelta.y - childDelta.y) <= 1,
    `Nested Edit targets must move by the same visual delta: ${JSON.stringify({ parentDelta, childDelta })}`,
  );
  assert(
    Math.abs(parentDelta.x - groupDelta.x) <= 1
      && Math.abs(parentDelta.y - groupDelta.y) <= 1,
    `Nested Edit target movement must match the group box: ${JSON.stringify({ parentDelta, groupDelta })}`,
  );
  evidence.nestedMultiDrag = { parentDelta, childDelta, groupDelta };

  await page.keyboard.press("Escape");
  await arrangeBox.waitFor({ state: "hidden" });
  const regressionArrangeOptions = page.getByRole("button", { name: "Edit options", exact: true });
  const regressionArrangeMenu = page.getByRole("menu", { name: "Edit options", exact: true });

  await regressionArrangeOptions.click();
  await regressionArrangeMenu.waitFor({ state: "visible" });
  const regressionResetAll = regressionArrangeMenu.getByRole("menuitem", { name: "Reset all positions", exact: true });
  assert.equal(await regressionResetAll.isDisabled(), false, "Nested multi-drag should create resettable Edit intent");
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

  const nestedFollowUp = await page.evaluate(() => {
    const parent = document.createElement("div");
    parent.dataset.testid = "arrange-follow-parent";
    Object.assign(parent.style, {
      position: "fixed",
      left: "720px",
      top: "560px",
      width: "300px",
      height: "210px",
      background: "rgba(255,255,255,0.02)",
      zIndex: "20",
      transition: "all 2s linear",
    });

    const child = document.createElement("div");
    child.dataset.testid = "arrange-follow-child";
    Object.assign(child.style, {
      position: "absolute",
      left: "32px",
      top: "36px",
      width: "190px",
      height: "118px",
      transition: "all 4s ease",
    });

    const leaf = document.createElement("button");
    leaf.dataset.testid = "arrange-follow-leaf";
    leaf.textContent = "Nested leaf";
    Object.assign(leaf.style, {
      position: "absolute",
      left: "18px",
      top: "22px",
      width: "112px",
      height: "44px",
    });

    child.append(leaf);
    parent.append(child);

    const pageRoot = document.getElementById("root");

    if (!pageRoot) throw new Error("Edit follow-up fixture requires #root.");
    pageRoot.append(parent);

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { parent: rect(parent), child: rect(child), leaf: rect(leaf) };
  });

  await page.mouse.click(
    nestedFollowUp.parent.x + nestedFollowUp.parent.width - 20,
    nestedFollowUp.parent.y + nestedFollowUp.parent.height - 20,
  );
  await arrangeBox.waitFor({ state: "visible" });

  const parentOnlyGroup = await arrangeBox.boundingBox();

  assert(parentOnlyGroup, "Parent-only Edit selection should have a group box");

  const firstDragStart = {
    x: parentOnlyGroup.x + parentOnlyGroup.width - 24,
    y: parentOnlyGroup.y + parentOnlyGroup.height - 24,
  };

  await page.mouse.move(firstDragStart.x, firstDragStart.y);
  await page.mouse.down();
  await page.mouse.move(firstDragStart.x + 58, firstDragStart.y + 34, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ));

  const afterParentMove = await page.evaluate(() => {
    const parent = document.querySelector("[data-testid='arrange-follow-parent']");
    const child = document.querySelector("[data-testid='arrange-follow-child']");
    const leaf = document.querySelector("[data-testid='arrange-follow-leaf']");

    if (!(parent instanceof HTMLElement) || !(child instanceof HTMLElement) || !(leaf instanceof HTMLElement)) {
      throw new Error("Edit follow-up fixture disappeared after parent move.");
    }

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { parent: rect(parent), child: rect(child), leaf: rect(leaf) };
  });

  const parentFirstDelta = {
    x: afterParentMove.parent.x - nestedFollowUp.parent.x,
    y: afterParentMove.parent.y - nestedFollowUp.parent.y,
  };

  const childFirstDelta = {
    x: afterParentMove.child.x - nestedFollowUp.child.x,
    y: afterParentMove.child.y - nestedFollowUp.child.y,
  };

  const leafFirstDelta = {
    x: afterParentMove.leaf.x - nestedFollowUp.leaf.x,
    y: afterParentMove.leaf.y - nestedFollowUp.leaf.y,
  };

  assert(
    Math.abs(parentFirstDelta.x - childFirstDelta.x) <= 1
      && Math.abs(parentFirstDelta.y - childFirstDelta.y) <= 1
      && Math.abs(parentFirstDelta.x - leafFirstDelta.x) <= 1
      && Math.abs(parentFirstDelta.y - leafFirstDelta.y) <= 1,
    `Moving a parent alone must carry its subtree: ${JSON.stringify({
      parentFirstDelta,
      childFirstDelta,
      leafFirstDelta,
    })}`,
  );

  await page.keyboard.down("Shift");
  await page.mouse.click(
    afterParentMove.child.x + afterParentMove.child.width / 2,
    afterParentMove.child.y + afterParentMove.child.height / 2,
  );
  await page.keyboard.up("Shift");
  assert.equal(
    await page.locator("[data-mesurer-selection-spacing-target='true']").count(),
    2,
    "Shift-click should add the already-moved parent's child to the Edit selection",
  );

  const followGroupBefore = await arrangeBox.boundingBox();

  assert(followGroupBefore, "Parent-plus-child follow-up selection should have a group box");

  const followDragStart = {
    x: followGroupBefore.x + followGroupBefore.width - 22,
    y: followGroupBefore.y + followGroupBefore.height - 22,
  };

  await page.mouse.move(followDragStart.x, followDragStart.y);
  await page.mouse.down();
  await page.mouse.move(followDragStart.x + 47, followDragStart.y + 29, { steps: 4 });
  await page.mouse.up();

  const atFollowRelease = await page.evaluate(() => {
    const parent = document.querySelector("[data-testid='arrange-follow-parent']");
    const child = document.querySelector("[data-testid='arrange-follow-child']");
    const leaf = document.querySelector("[data-testid='arrange-follow-leaf']");

    if (!(parent instanceof HTMLElement) || !(child instanceof HTMLElement) || !(leaf instanceof HTMLElement)) {
      throw new Error("Edit follow-up fixture disappeared at release.");
    }

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { parent: rect(parent), child: rect(child), leaf: rect(leaf) };
  });

  await page.waitForTimeout(350);

  const afterFollowRelease = await page.evaluate(() => {
    const parent = document.querySelector("[data-testid='arrange-follow-parent']");
    const child = document.querySelector("[data-testid='arrange-follow-child']");
    const leaf = document.querySelector("[data-testid='arrange-follow-leaf']");

    if (!(parent instanceof HTMLElement) || !(child instanceof HTMLElement) || !(leaf instanceof HTMLElement)) {
      throw new Error("Edit follow-up fixture disappeared after release.");
    }

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { parent: rect(parent), child: rect(child), leaf: rect(leaf) };
  });

  const parentFollowDelta = {
    x: atFollowRelease.parent.x - afterParentMove.parent.x,
    y: atFollowRelease.parent.y - afterParentMove.parent.y,
  };

  const childFollowDelta = {
    x: atFollowRelease.child.x - afterParentMove.child.x,
    y: atFollowRelease.child.y - afterParentMove.child.y,
  };

  const leafFollowDelta = {
    x: atFollowRelease.leaf.x - afterParentMove.leaf.x,
    y: atFollowRelease.leaf.y - afterParentMove.leaf.y,
  };

  assert(
    Math.abs(parentFollowDelta.x - childFollowDelta.x) <= 1
      && Math.abs(parentFollowDelta.y - childFollowDelta.y) <= 1
      && Math.abs(parentFollowDelta.x - leafFollowDelta.x) <= 1
      && Math.abs(parentFollowDelta.y - leafFollowDelta.y) <= 1,
    `Adding a child after moving its parent must keep the nested subtree locked together: ${JSON.stringify({
      parentFollowDelta,
      childFollowDelta,
      leafFollowDelta,
    })}`,
  );

  for (const key of ["parent", "child", "leaf"]) {
    assert(
      Math.abs(atFollowRelease[key].x - afterFollowRelease[key].x) <= 0.5
        && Math.abs(atFollowRelease[key].y - afterFollowRelease[key].y) <= 0.5,
      `Nested follow-up Edit target must stop at pointer release: ${key} ${JSON.stringify({
        atRelease: atFollowRelease[key],
        afterRelease: afterFollowRelease[key],
      })}`,
    );
  }

  evidence.nestedFollowUpDrag = {
    first: { parent: parentFirstDelta, child: childFirstDelta, leaf: leafFirstDelta },
    follow: { parent: parentFollowDelta, child: childFollowDelta, leaf: leafFollowDelta },
    atRelease: atFollowRelease,
    afterRelease: afterFollowRelease,
  };

  await page.keyboard.press("Escape");
  await arrangeBox.waitFor({ state: "hidden" });
  await page.mouse.click(
    afterFollowRelease.parent.x + afterFollowRelease.parent.width - 18,
    afterFollowRelease.parent.y + afterFollowRelease.parent.height - 18,
  );
  await arrangeBox.waitFor({ state: "visible" });

  const parentAgainGroup = await arrangeBox.boundingBox();

  assert(parentAgainGroup, "Parent-only follow-up selection should have an Edit group box");

  const parentAgainStart = {
    x: parentAgainGroup.x + parentAgainGroup.width - 24,
    y: parentAgainGroup.y + parentAgainGroup.height - 24,
  };

  await page.mouse.move(parentAgainStart.x, parentAgainStart.y);
  await page.mouse.down();
  await page.mouse.move(parentAgainStart.x + 33, parentAgainStart.y + 21, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(350);

  const afterParentAgain = await page.evaluate(() => {
    const parent = document.querySelector("[data-testid='arrange-follow-parent']");
    const child = document.querySelector("[data-testid='arrange-follow-child']");
    const leaf = document.querySelector("[data-testid='arrange-follow-leaf']");

    if (!(parent instanceof HTMLElement) || !(child instanceof HTMLElement) || !(leaf instanceof HTMLElement)) {
      throw new Error("Edit follow-up fixture disappeared after the parent-only replay.");
    }

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { parent: rect(parent), child: rect(child), leaf: rect(leaf) };
  });

  const parentAgainDelta = {
    x: afterParentAgain.parent.x - afterFollowRelease.parent.x,
    y: afterParentAgain.parent.y - afterFollowRelease.parent.y,
  };

  const childAgainDelta = {
    x: afterParentAgain.child.x - afterFollowRelease.child.x,
    y: afterParentAgain.child.y - afterFollowRelease.child.y,
  };

  const leafAgainDelta = {
    x: afterParentAgain.leaf.x - afterFollowRelease.leaf.x,
    y: afterParentAgain.leaf.y - afterFollowRelease.leaf.y,
  };

  assert(
    Math.abs(parentAgainDelta.x - childAgainDelta.x) <= 1
      && Math.abs(parentAgainDelta.y - childAgainDelta.y) <= 1
      && Math.abs(parentAgainDelta.x - leafAgainDelta.x) <= 1
      && Math.abs(parentAgainDelta.y - leafAgainDelta.y) <= 1,
    `A descendant previously selected with its parent must keep following later parent-only drags: ${JSON.stringify({
      parentAgainDelta,
      childAgainDelta,
      leafAgainDelta,
    })}`,
  );
  evidence.nestedParentReplay = {
    parent: parentAgainDelta,
    child: childAgainDelta,
    leaf: leafAgainDelta,
  };

  await page.keyboard.press("Escape");
  await arrangeBox.waitFor({ state: "hidden" });
  await regressionArrangeOptions.click();
  await regressionArrangeMenu.waitFor({ state: "visible" });
  const followResetAll = regressionArrangeMenu.getByRole("menuitem", { name: "Reset all positions", exact: true });

  assert.equal(await followResetAll.isDisabled(), false, "Nested follow-up drag should create resettable Edit intent");
  await followResetAll.click();
  await regressionArrangeMenu.waitFor({ state: "hidden" });
  await page.waitForFunction(({ parentX, parentY, childX, childY, leafX, leafY }) => {
    const parent = document.querySelector("[data-testid='arrange-follow-parent']");
    const child = document.querySelector("[data-testid='arrange-follow-child']");
    const leaf = document.querySelector("[data-testid='arrange-follow-leaf']");

    if (!(parent instanceof HTMLElement) || !(child instanceof HTMLElement) || !(leaf instanceof HTMLElement)) return false;
    const parentRect = parent.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();
    const leafRect = leaf.getBoundingClientRect();

    return Math.abs(parentRect.x - parentX) <= 1
      && Math.abs(parentRect.y - parentY) <= 1
      && Math.abs(childRect.x - childX) <= 1
      && Math.abs(childRect.y - childY) <= 1
      && Math.abs(leafRect.x - leafX) <= 1
      && Math.abs(leafRect.y - leafY) <= 1;
  }, {
    parentX: nestedFollowUp.parent.x,
    parentY: nestedFollowUp.parent.y,
    childX: nestedFollowUp.child.x,
    childY: nestedFollowUp.child.y,
    leafX: nestedFollowUp.leaf.x,
    leafY: nestedFollowUp.leaf.y,
  });
  await page.evaluate(() => document.querySelector("[data-testid='arrange-follow-parent']")?.remove());

  const transitionMove = await page.evaluate(() => {
    const first = document.createElement("button");
    first.dataset.testid = "arrange-transition-first";
    first.textContent = "Transition first";
    const second = document.createElement("button");
    second.dataset.testid = "arrange-transition-second";
    second.textContent = "Transition second";

    Object.assign(first.style, {
      position: "fixed",
      left: "710px",
      top: "570px",
      width: "120px",
      height: "48px",
      zIndex: "20",
      transition: "all 2s linear",
    });
    Object.assign(second.style, {
      position: "fixed",
      left: "880px",
      top: "650px",
      width: "130px",
      height: "48px",
      zIndex: "20",
      transition: "all 4s ease",
    });

    const pageRoot = document.getElementById("root");

    if (!pageRoot) throw new Error("Edit transition fixture requires #root.");
    pageRoot.append(first, second);

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { first: rect(first), second: rect(second) };
  });

  await page.mouse.click(
    transitionMove.first.x + transitionMove.first.width / 2,
    transitionMove.first.y + transitionMove.first.height / 2,
  );
  await page.keyboard.down("Shift");
  await page.mouse.click(
    transitionMove.second.x + transitionMove.second.width / 2,
    transitionMove.second.y + transitionMove.second.height / 2,
  );
  await page.keyboard.up("Shift");
  assert.equal(
    await page.locator("[data-mesurer-selection-spacing-target='true']").count(),
    2,
    "Transition fixture should form a two-element Edit selection",
  );

  const transitionGroupBefore = await arrangeBox.boundingBox();

  assert(transitionGroupBefore, "Transition fixture should have an Edit group box");

  const transitionDragStart = {
    x: transitionGroupBefore.x + transitionGroupBefore.width / 2,
    y: transitionGroupBefore.y + transitionGroupBefore.height / 2,
  };

  await page.mouse.move(transitionDragStart.x, transitionDragStart.y);
  await page.mouse.down();
  await page.mouse.move(transitionDragStart.x + 74, transitionDragStart.y + 43);

  const transitionDuringDrag = await page.evaluate(() => {
    const first = document.querySelector("[data-testid='arrange-transition-first']");
    const second = document.querySelector("[data-testid='arrange-transition-second']");

    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
      throw new Error("Edit transition fixture disappeared during drag.");
    }

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return {
      first: rect(first),
      second: rect(second),
      firstTransition: {
        property: getComputedStyle(first).transitionProperty,
        duration: getComputedStyle(first).transitionDuration,
      },
      secondTransition: {
        property: getComputedStyle(second).transitionProperty,
        duration: getComputedStyle(second).transitionDuration,
      },
    };
  });

  const transitionGroupDuringDrag = await arrangeBox.boundingBox();

  assert(transitionGroupDuringDrag, "Transition fixture group box should move during drag");

  const transitionGroupDelta = {
    x: transitionGroupDuringDrag.x - transitionGroupBefore.x,
    y: transitionGroupDuringDrag.y - transitionGroupBefore.y,
  };

  const transitionFirstDelta = {
    x: transitionDuringDrag.first.x - transitionMove.first.x,
    y: transitionDuringDrag.first.y - transitionMove.first.y,
  };

  const transitionSecondDelta = {
    x: transitionDuringDrag.second.x - transitionMove.second.x,
    y: transitionDuringDrag.second.y - transitionMove.second.y,
  };

  assert.equal(transitionDuringDrag.firstTransition.property, "none", "Edit must suppress transition-all on the first moved target");
  assert.equal(transitionDuringDrag.secondTransition.property, "none", "Edit must suppress transition-all on the second moved target");
  assert(
    Math.abs(transitionFirstDelta.x - transitionGroupDelta.x) <= 1
      && Math.abs(transitionFirstDelta.y - transitionGroupDelta.y) <= 1
      && Math.abs(transitionSecondDelta.x - transitionGroupDelta.x) <= 1
      && Math.abs(transitionSecondDelta.y - transitionGroupDelta.y) <= 1,
    `Transitioning Edit targets must follow the pointer without easing lag: ${JSON.stringify({
      transitionGroupDelta,
      transitionFirstDelta,
      transitionSecondDelta,
    })}`,
  );

  await page.mouse.up();

  const transitionAtRelease = await page.evaluate(() => {
    const first = document.querySelector("[data-testid='arrange-transition-first']");
    const second = document.querySelector("[data-testid='arrange-transition-second']");

    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
      throw new Error("Edit transition fixture disappeared at release.");
    }

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { first: rect(first), second: rect(second) };
  });

  await page.waitForTimeout(350);

  const transitionAfterRelease = await page.evaluate(() => {
    const first = document.querySelector("[data-testid='arrange-transition-first']");
    const second = document.querySelector("[data-testid='arrange-transition-second']");

    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
      throw new Error("Edit transition fixture disappeared after release.");
    }

    const rect = (element) => {
      const value = element.getBoundingClientRect();

      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };

    return { first: rect(first), second: rect(second) };
  });

  for (const key of ["first", "second"]) {
    assert(
      Math.abs(transitionAtRelease[key].x - transitionAfterRelease[key].x) <= 0.5
        && Math.abs(transitionAtRelease[key].y - transitionAfterRelease[key].y) <= 0.5,
      `Edit target must stop moving at pointer release even with host transitions: ${key} ${JSON.stringify({
        atRelease: transitionAtRelease[key],
        afterRelease: transitionAfterRelease[key],
      })}`,
    );
  }

  evidence.transitionMultiDrag = {
    groupDelta: transitionGroupDelta,
    firstDelta: transitionFirstDelta,
    secondDelta: transitionSecondDelta,
    atRelease: transitionAtRelease,
    afterRelease: transitionAfterRelease,
  };

  await page.keyboard.press("Escape");
  await arrangeBox.waitFor({ state: "hidden" });
  await regressionArrangeOptions.click();
  await regressionArrangeMenu.waitFor({ state: "visible" });
  const transitionResetAll = regressionArrangeMenu.getByRole("menuitem", { name: "Reset all positions", exact: true });

  assert.equal(await transitionResetAll.isDisabled(), false, "Transition multi-drag should create resettable Edit intent");
  await transitionResetAll.click();
  await regressionArrangeMenu.waitFor({ state: "hidden" });
  await page.waitForFunction(({ firstX, firstY, secondX, secondY }) => {
    const first = document.querySelector("[data-testid='arrange-transition-first']");
    const second = document.querySelector("[data-testid='arrange-transition-second']");

    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) return false;
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();

    return Math.abs(firstRect.x - firstX) <= 1
      && Math.abs(firstRect.y - firstY) <= 1
      && Math.abs(secondRect.x - secondX) <= 1
      && Math.abs(secondRect.y - secondY) <= 1;
  }, {
    firstX: transitionMove.first.x,
    firstY: transitionMove.first.y,
    secondX: transitionMove.second.x,
    secondY: transitionMove.second.y,
  });

  const restoredTransitions = await page.evaluate(() => {
    const first = document.querySelector("[data-testid='arrange-transition-first']");
    const second = document.querySelector("[data-testid='arrange-transition-second']");

    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
      throw new Error("Edit transition fixture disappeared after reset.");
    }

    const firstStyle = getComputedStyle(first);
    const secondStyle = getComputedStyle(second);

    return {
      first: { property: firstStyle.transitionProperty, duration: firstStyle.transitionDuration },
      second: { property: secondStyle.transitionProperty, duration: secondStyle.transitionDuration },
    };
  });

  assert.equal(restoredTransitions.first.property, "all", "Reset must restore the first target's transition property");
  assert.equal(restoredTransitions.first.duration, "2s", "Reset must restore the first target's transition duration");
  assert.equal(restoredTransitions.second.property, "all", "Reset must restore the second target's transition property");
  assert.equal(restoredTransitions.second.duration, "4s", "Reset must restore the second target's transition duration");
  evidence.transitionRestoration = restoredTransitions;
  await page.evaluate(() => {
    document.querySelector("[data-testid='arrange-transition-first']")?.remove();
    document.querySelector("[data-testid='arrange-transition-second']")?.remove();
  });

  const before = await target.boundingBox();
  const referenceBox = await reference.boundingBox();
  assert(before, "Edit contract target must have a bounding box");
  assert(referenceBox, "Edit reference element must have a bounding box");
  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);

  await arrangeBox.waitFor({ state: "visible" });
  assert.equal(await arrangeButton.isDisabled(), false, "Edit should remain available after selecting a page element");

  const arrangeOptionsButton = page.getByRole("button", { name: "Edit options", exact: true });
  const arrangeMenu = page.getByRole("menu", { name: "Edit options", exact: true });
  const quickSnapping = () => arrangeMenu.getByRole("menuitemcheckbox", { name: "Snapping", exact: true });
  const resetAllPositions = () => arrangeMenu.getByRole("menuitem", { name: "Reset all positions", exact: true });

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  const expectedArrangeOptions = ["Snapping", "Element edges", "Element centers", "Guides", "Prefer X-ray edges", "Alignment rulers"];
  assert.deepEqual((await arrangeMenu.getByRole("menuitemcheckbox").allTextContents()).map((value) => value.trim()), expectedArrangeOptions);
  assert.equal(await resetAllPositions().isDisabled(), true, "Reset all positions should be disabled before any Edit move exists");

  const arrangeMenuMetrics = await arrangeMenu.getByRole("menuitemcheckbox").evaluateAll((items) => items.map((item) => ({
    whiteSpace: getComputedStyle(item).whiteSpace,
    height: item.getBoundingClientRect().height,
  })));

  assert(
    arrangeMenuMetrics.every((metrics) => metrics.whiteSpace === "nowrap" && metrics.height <= 28.5),
    `Edit quick-menu entries should stay on one compact line: ${JSON.stringify(arrangeMenuMetrics)}`,
  );
  assert.equal(await quickSnapping().getAttribute("aria-checked"), "true", "Edit quick-menu snapping should default on");
  await quickSnapping().click();
  await arrangeMenu.waitFor({ state: "hidden" });

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  assert.equal(await quickSnapping().getAttribute("aria-checked"), "false", "Edit quick-menu should disable snapping and close after the choice");
  await quickSnapping().click();
  await arrangeMenu.waitFor({ state: "hidden" });

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  assert.equal(await quickSnapping().getAttribute("aria-checked"), "true", "Edit quick-menu should re-enable snapping after reopening");
  await arrangeOptionsButton.focus();
  await page.keyboard.press("Escape");
  await arrangeMenu.waitFor({ state: "hidden" });
  assert.equal(await arrangeButton.getAttribute("aria-pressed"), "true", "Closing Edit options with Escape should not deactivate Edit");

  await page.locator('button[data-mesurer-toolbar-mode="select"]').click();
  await page.locator('[data-mesurer-toolbar="true"][data-mesurer-toolbar-mode="select"]').waitFor({ state: "visible" });
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
  assert.equal(await snappingSwitch.getAttribute("aria-checked"), "true", "Edit snapping should default on");
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

  // X-ray is Select-owned. Re-entering Edit must suspend it while preserving
  // ordinary element-edge snapping inside Edit.
  if ((await arrangeButton.getAttribute("aria-pressed")) !== "true") await arrangeButton.click();

  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const xray = document.querySelector("[data-mesurer-builtin='xray'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");

    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "true"
      && xray instanceof HTMLButtonElement
      && xray.getAttribute("aria-pressed") === "false"
      && arrange instanceof HTMLButtonElement
      && arrange.getAttribute("aria-pressed") === "true";
  });

  // Select was off before the first Edit entry, so returning to Select restores
  // that off state and clears its selection. Re-entering Edit must enable Select
  // as an internal dependency without resurrecting the old target.
  const resumedTarget = await target.boundingBox();

  assert(resumedTarget, "Edit target must remain in the document after mode restoration");
  await page.mouse.click(
    resumedTarget.x + resumedTarget.width / 2,
    resumedTarget.y + resumedTarget.height / 2,
  );
  await arrangeBox.waitFor({ state: "visible" });

  const verticalSnapLine = page.locator("[data-mesurer-arrange-snap-line='vertical']");

  if (!(await arrangeBox.isVisible())) {
    const currentTargetBox = await target.boundingBox();

    assert(currentTargetBox, "Edit contract target must remain measurable after the mode switch");
    await page.mouse.click(
      currentTargetBox.x + currentTargetBox.width / 2,
      currentTargetBox.y + currentTargetBox.height / 2,
    );
    await arrangeBox.waitFor({ state: "visible" });
  }

  const dragBox = await arrangeBox.boundingBox();
  assert(dragBox, "Edit drag surface must follow the current selection");

  // Aim within the 10px snap radius of the reference element edge. Select X-ray is
  // suspended in Edit, so snapping falls back to normal element-edge candidates.
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
  assert(duringDrag, "Edit target must keep a bounding box while dragging");
  assert(snapLineBox, "Edit should show a vertical alignment ruler while snapped");

  const movingEdges = [duringDrag.x, duringDrag.x + duringDrag.width];
  assert(
    movingEdges.some((edge) => Math.abs(edge - snapLineBox.x) <= 1),
    `Edit target edge should land on the active X-ray edge ruler at ${snapLineBox.x}px; edges were ${movingEdges.join(", ")}`,
  );

  const snapMatchesElementEdge = await page.evaluate(({ snapX, movingTop, movingBottom }) => {
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
    snapMatchesElementEdge,
    true,
    `Edit ruler at ${snapLineBox.x}px should correspond to an eligible page-element edge`,
  );

  const visibleMeasurementGhosts = await page.locator("[data-mesurer-measurement='true']").evaluateAll((elements) =>
    elements.filter((element) => getComputedStyle(element).visibility !== "hidden").length,
  );

  assert.equal(visibleMeasurementGhosts, 0, "Mesurer measurement ghosts should be hidden while Edit is active");

  await page.mouse.up();

  await page.waitForFunction(({ left, top }) => {
    const element = document.querySelector(".primary-action");

    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();

    return Math.abs(rect.left - left) <= 1 && Math.abs(rect.top - top) <= 1;
  }, { left: duringDrag.x, top: duringDrag.y });

  const afterRelease = await target.boundingBox();
  assert(afterRelease, "Edit target must keep a bounding box after release");
  assert(Math.abs(afterRelease.x - duringDrag.x) <= 1, "Edit should keep the snapped Desired X position after release");
  assert(Math.abs(afterRelease.y - duringDrag.y) <= 1, "Edit should keep the snapped Desired Y position after release");
  assert.equal(await verticalSnapLine.isVisible(), false, "Edit alignment ruler should hide after release");

  const hiddenAfterRelease = await page.locator("[data-mesurer-measurement='true']").evaluateAll((elements) =>
    elements.every((element) => getComputedStyle(element).visibility === "hidden"),
  );

  assert.equal(hiddenAfterRelease, true, "Stale Mesurer measurement overlays should stay hidden while Edit remains active");

  const resetPositionButton = page.getByRole("button", { name: "Reset position", exact: true });
  await resetPositionButton.waitFor({ state: "visible" });
  const resetButtonBox = await resetPositionButton.boundingBox();
  assert(resetButtonBox, "Moved Edit targets should expose a reset-position button");
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
  assert(afterElementReset, "Edit target must keep geometry after resetting one position");
  evidence.afterElementReset = afterElementReset;

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  await quickSnapping().click();
  await arrangeMenu.waitFor({ state: "hidden" });

  for (const delta of [{ x: 36, y: 18 }, { x: 24, y: 14 }]) {
    const boxValue = await arrangeBox.boundingBox();
    assert(boxValue, "Edit box should remain available for cumulative reset-all setup");
    const x = boxValue.x + boxValue.width / 2;
    const y = boxValue.y + boxValue.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + delta.x, y + delta.y, { steps: 3 });
    await page.mouse.up();
  }

  const beforeResetAll = await target.boundingBox();
  assert(beforeResetAll, "Edit target must have geometry before reset all");
  assert(
    Math.abs(beforeResetAll.x - before.x) > 1 || Math.abs(beforeResetAll.y - before.y) > 1,
    "Cumulative Edit moves should move the target before Reset all positions",
  );
  evidence.beforeResetAll = beforeResetAll;

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  assert.equal(await resetAllPositions().isDisabled(), false, "Reset all positions should enable after Edit moves exist");
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
  assert(afterResetAll, "Edit target must keep geometry after resetting all positions");
  evidence.afterResetAll = afterResetAll;

  await arrangeOptionsButton.click();
  await arrangeMenu.waitFor({ state: "visible" });
  await quickSnapping().click();
  await arrangeMenu.waitFor({ state: "hidden" });

  await page.locator('button[data-mesurer-toolbar-mode="select"]').click();
  await page.waitForFunction(({ left, top }) => {
    const element = document.querySelector(".primary-action");

    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();

    return Math.abs(rect.left - left) <= 1 && Math.abs(rect.top - top) <= 1;
  }, { left: before.x, top: before.y });

  const afterDeactivate = await target.boundingBox();
  assert(afterDeactivate, "Edit target must keep a bounding box after deactivation");
  assert(Math.abs(afterDeactivate.x - before.x) <= 1, "Deactivating Edit should return the page to its Live X position");
  assert(Math.abs(afterDeactivate.y - before.y) <= 1, "Deactivating Edit should return the page to its Live Y position");

  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");

    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "false"
      && document.querySelectorAll("[data-mesurer-selected-measurement='true']").length === 0;
  });

  const selectButtonAfterEdit = page.locator("[data-mesurer-builtin='select'] button");

  await selectButtonAfterEdit.click();
  const escapeTarget = await target.boundingBox();

  assert(escapeTarget, "Select Escape contract target must remain visible");
  await page.mouse.click(
    escapeTarget.x + escapeTarget.width / 2,
    escapeTarget.y + escapeTarget.height / 2,
  );
  await page.locator("[data-mesurer-selected-measurement='true']").waitFor({ state: "visible" });

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
  evidence.selectEscape = {
    editExit: "restores Select off",
    first: "clears selection",
    second: "deactivates Select",
  };

  await writeFile(
    `${outDir}/arrange-contract.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );

  assert.equal(pageErrors.length, 0, `Edit browser contract page errors: ${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Edit browser contract console errors: ${consoleErrors.join("\n")}`);
  console.log("Edit Escape lifecycle + per-element reset + reset all + snapping + presentation: PASS");
} finally {
  await browser.close();
}
