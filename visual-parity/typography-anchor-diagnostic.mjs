import { chromium } from "playwright";

const url = process.env.TYPOGRAPHY_ANCHOR_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const rect = async (locator, label) => {
  const value = await locator.boundingBox();
  if (!value) throw new Error(`Missing ${label} geometry`);
  return value;
};

const snapshotStandalone = (label) => page.evaluate((stage) => {
  const host = document.querySelector(".feature-copy .kicker");
  const box = document.querySelector(".mesurer-ti-box[data-state='visible']");
  const card = document.querySelector(".mesurer-ti-card[data-state='visible']");
  if (!(host instanceof HTMLElement)) throw new Error("Missing standalone Typography host");
  if (!(box instanceof HTMLElement)) throw new Error("Missing standalone Typography box");

  const geometry = (element) => {
    const value = element.getBoundingClientRect();
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  };
  const css = (element) => {
    const computed = getComputedStyle(element);
    return {
      rect: geometry(element),
      inlineLeft: element.style.left,
      inlineTop: element.style.top,
      inlineWidth: element.style.width,
      inlineHeight: element.style.height,
      computedPosition: computed.position,
      computedLeft: computed.left,
      computedTop: computed.top,
      positionAnchor: computed.getPropertyValue("position-anchor").trim(),
      anchorName: computed.getPropertyValue("anchor-name").trim(),
      owner: element.dataset.mesurerNativeScrollOwner ?? null,
      anchorKind: element.dataset.mesurerNativeScrollAnchor ?? null,
    };
  };
  const anchor = getComputedStyle(box).getPropertyValue("position-anchor").trim();
  const owners = Array.from(document.querySelectorAll("*"))
    .filter((element) => getComputedStyle(element).getPropertyValue("anchor-name")
      .split(",").map((name) => name.trim()).includes(anchor))
    .map((element) => ({
      tag: element.tagName,
      id: element.id,
      className: element instanceof HTMLElement ? element.className : "",
      rect: geometry(element),
      anchorName: getComputedStyle(element).getPropertyValue("anchor-name").trim(),
    }));

  return {
    label: stage,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    host: css(host),
    box: css(box),
    card: card instanceof HTMLElement ? css(card) : null,
    anchorOwners: owners,
  };
}, label);

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  const target = page.locator(".feature-copy .kicker");
  await arrange.click();
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  let targetBox = await rect(target, "direct-edit target");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  await editor.waitFor({ state: "visible" });
  await inspector.waitFor({ state: "visible" });
  const lineInput = inspector.locator("[data-mesurer-text-style-input='line']");
  const lineBefore = await target.evaluate((element) => getComputedStyle(element).lineHeight);
  const desiredLine = lineBefore === "36px" ? "42px" : "36px";
  const lineBox = await rect(lineInput, "Typography Line control");
  await page.mouse.click(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(desiredLine);
  await page.keyboard.press("Enter");
  await settle();
  await page.mouse.move(1200, 850);
  await page.mouse.wheel(0, 48);
  await page.waitForTimeout(180);

  await editor.focus();
  await page.keyboard.press("Escape");
  await editor.waitFor({ state: "detached" });
  await arrange.click();
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-tool-id='arrange']")?.getAttribute("aria-pressed") === "false");

  const typography = page.locator("button[data-mesurer-builtin='text-inspector']");
  await typography.click();
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  targetBox = await rect(target, "standalone target");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  const box = page.locator(".mesurer-ti-box[data-state='visible']").first();
  await box.waitFor({ state: "visible" });
  await settle();

  const states = [await snapshotStandalone("before-wheel")];
  const firstScroll = page.evaluate(() => new Promise((resolve) => {
    window.addEventListener("scroll", () => resolve(true), { once: true, capture: true });
  }));
  await page.mouse.wheel(0, 48);
  await firstScroll;
  states.push(await snapshotStandalone("scroll-event"));
  await page.waitForTimeout(40);
  states.push(await snapshotStandalone("40ms"));
  await page.waitForTimeout(50);
  states.push(await snapshotStandalone("90ms"));
  await page.waitForTimeout(60);
  states.push(await snapshotStandalone("150ms"));
  await page.waitForTimeout(100);
  states.push(await snapshotStandalone("250ms"));

  console.log(JSON.stringify(states, null, 2));
} finally {
  await browser.close();
}
