import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const cases = [
  {
    name: "React (external browser-eval injector)",
    url: process.env.REACT_URL ?? "http://127.0.0.1:4190",
    injectPath: process.env.REACT_INJECT_SCRIPT_PATH || "/tmp/mesurer-react/node_modules/@jhomra21/mesurer-solid/dist/inject-script.js",
    mountedByApp: false,
  },
  {
    name: "Solid 1 (mount API)",
    url: process.env.SOLID1_PACKAGE_URL ?? "http://127.0.0.1:4191",
    mountedByApp: true,
  },
  {
    name: "Solid 2 (mount API)",
    url: process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192",
    mountedByApp: true,
  },
];

async function runCase(browser, testCase) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(testCase.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__HOST_READY__));

    if (testCase.injectPath) {
      const source = await readFile(testCase.injectPath, "utf8");
      await page.evaluate(source);
    }

    await page.waitForFunction(() => Boolean(window.__MESURER__));
    await page.evaluate(() => window.__MESURER__.ready());
    await page.waitForFunction(() => {
      const island = document.querySelector("[data-mesurer-island='true']");
      return Boolean(island?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"));
    });

    const button = page.locator("[data-testid='consumer-counter']");
    await button.click();
    if (!(await button.textContent())?.includes("count 1")) {
      throw new Error(`${testCase.name} host lost reactivity after loading the packed Mesurer artifact`);
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

    const description = await page.evaluate(() => window.__MESURER__.describe());
    if (!description?.commands.includes("builtin.xray")) {
      throw new Error(`${testCase.name} did not expose the stable built-in command surface`);
    }

    await page.evaluate(() => window.__MESURER__.command("builtin.xray"));
    await page.evaluate(() => window.__MESURER__.command("builtin.xray"));

    if (testCase.mountedByApp) {
      await page.evaluate(() => window.__MESURER__.command("package-smoke.increment"));
      const state = await page.evaluate(() => window.__MESURER__.state());
      if (state["package-smoke"] !== 1) {
        throw new Error(`${testCase.name} public core/plugin API command failed: ${JSON.stringify(state)}`);
      }
    }

    if (errors.length) throw new Error(`${testCase.name} page errors:\n${errors.join("\n")}`);
    console.log(`${testCase.name} packed-package consumer: PASS`);
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await Promise.all(cases.map((testCase) => runCase(browser, testCase)));
} finally {
  await browser.close();
}
