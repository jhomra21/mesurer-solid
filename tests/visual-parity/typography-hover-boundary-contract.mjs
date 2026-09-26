import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TYPOGRAPHY_HOVER_BOUNDARY_URL ?? "http://127.0.0.1:4174/";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const box = async (locator, message) => {
  const value = await locator.boundingBox();
  assert(value, message);

  return value;
};

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const typography = page.locator("button[data-mesurer-builtin='text-inspector']");
  const target = page.locator(".feature-copy .kicker");

  await typography.waitFor({ state: "visible" });
  await typography.click();
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();

  const targetBox = await box(target, "Expected standalone Typography target");
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
  );

  const transientCard = page.locator(
    ".mesurer-ti-card[data-state='visible']:not(:has(.mesurer-ti-close))",
  );

  await transientCard.waitFor({ state: "visible" });

  await page.mouse.click(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
  );

  const pinnedCard = page.locator(
    ".mesurer-ti-card[data-state='visible']:has(.mesurer-ti-close)",
  ).first();

  await pinnedCard.waitFor({ state: "visible" });
  await settle();

  const probe = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll(".mesurer-ti-card"))
      .find((candidate) => (
        candidate instanceof HTMLElement
        && candidate.dataset.state === "visible"
        && candidate.querySelector(".mesurer-ti-close")
      ));

    if (!(card instanceof HTMLElement)) return null;
    const rect = card.getBoundingClientRect();
    const point = {
      x: rect.right - 18,
      y: rect.bottom - 18,
    };

    const underlay = document.createElement("div");
    underlay.dataset.testid = "typography-under-card";
    underlay.textContent = "Typography underlay sentinel";
    Object.assign(underlay.style, {
      position: "fixed",
      left: `${point.x - 80}px`,
      top: `${point.y - 16}px`,
      width: "160px",
      height: "32px",
      zIndex: "1",
      fontSize: "14px",
      lineHeight: "32px",
      pointerEvents: "auto",
    });

    document.body.append(underlay);

    return {
      point,
      stack: document.elementsFromPoint(point.x, point.y).map((element) => ({
        tag: element.tagName,
        inspector: element.closest("[data-mesurer-inspector-ui='true']") !== null,
        testid: element.getAttribute("data-testid"),
      })),
    };
  });

  assert(probe, "Could not prepare Typography hover-boundary probe");
  assert(
    probe.stack.some((entry) => entry.inspector),
    `Probe point did not hit Typography UI: ${JSON.stringify(probe.stack)}`,
  );
  assert(
    probe.stack.some((entry) => entry.testid === "typography-under-card"),
    `Probe point did not contain page text underneath Typography: ${JSON.stringify(probe.stack)}`,
  );

  await page.mouse.move(probe.point.x, probe.point.y);
  await settle();
  await page.waitForTimeout(40);

  const visibleCards = page.locator(".mesurer-ti-card[data-state='visible']");
  assert.equal(
    await visibleCards.count(),
    1,
    "Hovering a pinned Typography card must hide the transient inspector instead of inspecting through Mesurer UI",
  );
  assert.equal(
    await visibleCards.first().locator(".mesurer-ti-close").count(),
    1,
    "The only visible Typography card over Mesurer UI must remain the pinned card",
  );
  assert(
    !(await visibleCards.first().textContent())?.includes("Typography underlay sentinel"),
    "Typography inspected page text underneath its own pinned card",
  );

  await page.mouse.click(probe.point.x, probe.point.y);
  await settle();

  assert.equal(
    await page.locator(".mesurer-ti-card[data-state='visible']:has(.mesurer-ti-close)").count(),
    1,
    "Clicking inside a pinned Typography card must not pin content underneath it",
  );

  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
  );
  await transientCard.waitFor({ state: "visible" });

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log(
    "Typography hover boundary E2E: pinned Typography UI blocks hover/click hit testing into page text underneath it, while page hover resumes after the pointer leaves the card: PASS",
  );
} finally {
  await browser.close();
}
