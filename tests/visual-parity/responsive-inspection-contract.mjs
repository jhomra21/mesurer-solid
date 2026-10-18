import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.RESPONSIVE_INSPECTION_URL ?? "http://127.0.0.1:4190/responsive-preview.html";

const output = process.env.RESPONSIVE_INSPECTION_OUT ?? "responsive-inspection-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("frame-ancestors 'none'")) errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));

const frame = page.locator("iframe[data-mesurer-responsive-frame]");

const open = async () => {
  await page.locator("button[data-mesurer-builtin='responsive']").click();
  await frame.waitFor({ timeout: 5000 }).catch(async () => {
    const state = await page.evaluate(() => ({
      stage: Boolean(document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-responsive-stage]")),
      button: document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("button[data-mesurer-builtin='responsive']")?.outerHTML,
      mode: document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-toolbar]")?.getAttribute("data-mesurer-toolbar-mode"),
      errors: window.__MESURER__?.state?.(),
    }));

    throw new Error(`Responsive stage failed to open: ${JSON.stringify(state)}`);
  });
  await page.frameLocator("iframe[data-mesurer-responsive-frame]")
    .getByTestId("inspection-target").waitFor();
  await settle();
};

const close = async () => {
  await page.getByRole("button", { name: "Close Responsive" }).click();
  await frame.waitFor({ state: "detached" });
  await settle();
};

const selectedContext = () => page.evaluate(() => window.__MESURER__.context({ scope: "selection" }));

const targetRectInRoot = async (selector) => page.evaluate((targetSelector) => {
  const root = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;
  const target = root.querySelector(targetSelector) ?? document.querySelector(targetSelector);

  if (!target) throw new Error(`Missing selection evidence ${targetSelector}`);

  return target.getBoundingClientRect().toJSON();
}, selector);

const assertRect = (actual, expected, label) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(Math.abs(actual[key] - expected[key]) <= 1, `${label} ${key}: expected ${expected[key]}, got ${actual[key]}`);
  }
};

