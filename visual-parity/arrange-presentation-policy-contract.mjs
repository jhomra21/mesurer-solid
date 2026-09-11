import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ARRANGE_PRESENTATION_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const samePosition = (left, right, tolerance = 1) =>
  Math.abs(left.x - right.x) <= tolerance && Math.abs(left.y - right.y) <= tolerance;

const waitForPosition = async (selector, expected) => page.waitForFunction(({ selector, expected }) => {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  return Math.abs(rect.x - expected.x) <= 1 && Math.abs(rect.y - expected.y) <= 1;
}, { selector, expected });

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const arrangeButton = page.locator("button[data-mesurer-tool-id='arrange']");
  const settingsButton = page.locator("[data-mesurer-builtin='settings'] button");
  const target = page.locator(".primary-action");
  await arrangeButton.waitFor({ state: "visible" });
  await settingsButton.waitFor({ state: "visible" });
  await target.waitFor({ state: "visible" });

  const before = await target.boundingBox();
  assert(before, "Arrange presentation target must have initial geometry");

  await arrangeButton.click();
  await page.waitForFunction(() => {
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");
    return arrange instanceof HTMLButtonElement && arrange.getAttribute("aria-pressed") === "true";
  });

  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
  const arrangeBox = page.locator("[data-mesurer-arrange-box='true']");
  await arrangeBox.waitFor({ state: "visible" });
  const dragBox = await arrangeBox.boundingBox();
  assert(dragBox, "Arrange presentation drag surface must have geometry");

  const startX = dragBox.x + dragBox.width / 2;
  const startY = dragBox.y + dragBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 83, startY + 37, { steps: 4 });
  await page.mouse.up();

  const desired = await target.boundingBox();
  assert(desired, "Arrange presentation target must keep geometry after drag");
  assert(!samePosition(desired, before), `Arrange drag must create a distinct Desired position: ${JSON.stringify({ before, desired })}`);

  // Default policy: saved Arrange intent remains stored but is not presented
  // when Arrange is inactive.
  await arrangeButton.click();
  await page.waitForFunction(() => {
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");
    return arrange instanceof HTMLButtonElement && arrange.getAttribute("aria-pressed") === "false";
  });
  await waitForPosition(".primary-action", before);

  await settingsButton.click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.waitFor({ state: "visible" });
  const generalTab = dialog.getByRole("tab", { name: "General", exact: true });
  if ((await generalTab.getAttribute("aria-selected")) !== "true") await generalTab.click();

  const keepArrange = dialog.getByRole("switch", { name: "Keep Arrange changes", exact: true });
  await keepArrange.waitFor({ state: "visible" });
  assert.equal(await keepArrange.getAttribute("aria-checked"), "false", "Keep Arrange changes should default off");

  // Opting in presents the already-saved Desired transform even outside the
  // Arrange tool; no new drag or intent is required.
  await keepArrange.click();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-presentation-setting='keep-arrange-changes']")?.getAttribute("aria-checked") === "true");
  await waitForPosition(".primary-action", desired);

  // Turning it back off returns the live/original page immediately while the
  // intent stays available for the next Arrange session.
  await keepArrange.click();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-presentation-setting='keep-arrange-changes']")?.getAttribute("aria-checked") === "false");
  await waitForPosition(".primary-action", before);
  await settingsButton.click();
  await dialog.waitFor({ state: "hidden" });

  await arrangeButton.click();
  await page.waitForFunction(() => {
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");
    return arrange instanceof HTMLButtonElement && arrange.getAttribute("aria-pressed") === "true";
  });
  await waitForPosition(".primary-action", desired);

  await arrangeButton.click();
  await waitForPosition(".primary-action", before);

  assert.equal(errors.length, 0, `Arrange presentation browser errors: ${errors.join("\n")}`);
  console.log("Arrange presentation preference contract passed: default Original, explicit Keep Desired, retained intent, and tool-owned replay.");
} finally {
  await browser.close();
}
