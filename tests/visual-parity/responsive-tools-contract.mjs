import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.RESPONSIVE_TOOLS_URL ?? "http://127.0.0.1:4192/responsive-preview.html";

const output = process.env.RESPONSIVE_TOOLS_OUT ?? "responsive-tools-artifacts";

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

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  const typographyButton = page.locator("[data-mesurer-builtin='text-inspector'] button");
  await typographyButton.click();
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "true",
    "Typography should be enabled before opening Responsive");
  await page.locator("button[data-mesurer-builtin='responsive']").click();
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "true",
    "Opening Responsive should preserve active Typography mode");
  await page.locator("button[data-mesurer-builtin='select']").click();
  const frame = page.locator("iframe[data-mesurer-responsive-frame]").first();
  await frame.waitFor();
  await frame.contentFrame().locator("[data-testid='edit-target']").waitFor();
  await frame.evaluate((node) => {
    const target = node.contentDocument.querySelector("[data-testid='edit-target']");
    const inspection = node.contentDocument.querySelector("#inspection-target");
    target.style.cssText = "position:absolute;left:24px;top:140px;display:block;width:102px;height:22px;margin:0;padding:0";
    inspection.style.cssText = "position:absolute;left:146px;top:140px;display:block;width:48px;height:22px;margin:0;padding:0";
  });
  await settle();

  const target = frame.contentFrame().locator("[data-testid='edit-target']");
  const projected = await target.boundingBox();
  assert(projected, "Preview target must have rendered bounds");
  const center = { x: projected.x + projected.width / 2, y: projected.y + projected.height / 2 };
  await page.mouse.move(center.x, center.y, { steps: 3 });
  await page.waitForFunction(() => {
    const overlay = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    return Boolean(overlay.querySelector("[data-mesurer-hover-measurement='true']"));
  });
  const hover = await page.locator("[data-mesurer-hover-measurement='true']").boundingBox();
  assert(hover && Math.abs(hover.width - projected.width) < 1,
    "Real mouse movement over a preview element must render its hover outline");

  await page.mouse.click(center.x, center.y);
  const selected = page.locator("[data-mesurer-selected-measurement='true']");
  await selected.waitFor({ state: "attached" });
  const measurementText = await selected.innerText();
  assert.match(measurementText, /102\s*x\s*22/,
    `Selected measurement badge must report preview CSS pixels, got ${JSON.stringify(measurementText)}`);
  await page.screenshot({ path: join(output, "responsive-tools-selected.png"), fullPage: true });

  const inspection = frame.contentFrame().locator("#inspection-target");

  const inspectionRect = await inspection.evaluate((element) => {
    const { left, top, width, height, right } = element.getBoundingClientRect();

    return { left, top, width, height, right };
  });

  const inspectionProjected = await inspection.boundingBox();

  assert(inspectionProjected, "Inspection target must have rendered bounds");

  const inspectionCenter = {
    x: inspectionProjected.x + inspectionProjected.width / 2,
    y: inspectionProjected.y + inspectionProjected.height / 2,
  };

  await page.mouse.move(inspectionCenter.x, inspectionCenter.y, { steps: 3 });

  await page.waitForFunction(() => {
    const overlay = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;
    const hover = overlay.querySelector("[data-mesurer-hover-measurement='true']");

    return Boolean(hover && Number.parseFloat(hover.style.width) > 0);
  });

  const hoverOverSelection = await page.locator("[data-mesurer-hover-measurement='true']").boundingBox();

  assert(hoverOverSelection && Math.abs(hoverOverSelection.width - inspectionProjected.width) < 1,
    "Hover outline must update to another preview element while a different element remains selected");

  await page.keyboard.down("Alt");

  await page.mouse.move(inspectionCenter.x + 1, inspectionCenter.y, { steps: 2 });

  await page.waitForFunction(() => {
    const overlay = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    return Boolean(overlay.querySelector("[data-mesurer-distance-kind='preview']"));
  });
  await page.waitForTimeout(100);

  const distanceLabel = page.locator("[data-mesurer-distance-kind='preview'] [data-mesurer-distance-label='true']").first();

  assert(await distanceLabel.count(), "Alt distance label must render");

  const distanceText = (await distanceLabel.innerText()).trim();

  const expectedGap = Math.round(inspectionRect.left - 24 - 102);

  assert.equal(distanceText, `${expectedGap}`,
    `Alt distance should report preview CSS-pixel gap ${expectedGap}, got ${JSON.stringify(distanceText)}`);
  await page.keyboard.up("Alt");

  // Alt-hover the preview container while its child remains selected. The four
  // gaps are derived from the source-document padding box, not the scaled stage.
  await page.keyboard.down("Alt");
  const container = frame.contentFrame().locator("main").nth(1);

  const expectedContainerGaps = await container.evaluate((element) => {
    const child = element.ownerDocument.querySelector("[data-testid='edit-target']");
    const rect = child.getBoundingClientRect();
    const containerRect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
    const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;

    const paddingBox = {
      left: containerRect.left + borderLeft,
      top: containerRect.top + borderTop,
      right: containerRect.right - borderRight,
      bottom: containerRect.bottom - borderBottom,
    };

    return [
      Math.max(0, rect.top - paddingBox.top),
      Math.max(0, paddingBox.bottom - rect.bottom),
      Math.max(0, rect.left - paddingBox.left),
      Math.max(0, paddingBox.right - rect.right),
    ].map(Math.round);
  });

  const containerBounds = await container.boundingBox();
  assert(containerBounds, "Preview container must have rendered bounds");
  await page.mouse.move(containerBounds.x + 1, containerBounds.y + 1, { steps: 2 });
  await page.waitForFunction((gaps) => {
    const overlay = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    return gaps.some((gap) => gap > 0
      && [...overlay.querySelectorAll("div")].some((element) => element.textContent?.trim() === String(gap)));
  }, expectedContainerGaps);

  const renderedContainerLabels = await page.locator("[data-mesurer-island]").evaluate((island) =>
    [...(island.shadowRoot?.querySelectorAll("div") ?? [])]
      .flatMap((element) => {
        const text = element.textContent?.trim();

        return text ? [text] : [];
      }));

  const matchingContainerGap = expectedContainerGaps.find((gap) => gap > 0 && renderedContainerLabels.includes(String(gap)));
  assert.notEqual(matchingContainerGap, undefined,
    `Alt-hovering the preview container should report a source CSS-pixel gap from ${JSON.stringify(expectedContainerGaps)}, got ${JSON.stringify(renderedContainerLabels)}`);
  await page.keyboard.up("Alt");

  await page.locator("button[data-mesurer-builtin='responsive']").click();
  await typographyButton.click();
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "true",
    "Typography should be enabled before opening Responsive");
  await page.locator("button[data-mesurer-builtin='responsive']").click();
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "true",
    "Opening Responsive should preserve active Typography mode");

  const typoTarget = frame.contentFrame().locator("h1");
  const typoBox = await typoTarget.boundingBox();
  assert(typoBox, "Preview Typography target must render");
  await page.mouse.click(typoBox.x + typoBox.width / 2, typoBox.y + typoBox.height / 2);
  const card = page.locator(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']");
  await card.waitFor();
  const cardRect = await card.boundingBox();

  assert(cardRect, "Typography card must be visible");

  const hit = await page.evaluate(({ x, y }) => {
    const island = document.querySelector("[data-mesurer-island]");
    const node = island?.shadowRoot?.elementFromPoint(x, y) ?? document.elementFromPoint(x, y);

    const card = island?.shadowRoot?.querySelector(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']")
      ?? document.querySelector(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']");

    let hitCard = false;

    for (let current = node; current; current = current.parentElement ?? current.getRootNode()?.host ?? null) {
      if (current === card) {
        hitCard = true;
        break;
      }
    }

    return {
      node: node?.outerHTML?.slice(0, 180),
      stage: island?.shadowRoot?.querySelector("[data-mesurer-responsive-stage]")?.contains(node),
      hitCard,
    };
  }, { x: cardRect.x + cardRect.width / 2, y: cardRect.y + cardRect.height / 2 });

  assert.equal(hit.stage, false, `Typography card must win hit testing above Responsive stage: ${JSON.stringify(hit)}`);
  assert.equal(hit.hitCard, true, `Typography panel center must hit the panel rather than a covering stage surface: ${JSON.stringify(hit)}`);

  const cardStyle = await page.locator(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']").evaluate((element) => {
    const style = getComputedStyle(element);

    return { display: style.display, position: style.position, visibility: style.visibility, pointerEvents: style.pointerEvents };
  });

  assert.notEqual(cardStyle.display, "none", `Typography panel must have visible styles in Responsive root: ${JSON.stringify(cardStyle)}`);
  assert.notEqual(cardStyle.visibility, "hidden", `Typography panel must not be hidden in Responsive root: ${JSON.stringify(cardStyle)}`);
  assert.notEqual(cardStyle.pointerEvents, "none", `Typography panel must remain interactive: ${JSON.stringify(cardStyle)}`);

  await page.locator("button[data-mesurer-builtin='responsive']").click();
  const hostTarget = page.locator("#root-only-target");
  const hostBounds = await hostTarget.boundingBox();
  assert(hostBounds, "Host Typography target must have rendered bounds");
  await page.mouse.move(hostBounds.x + hostBounds.width / 2, hostBounds.y + hostBounds.height / 2);
  const hostCard = page.locator(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']").last();
  await hostCard.waitFor({ state: "visible" });

  const hostCardStyle = await hostCard.evaluate((element) => {
    const style = getComputedStyle(element);

    return { display: style.display, visibility: style.visibility, pointerEvents: style.pointerEvents };
  });

  assert.notEqual(hostCardStyle.display, "none", `Typography must remain styled on the host page: ${JSON.stringify(hostCardStyle)}`);
  assert.notEqual(hostCardStyle.visibility, "hidden", `Typography must remain visible on the host page: ${JSON.stringify(hostCardStyle)}`);
  assert.notEqual(hostCardStyle.pointerEvents, "none", `Typography must remain hit-testable on the host page: ${JSON.stringify(hostCardStyle)}`);

  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);
  await writeFile(join(output, "responsive-tools.json"), `${JSON.stringify({
    url, scale: projected.width / 102, cssSize: { width: 102, height: 22 },
    screenSize: { width: projected.width, height: projected.height }, measurementText,
    hoverOverSelection, cssGap: expectedGap, distanceText, hit, errors,
  }, null, 2)}\n`);
  console.log(`Responsive tools contract passed. Evidence: ${output}`);
} catch (error) {
  await page.screenshot({ path: join(output, "responsive-tools-failure.png"), fullPage: true }).catch(() => undefined);
  await writeFile(join(output, "responsive-tools-failure.json"), `${JSON.stringify({
    url, errors, error: String(error), stack: error?.stack,
  }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
