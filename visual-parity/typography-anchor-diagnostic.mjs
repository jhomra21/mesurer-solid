import { chromium } from "playwright";

const url = process.env.TYPOGRAPHY_ANCHOR_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const snapshot = () => page.evaluate(() => {
  const host = document.querySelector(".primary-action");
  const ring = document.querySelector("[data-mesurer-text-edit-ring='true']");
  if (!(host instanceof HTMLElement)) throw new Error("Missing direct-edit host");
  if (!(ring instanceof HTMLElement)) throw new Error("Missing direct-edit ring");

  const rect = (element) => {
    const value = element.getBoundingClientRect();
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  };
  const css = (element) => {
    const computed = getComputedStyle(element);
    return {
      rect: rect(element),
      inlinePosition: element.style.getPropertyValue("position"),
      inlinePositionPriority: element.style.getPropertyPriority("position"),
      computedPosition: computed.position,
      computedLeft: computed.left,
      computedTop: computed.top,
      positionAnchor: computed.getPropertyValue("position-anchor").trim(),
      anchorName: computed.getPropertyValue("anchor-name").trim(),
    };
  };
  const anchor = getComputedStyle(ring).getPropertyValue("position-anchor").trim();
  const anchorOwner = Array.from(document.querySelectorAll("*"))
    .find((element) => getComputedStyle(element).getPropertyValue("anchor-name").split(",").map((name) => name.trim()).includes(anchor));
  const parent = ring.parentElement;

  return {
    scrollY: window.scrollY,
    host: css(host),
    ring: css(ring),
    anchorOwner: anchorOwner instanceof HTMLElement ? {
      tag: anchorOwner.tagName,
      id: anchorOwner.id,
      className: anchorOwner.className,
      ...css(anchorOwner),
    } : null,
    parent: parent ? {
      tag: parent.tagName,
      id: parent.id,
      rect: rect(parent),
      inlinePosition: parent.style.getPropertyValue("position"),
      computedPosition: getComputedStyle(parent).position,
      parentTag: parent.parentElement?.tagName ?? null,
    } : null,
  };
});

try {
  await page.goto(url, { waitUntil: "networkidle" });
  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  const host = page.locator(".primary-action");
  await arrange.click();
  await host.scrollIntoViewIfNeeded();
  await settle();
  const hostBox = await host.boundingBox();
  if (!hostBox) throw new Error("Missing direct-edit host geometry");
  await page.mouse.click(hostBox.x + hostBox.width / 2, hostBox.y + hostBox.height / 2);
  await page.mouse.dblclick(hostBox.x + hostBox.width / 2, hostBox.y + hostBox.height / 2);
  const ring = page.locator("[data-mesurer-text-edit-ring='true']");
  await ring.waitFor({ state: "visible" });
  await settle();

  const current = await snapshot();

  // Diagnostic experiment only: keep the same live CSS anchor but make the ring
  // viewport-positioned with inline !important, overriding the generic absolute
  // document-anchor rule. The real acceptance gate remains unchanged.
  await ring.evaluate((element) => element.style.setProperty("position", "fixed", "important"));
  await settle();
  const fixed = await snapshot();

  // Second experiment: restore the generic absolute rule but remove the ring
  // from the zero-sized text runtime so its containing block is the document.
  await ring.evaluate((element) => {
    element.style.setProperty("position", "fixed");
    document.body.append(element);
  });
  await settle();
  const bodyPortaled = await snapshot();

  console.log(JSON.stringify({ current, fixed, bodyPortaled }, null, 2));
} finally {
  await browser.close();
}
