import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.RESPONSIVE_VIEWPORTS_URL ?? "http://127.0.0.1:4191/responsive-preview.html";

const output = process.env.RESPONSIVE_VIEWPORTS_OUT ?? "responsive-viewports-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("frame-ancestors")) errors.push(message.text()); });

const frames = page.locator("[data-mesurer-responsive-frame]");

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.style.setProperty("overflow-x", "clip", "important");
    document.documentElement.style.setProperty("overflow-y", "scroll");
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("@media (min-width: 307px) { body { --constructable-breakpoint: 1; } }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
  await page.keyboard.press("b");
  await page.locator("[data-mesurer-responsive-frame]").waitFor();
  await page.frameLocator("[data-mesurer-responsive-frame]").locator("[data-testid='breakpoint-label']").waitFor();
  assert.equal(await frames.count(), 1);
  assert.deepEqual(await frames.first().evaluate((frame) => [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]), [393, 852]);
  assert.match(await page.locator("[data-mesurer-responsive-header]").first().textContent(), /iPhone 15/);

  const presetNames = await page.getByLabel("Add a size").locator("option").allTextContents();
  assert.deepEqual(presetNames.slice(1, 13), ["iPhone SE", "iPhone X", "iPhone 15", "iPhone 15 Pro Max", "Pixel 8", "Galaxy S24", "iPad mini", "iPad", "iPad Pro 12.9", "Laptop", "MacBook Air 13", "Full HD"]);
  await page.getByLabel("Add a size").selectOption("375x667");
  await page.locator("[data-preview]").first().waitFor();
  assert.equal(await frames.count(), 2);
  assert.deepEqual(await frames.nth(1).evaluate((frame) => [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]), [375, 667]);
  await frames.nth(1).evaluate((frame) => { frame.contentWindow.__responsiveSiblingStamp = "preserve-me"; });
  await page.locator("[data-preview]").first().locator('select[aria-label="Size"]').selectOption("430x932");
  assert.deepEqual(await frames.first().evaluate((frame) => [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]), [430, 932],
    "A preview Size selector resizes that preview in place");
  assert.equal(await frames.nth(1).evaluate((frame) => frame.contentWindow.__responsiveSiblingStamp), "preserve-me",
    "Resizing one preview must not reload sibling frames");
  await page.getByLabel("Add a size").selectOption("375x667");
  assert.equal(await frames.count(), 3, "Adding an identical viewport creates a distinct preview");
  assert.notEqual(await frames.nth(1).getAttribute("data-mesurer-responsive-preview-id"),
    await frames.nth(2).getAttribute("data-mesurer-responsive-preview-id"), "Duplicate previews have distinct identities");
  const breakpointOptions = await page.getByLabel("Add a size").locator("option").allTextContents();
  assert.ok(breakpointOptions.includes("501px breakpoint"), "Accessible media-query breakpoints are offered");
  assert.ok(breakpointOptions.includes("240px breakpoint"), "Sub-minimum breakpoint is clamped to 240px");
  assert.ok(breakpointOptions.includes("305px breakpoint"), "Same-origin @import breakpoint is discovered");
  assert.ok(breakpointOptions.includes("307px breakpoint"), "Constructable stylesheet breakpoint is discovered");
  await page.locator("[data-preview]").first().locator("input[data-responsive-height]").fill("700");
  await page.locator("[data-preview]").first().locator("input[data-responsive-height]").press("Enter");
  await page.locator("[data-preview]").first().locator('select[aria-label="Size"]').selectOption({ label: "240px breakpoint" });
  assert.deepEqual(await frames.first().evaluate((frame) => [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]),
    [240, 700], "Choosing a breakpoint changes width and preserves that preview's height");
  await page.getByLabel("Add a size").selectOption("501x852");
  assert.equal(await frames.count(), 4);
  assert.equal(await frames.nth(3).evaluate((frame) => frame.contentWindow.innerWidth), 501);
  await page.getByLabel("Remove preview").nth(3).click();

  for (const option of ["430x932", "412x915", "360x780", "744x1133"]) {
    if (await frames.count() < 6) await page.getByLabel("Add a size").selectOption(option);
  }

  assert.equal(await frames.count(), 6);
  assert.equal(await page.getByLabel("Add a size").isDisabled(), true, "Add is disabled at six previews");
  assert.equal(await frames.count(), 6, "The seventh viewport is not added");

  const first = page.locator("[data-preview]").first();
  const width = first.locator("input[data-responsive-width]");
  const height = first.locator("input[data-responsive-height]");
  await width.fill("239"); await width.press("Enter");
  await height.fill("3841"); await height.press("Enter");
  assert.deepEqual(await frames.first().evaluate((frame) => [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]), [240, 3840]);
  await width.fill("400"); await width.press("Enter");
  await height.fill("700"); await height.press("Enter");
  assert.deepEqual(await frames.first().evaluate((frame) => [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]), [400, 700]);

  const row = page.locator("[data-mesurer-responsive-row]");
  const scrollBefore = await row.evaluate((element) => element.scrollLeft);
  const pageScrollBefore = await page.evaluate(() => scrollY);
  const rowBox = await row.boundingBox();
  await page.mouse.move(rowBox.x + rowBox.width - 8, rowBox.y + rowBox.height - 10);
  await page.mouse.wheel(240, 0);
  await page.waitForTimeout(80);
  assert.ok(await row.evaluate((element) => element.scrollLeft) > scrollBefore, "Wheel over stage scrolls only the preview row");
  assert.equal(await page.evaluate(() => scrollY), pageScrollBefore, "The obscured page never scrolls");
  await row.evaluate((element) => element.scrollTo({ left: 0 }));
  await frames.first().evaluate((frame) => { frame.contentDocument.body.style.minHeight = "2400px"; });
  const firstFrameBox = await frames.first().boundingBox();
  await page.mouse.move(firstFrameBox.x + 80, firstFrameBox.y + 120);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(80);
  assert.ok(await frames.first().evaluate((frame) => frame.contentDocument.scrollingElement.scrollTop) > 0, "Wheel inside a frame scrolls that frame");
  await frames.first().evaluate((frame) => {
    frame.contentDocument.scrollingElement.scrollTop = frame.contentDocument.scrollingElement.scrollHeight;
  });
  const rowAtFrameEnd = await row.evaluate((element) => element.scrollLeft);
  const atFrameEnd = await frames.first().boundingBox();
  await page.mouse.move(atFrameEnd.x + 80, atFrameEnd.y + 120);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(80);
  assert.ok(await row.evaluate((element) => element.scrollLeft) > rowAtFrameEnd,
    "A frame at its vertical scroll end hands wheel motion to the horizontally scrollable row");

  const beforeOrder = await frames.evaluateAll((items, indexes) => items.map((frame, index) => {
    const sentinel = `responsive-frame-${indexes[index]}-${crypto.randomUUID()}`;
    frame.contentWindow.__responsiveContractSentinel = sentinel;
    frame.contentDocument.documentElement.dataset.responsiveContractSentinel = sentinel;
    frame.__responsiveContractLoadCount = 0;
    frame.addEventListener("load", () => { frame.__responsiveContractLoadCount += 1; });

    return { sentinel, href: frame.contentWindow.location.href };
  }), [0, 1, 2, 3, 4, 5]);

  await row.evaluate((element) => element.scrollTo({ left: 0 }));
  const firstPreview = page.locator("[data-preview]").first();
  const dragHandle = firstPreview.getByLabel("Drag preview to reorder");
  const dragBox = await dragHandle.boundingBox();
  const targetPreviewBox = await page.locator("[data-preview]").nth(2).boundingBox();
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetPreviewBox.x + targetPreviewBox.width - 8, targetPreviewBox.y + 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  assert.deepEqual(await frames.evaluateAll((items) => items.map((frame) => ({
    sentinel: frame.contentWindow.__responsiveContractSentinel,
    documentSentinel: frame.contentDocument.documentElement.dataset.responsiveContractSentinel,
    href: frame.contentWindow.location.href,
    loadCount: frame.__responsiveContractLoadCount,
  }))), beforeOrder.map(({ sentinel, href }) => ({ sentinel, documentSentinel: sentinel, href, loadCount: 0 })),
  "Reorder must preserve each preview identity and must not reload frames");
  assert.deepEqual(await page.locator("[data-preview]").evaluateAll((sections) =>
    sections.toSorted((a, b) => Number(a.style.order) - Number(b.style.order))
      .map((section) => Number(section.querySelector("iframe").contentWindow.innerWidth))),
  [375, 375, 400, 430, 412, 360]);
  await page.locator('[data-preview][style*="order: 2"]').getByLabel("Move preview right").click();
  assert.deepEqual(await page.locator("[data-preview]").evaluateAll((sections) =>
    sections.toSorted((a, b) => Number(a.style.order) - Number(b.style.order))
      .map((section) => Number(section.querySelector("iframe").contentWindow.innerWidth))),
  [375, 375, 430, 400, 412, 360]);

  const fitGeometry = await page.evaluate(() => {
    const host = document.querySelector("[data-mesurer-island]");
    const shadow = host.shadowRoot;
    const frame = shadow.querySelector("iframe[data-mesurer-responsive-frame]");
    const maxW = Math.max(...[...shadow.querySelectorAll("[data-preview]")].map((preview) => Number(preview.querySelector("[data-responsive-width]").value)));
    const maxH = Math.max(...[...shadow.querySelectorAll("[data-preview]")].map((preview) => Number(preview.querySelector("[data-responsive-height]").value)));
    const fit = Math.min(1, (innerWidth - 64) / maxW, (innerHeight - 72 - 36 - 12 - 40 - 40) / maxH);

    return { fit, rendered: frame.getBoundingClientRect().width / Number(frame.width) };
  });

  assert.ok(Math.abs(fitGeometry.fit - fitGeometry.rendered) < 0.01, `Fit scale expected ${fitGeometry.fit}, rendered ${fitGeometry.rendered}`);
  await page.getByLabel("Zoom").selectOption("0.5");
  const manualScale = await frames.first().evaluate((frame) => frame.getBoundingClientRect().width / Number(frame.width));
  assert.ok(Math.abs(manualScale - 0.5) < 0.01);
  await page.getByLabel("Zoom").selectOption("0.25");

  const smallZoomHeader = await page.locator("[data-mesurer-responsive-header]").first().evaluate((header) => ({
    width: header.clientWidth,
    scrollWidth: header.scrollWidth,
  }));

  assert.equal(smallZoomHeader.width, 360, "Preview headers keep a 360px minimum at small zoom");
  assert.ok(smallZoomHeader.scrollWidth <= smallZoomHeader.width,
    `Preview header controls fit at their 360px minimum: ${JSON.stringify(smallZoomHeader)}`);
  await page.getByLabel("Zoom").selectOption("fit");
  await page.screenshot({ path: join(output, "responsive-viewports-light.png"), fullPage: true });
  await page.locator("button[data-mesurer-builtin='settings']").click();
  await page.getByText("General", { exact: true }).click();
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await page.locator("button[data-mesurer-builtin='settings']").click();
  await page.screenshot({ path: join(output, "responsive-viewports-dark.png"), fullPage: true });
  await page.locator("button[data-mesurer-builtin='settings']").click();
  await page.getByText("General", { exact: true }).click();
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("light");
  await page.keyboard.press("Escape");

  await page.getByLabel("Remove preview").first().click();
  assert.equal(await frames.count(), 5);

  while (await frames.count() > 1) await page.getByLabel("Remove preview").first().click();
  assert.equal(await page.getByLabel("Remove preview").first().isDisabled(), true);

  const retainedViewportSizes = await frames.evaluateAll((items) =>
    items.map((item) => [item.contentWindow.innerWidth, item.contentWindow.innerHeight]));

  const overflowDuring = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
  assert.equal(overflowDuring, "hidden");
  await page.keyboard.press("Escape");
  assert.equal(await frames.count(), 0);
  await page.keyboard.press("b");
  assert.equal(await frames.count(), 1);
  assert.deepEqual(await frames.evaluateAll((items) =>
    items.map((item) => [item.contentWindow.innerWidth, item.contentWindow.innerHeight])),
  retainedViewportSizes, "Viewport list survives close/reopen");
  await page.evaluate(() => { history.pushState({}, "", `${location.pathname}?page-key=changed`); dispatchEvent(new PopStateEvent("popstate")); });
  await frames.waitFor({ state: "detached" });
  await page.keyboard.press("b");
  assert.deepEqual(await frames.first().evaluate((frame) => [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]), [393, 852], "Page-key change resets viewport state");
  await page.keyboard.press("Escape");
  await page.keyboard.press("b");
  await page.getByLabel("Add a size").selectOption("430x932");
  await frames.nth(1).evaluate((frame) => {
    frame.__responsiveCrossOriginLoaded = false;
    frame.addEventListener("load", () => { frame.__responsiveCrossOriginLoaded = true; }, { once: true });
    frame.src = "data:text/html,<p>cross-origin preview</p>";
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelectorAll("iframe[data-mesurer-responsive-frame]")[1];

    if (!frame?.__responsiveCrossOriginLoaded) return false;

    try {
      return frame.contentWindow.location.protocol === "data:";
    } catch {
      return true;
    }
  });
  await page.getByLabel("Remove preview").nth(1).click();

  const stageBox = await page.locator("[data-mesurer-responsive-stage]").boundingBox();
  await page.mouse.click(stageBox.x + 2, stageBox.y + 2);
  await frames.waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 0, "Closing after inaccessible-frame removal removes the stage");
  assert.deepEqual(await page.evaluate(() => ({
    x: [document.documentElement.style.getPropertyValue("overflow-x"), document.documentElement.style.getPropertyPriority("overflow-x")],
    y: [document.documentElement.style.getPropertyValue("overflow-y"), document.documentElement.style.getPropertyPriority("overflow-y")],
  })), { x: ["clip", "important"], y: ["scroll", ""] }, "Closing after inaccessible-frame removal restores both overflow axes");
  await page.keyboard.press("b");
  await frames.first().click({ position: { x: 100, y: 140 } });
  assert.equal(await frames.count(), 1, "Frame press does not close stage");
  await page.evaluate(() => window.__responsiveMount.dispose());
  await page.waitForTimeout(100);

  const restoredOverflow = await page.evaluate(() => ({
    x: [document.documentElement.style.getPropertyValue("overflow-x"), document.documentElement.style.getPropertyPriority("overflow-x")],
    y: [document.documentElement.style.getPropertyValue("overflow-y"), document.documentElement.style.getPropertyPriority("overflow-y")],
  }));

  assert.deepEqual(restoredOverflow, { x: ["clip", "important"], y: ["scroll", ""] });
  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);
  await writeFile(join(output, "responsive-viewports.json"), `${JSON.stringify({ url, errors, frameCount: await frames.count(), fitGeometry }, null, 2)}\n`);
  console.log(`Responsive viewports contract passed. Evidence: ${output}`);
} catch (error) {
  await page.screenshot({ path: join(output, "responsive-viewports-failure.png"), fullPage: true }).catch(() => undefined);
  await writeFile(join(output, "responsive-viewports-failure.json"), `${JSON.stringify({ url, errors, error: String(error) }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