const expectedProjection = () => page.evaluate(() => {
  const root = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;
  const preview = root.querySelector("iframe[data-mesurer-responsive-frame]");
  const target = preview?.contentDocument?.querySelector("[data-testid='inspection-target']");

  if (!(preview instanceof HTMLIFrameElement) || !target) throw new Error("Preview target is unavailable");
  const frameRect = preview.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const scale = frameRect.width / preview.offsetWidth;

  return {
    x: frameRect.left + (targetRect.left + preview.clientLeft) * scale,
    y: frameRect.top + (targetRect.top + preview.clientTop) * scale,
    width: targetRect.width * scale,
    height: targetRect.height * scale,
    selector: "#inspection-target",
  };
});

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  const rootRect = await page.locator("[data-testid='edit-target']").boundingBox();
  assert(rootRect, "Root page fixture target should render");
  await page.locator("[data-mesurer-builtin='xray'] button").click();
  const rootXrayBefore = await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid='edit-target']")).outlineStyle);
  assert.equal(rootXrayBefore, "solid", "X-ray must be enabled on the root page before opening Responsive");

  await open();
  const expected = await expectedProjection();
  await frame.evaluate((node) => {
    node.contentDocument.__contractPointerMoves = 0;
    node.contentDocument.addEventListener("pointermove", () => node.contentDocument.__contractPointerMoves++, true);
  });
  const point = { x: expected.x + expected.width / 2, y: expected.y + expected.height / 2 };
  await page.mouse.move(point.x, point.y, { steps: 3 });
  await page.locator("[data-mesurer-hover-measurement='true']").waitFor({ state: "visible" });
  assertRect(await targetRectInRoot("[data-mesurer-hover-measurement='true']"), expected, "Preview hover");
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;
    const selection = root.querySelector("[data-mesurer-selected-measurement='true']");

    return Boolean(selection);
  });
  const selected = await selectedContext();
  assert.equal(selected.targets[0]?.inspection.selector, expected.selector,
    `Selection identity must be the preview document target: ${JSON.stringify(selected.targets[0])}`);
  assertRect(await targetRectInRoot("[data-mesurer-selected-measurement='true'] > div"), expected, "Preview selection outline");
  const inspectCard = page.locator("[data-mesurer-inspect-info-card]");
  await inspectCard.waitFor({ state: "visible" });

  const sourceCardEvidence = await frame.evaluate((node) => {
    const target = node.contentDocument.querySelector("[data-testid='inspection-target']");
    const rect = target.getBoundingClientRect();

    return { width: Math.round(rect.width), height: Math.round(rect.height), color: getComputedStyle(target).color };
  });

  assert.equal(await inspectCard.getByRole("button", { name: "Copy dimensions" }).innerText(),
    `${sourceCardEvidence.width} x ${sourceCardEvidence.height}`,
    "Responsive Inspect card dimensions use preview CSS pixels, not projected root pixels");
  assert.equal(await inspectCard.evaluate((element) => element.ownerDocument === document), true,
    "Selected preview Inspect card stays in the protected root overlay");
  assert.equal(await frame.evaluate((node) => node.contentDocument.querySelectorAll("[data-mesurer-inspect-info-card]").length), 0,
    "Inspect UI is never mounted in the Responsive document");
  assert.equal(await inspectCard.locator("[data-mesurer-inspect-css-row]").filter({ hasText: "color" }).last().locator("button").innerText(),
    sourceCardEvidence.color, "Preview CSS evidence reads computed styles from the source document");
  await page.screenshot({ path: join(output, "preview-selected.png"), fullPage: true });

  await page.getByLabel("Add a size").selectOption("430x932");
  await page.locator("[data-mesurer-responsive-frame]").nth(1).waitFor();
  await page.waitForFunction(() => {
    const preview = document.querySelector("[data-mesurer-island]")?.shadowRoot
      ?.querySelectorAll("iframe[data-mesurer-responsive-frame]")[1];

    return Boolean(preview?.contentDocument?.querySelector("[data-testid='inspection-target']"));
  });

  const secondTarget = await page.locator("iframe[data-mesurer-responsive-frame]").nth(1).evaluate((preview) => {
    const target = preview.contentDocument.querySelector("[data-testid='inspection-target']");
    const frameRect = preview.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const scale = frameRect.width / preview.offsetWidth;

    return {
      x: frameRect.left + (targetRect.left + preview.clientLeft) * scale,
      y: frameRect.top + (targetRect.top + preview.clientTop) * scale,
      width: targetRect.width * scale,
      height: targetRect.height * scale,
    };
  });

  await page.mouse.move(secondTarget.x + secondTarget.width / 2, secondTarget.y + secondTarget.height / 2);
  await page.locator("[data-mesurer-hover-measurement='true']").waitFor({ state: "visible" });
  await page.mouse.click(secondTarget.x + secondTarget.width / 2, secondTarget.y + secondTarget.height / 2);
  await page.waitForFunction(() => Boolean(document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-selected-measurement='true']")));
  assert.equal((await selectedContext()).targets[0]?.inspection.selector, "#inspection-target",
    "The second differently scaled preview must remain inspectable");

  await page.locator("[data-mesurer-responsive-frame]").nth(1)
    .evaluate((preview) => { window.__responsiveRemovedPreviewDocument = preview.contentDocument; });

  await page.locator("[data-preview]").nth(1).getByLabel("Remove preview").click();
  await page.waitForFunction(() => !document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-selected-measurement='true']"));
  assert.equal(await page.locator("[data-mesurer-hover-measurement='true']").count(), 0,
    "Removing the preview clears its hover and selection evidence");
  await page.waitForFunction(() => {
    const frame = document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("iframe[data-mesurer-responsive-frame]");

    return Boolean(frame?.contentDocument?.body.classList.contains("mesurer-solid-xray"));
  });
  assert.equal(await page.locator("[data-mesurer-island] iframe[data-mesurer-responsive-frame]").first()
    .evaluate((preview) => preview.contentDocument.querySelectorAll("[data-mesurer-xray-style]").length), 1,
  "Remaining preview retains its X-ray style after removal");
  assert.deepEqual(await page.evaluate(() => {
    const document = window.__responsiveRemovedPreviewDocument;

    return {
      classPresent: document.body.classList.contains("mesurer-solid-xray"),
      styleCount: document.querySelectorAll("[data-mesurer-xray-style]").length,
    };
  }), { classPresent: false, styleCount: 0 }, "Removed preview loses X-ray styling and its document watcher");

  await page.mouse.move(point.x, point.y);
  await close();
  await settle();
  assert.equal(await page.locator("[data-mesurer-hover-measurement='true']").count(), 0,
    "Closing while the pointer remains over preview geometry must not restore stale hover evidence");
  await open();
  const refreshedProjection = await expectedProjection();
  await page.mouse.move(5, 5);
  await page.mouse.move(refreshedProjection.x + refreshedProjection.width / 2, refreshedProjection.y + refreshedProjection.height / 2);
  await page.locator("[data-mesurer-hover-measurement='true']").waitFor({ state: "visible" });
  await page.mouse.click(refreshedProjection.x + refreshedProjection.width / 2, refreshedProjection.y + refreshedProjection.height / 2);
  await page.waitForFunction(() => Boolean(document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-selected-measurement='true']")));

  assert.equal(await page.locator("[data-mesurer-annotation-trigger='true']").count(), 1,
    "Context annotation trigger is available for viewport-scoped preview targets");
  const addNote = page.locator("[data-mesurer-tool-id='context.add-note'] button");
  assert.equal(await addNote.isDisabled(), false, "Add Note toolbar action must be enabled for preview selection");
  await page.evaluate(async () => {
    const host = await window.__responsiveMount.ready;
    await host.command.execute("context.add-note");
  });
  assert.equal(await page.locator("[data-mesurer-annotation-composer='true']").count(), 1,
    "context.add-note command opens a composer for preview selection");
  await page.locator("[data-mesurer-annotation-composer='true'] textarea").press("Escape");

  await page.locator("[data-mesurer-builtin='text-inspector'] button").click();
  const typographyTarget = page.frameLocator("iframe[data-mesurer-responsive-frame]").getByTestId("inspection-target");
  const typographyBox = await typographyTarget.boundingBox();
  assert(typographyBox, "Typography target should be visible");
  await page.mouse.move(typographyBox.x + typographyBox.width / 2, typographyBox.y + typographyBox.height / 2);
  await page.locator(".mesurer-ti-box[data-state='visible']").waitFor();
  assertRect(await targetRectInRoot(".mesurer-ti-box[data-state='visible']"), expected, "Preview Typography hover");
  await typographyTarget.evaluate((element) => element.blur());
  await page.mouse.click(typographyBox.x + typographyBox.width / 2, typographyBox.y + typographyBox.height / 2);
  await page.locator(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']").waitFor();
  assert.equal(await typographyTarget.evaluate((element) => element.matches(":focus")), false,
    "Typography click must not activate preview page content");
  await page.locator("[data-mesurer-builtin='text-inspector'] button").click();

  const previewBox = await frame.boundingBox();
  assert(previewBox, "Responsive preview should have rendered bounds");
  await page.locator("[data-mesurer-builtin='select'] button").click();
  await page.mouse.move(previewBox.x + 5, previewBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(previewBox.x + previewBox.width - 5, previewBox.y + previewBox.height - 15, { steps: 8 });
  await page.mouse.up();
  await settle();
  const marqueeContext = await selectedContext();
  assert(marqueeContext.targets.length > 0, "Preview marquee should select preview elements");
  assert(marqueeContext.targets.every(({ inspection }) =>
    inspection.rect.x >= previewBox.x - 1
    && inspection.rect.y >= previewBox.y - 1
    && inspection.rect.right <= previewBox.x + previewBox.width + 1
    && inspection.rect.bottom <= previewBox.y + previewBox.height + 1),
  "Preview marquee selections must stay within projected preview geometry, not root-page targets");

  await close();
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    return root.querySelectorAll("[data-mesurer-selected-measurement='true']").length === 0;
  });
  await assert.rejects(selectedContext(), /no current selection/i, "Closing must clear preview selection");
  await open();
  const reopenTarget = await expectedProjection();
  await page.mouse.move(5, 5);
  await page.mouse.move(reopenTarget.x + reopenTarget.width / 2, reopenTarget.y + reopenTarget.height / 2, { steps: 2 });
  await page.locator("[data-mesurer-hover-measurement='true']").waitFor({ state: "visible" });
  await page.mouse.click(reopenTarget.x + reopenTarget.width / 2, reopenTarget.y + reopenTarget.height / 2);
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    return Boolean(root.querySelector("[data-mesurer-selected-measurement='true']"));
  });
  assert.equal((await selectedContext()).targets[0]?.inspection.selector, reopenTarget.selector,
    "Reopening must permit fresh preview selection");

  await page.mouse.move(6, 6, { steps: 3 });
  await settle();
  assert.equal(await page.locator("[data-mesurer-hover-measurement='true']").count(), 0,
    "Responsive stage background must block evidence from the underlying page");
  const rootOnlyBox = await page.locator("#root-only-target").boundingBox();
  assert(rootOnlyBox, "Root-only page target should remain visibly behind the stage");
  await page.mouse.move(rootOnlyBox.x + rootOnlyBox.width / 2, rootOnlyBox.y + rootOnlyBox.height / 2, { steps: 3 });
  await settle();
  assert.equal(await page.locator("[data-mesurer-hover-measurement='true']").count(), 0,
    "A visible underlying root-page target must not receive hover evidence through the stage");
  const headerBox = await page.locator("[data-mesurer-responsive-header]").boundingBox();
  assert(headerBox, "Responsive header should render");
  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2, { steps: 3 });
  await settle();
  assert.equal(await page.locator("[data-mesurer-hover-measurement='true']").count(), 0,
    "Responsive header must block hover evidence");
  await page.screenshot({ path: join(output, "stage-chrome-no-hover.png"), fullPage: true });

  await page.waitForFunction(() => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot;
    const preview = root?.querySelector("iframe[data-mesurer-responsive-frame]");

    return Boolean(preview?.contentDocument?.body.classList.contains("mesurer-solid-xray"));
  });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid='edit-target']")).outlineStyle), "none",
    "X-ray must not style the root page while Responsive is open");
  await page.screenshot({ path: join(output, "preview-xray-only.png"), fullPage: true });
  await close();
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid='edit-target']")).outlineStyle), rootXrayBefore,
    "Closing must restore the root page's pre-enabled X-ray style");

  const rootTarget = await page.locator("[data-testid='edit-target']").boundingBox();
  assert(rootTarget, "Root selection target should be visible");
  await page.mouse.click(rootTarget.x + rootTarget.width / 2, rootTarget.y + rootTarget.height / 2);
  await page.locator("[data-mesurer-tool-id='context.add-note'] button").waitFor();
  assert.equal(await page.locator("[data-mesurer-tool-id='context.add-note'] button").isDisabled(), false,
    "Add Note must remain enabled for root-page selection after Responsive closes");
  await page.evaluate(async () => {
    const host = await window.__responsiveMount.ready;
    await host.command.execute("context.add-note");
  });
  await page.locator("[data-mesurer-annotation-composer='true']").waitFor();
  await page.keyboard.press("Escape");

  await open();

  const agentResult = await page.evaluate(async () => {
    const inspection = window.__MESURER__.inspect("#root-only-target");
    const context = await window.__MESURER__.select(["#root-only-target"]);

    return { inspection: inspection.selector, selection: context.targets[0]?.inspection.selector };
  });

  assert.deepEqual(agentResult, {
    inspection: "#root-only-target",
    selection: "#root-only-target",
  }, "Agent inspection remains rooted at the top page while Responsive is open");
  await close();

  for (const mode of ["edit"]) {
    await open();

    if (mode === "edit") {
      await page.locator("button[data-mesurer-tool-id='arrange']").click();
    }

    await frame.waitFor({ state: "detached" });
    await page.waitForFunction(() => {
      const root = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

      return root.querySelectorAll("[data-mesurer-selected-measurement='true']").length === 0;
    });
    await page.keyboard.press("Escape").catch(() => undefined);
    await settle();
  }

  await open();

  const nested = page.frameLocator("iframe[data-mesurer-responsive-frame]")
    .frameLocator("iframe[data-testid='nested-preview-frame']")
    .getByTestId("nested-inspection-target");

  const nestedBox = await nested.boundingBox();
  assert(nestedBox, "Nested preview frame target should be visible");
  await page.mouse.click(nestedBox.x + nestedBox.width / 2, nestedBox.y + nestedBox.height / 2);
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    return Boolean(root.querySelector("[data-mesurer-selected-measurement='true']"));
  });
  const nestedContext = await selectedContext();
  assert.equal(nestedContext.targets[0]?.inspection.selector, '[data-testid="nested-inspection-target"]',
    "Nested same-origin frame target should remain inspectable");
  const nestedProjection = await nested.boundingBox();
  assert(nestedProjection, "Nested target projected bounds should be available");
  assertRect(await targetRectInRoot("[data-mesurer-selected-measurement='true'] > div"), nestedProjection,
    "Nested preview selection outline");
  await page.screenshot({ path: join(output, "nested-preview-selected.png"), fullPage: true });
  await close();

  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);
  await writeFile(join(output, "responsive-inspection.json"), `${JSON.stringify({ url, expected, selected, nestedContext, agentResult, errors }, null, 2)}\n`);
  console.log(`Responsive inspection contract passed. Evidence: ${output}`);
} catch (error) {
  await page.screenshot({ path: join(output, "responsive-inspection-failure.png"), fullPage: true }).catch(() => undefined);

  const state = await page.evaluate(() => ({
    mode: document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-toolbar]")?.getAttribute("data-mesurer-toolbar-mode"),
    previewFrame: Boolean(document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("iframe[data-mesurer-responsive-frame]")),
    previewMoves: document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("iframe[data-mesurer-responsive-frame]")?.contentDocument?.__contractPointerMoves,
    hoverCount: document.querySelectorAll("[data-mesurer-hover-measurement='true']").length,
    agentState: window.__MESURER__?.state?.(),
    modelState: window.__responsiveMount?.pluginHost?.service?.get?.("builtin")?.state?.(),
  })).catch(() => null);

  await writeFile(join(output, "responsive-inspection-failure.json"), `${JSON.stringify({ url, errors, error: String(error), stack: error?.stack, state }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
