import { chromium } from "playwright";

const cases = [
  { name: "React", url: process.env.REACT_URL ?? "http://127.0.0.1:4190" },
  { name: "Solid 1", url: process.env.SOLID1_PACKAGE_URL ?? "http://127.0.0.1:4191" },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const testCase of cases) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto(testCase.url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__MESURER__) && Boolean(window.__PACKAGE_READY__));
    await page.evaluate(() => window.__MESURER__.ready());
    await page.waitForFunction(() => {
      const island = document.querySelector("[data-mesurer-island='true']");
      return Boolean(island?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"));
    });

    const button = page.locator("[data-testid='consumer-counter']");
    await button.click();
    if (!(await button.textContent())?.includes("count 1")) {
      throw new Error(`${testCase.name} host lost reactivity after installing the packed Mesurer artifact`);
    }

    const feedback = await page.evaluate(() => window.__MESURER__.feedback([
      "[data-testid='consumer-counter']",
      "[data-testid='consumer-sibling']",
    ]));
    if (feedback.elements.length !== 2) {
      throw new Error(`${testCase.name} agent feedback missed consumer elements: ${JSON.stringify(feedback)}`);
    }
    if (feedback.elements[0].padding.top !== 16 || feedback.elements[0].rect.width <= 0) {
      throw new Error(`${testCase.name} packed box-model inspection failed: ${JSON.stringify(feedback.elements[0])}`);
    }

    const distance = await page.evaluate(() => window.__MESURER__.distance(
      "[data-testid='consumer-counter']",
      "[data-testid='consumer-sibling']",
    ));
    if (!distance || Math.abs(distance.horizontalGap - 12) > 0.5) {
      throw new Error(`${testCase.name} expected a 12px consumer gap, got ${JSON.stringify(distance)}`);
    }

    await page.evaluate(() => window.__MESURER__.command("package-smoke.increment"));
    const state = await page.evaluate(() => window.__MESURER__.state());
    if (state["package-smoke"] !== 1) {
      throw new Error(`${testCase.name} public core/plugin API command failed: ${JSON.stringify(state)}`);
    }

    if (errors.length) throw new Error(`${testCase.name} page errors:\n${errors.join("\n")}`);
    await page.close();
    console.log(`${testCase.name} packed-package consumer: PASS`);
  }
} finally {
  await browser.close();
}
