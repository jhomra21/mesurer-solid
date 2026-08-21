import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
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

async function runTrustedTypesCase(browser, url) {
  const name = "Trusted Types browser-eval injector";
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const injectPath = process.env.REACT_INJECT_SCRIPT_PATH
      || "/tmp/mesurer-react/node_modules/@jhomra21/mesurer-solid/dist/inject-script.js";
    const source = await readFile(injectPath, "utf8");
    await page.evaluate(source);

    await page.waitForFunction(() => Boolean(window.__MESURER__));
    await page.evaluate(() => window.__MESURER__.ready());
    try {
      await page.waitForFunction(() => {
        const island = document.querySelector("[data-mesurer-island='true']");
        return Boolean(island?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"));
      }, undefined, { timeout: 5000 });
    } catch (error) {
      const dom = await page.evaluate(() => {
        const island = document.querySelector("[data-mesurer-island='true']");
        return {
          island: island?.outerHTML ?? null,
          shadow: island?.shadowRoot?.innerHTML ?? null,
          body: document.body.innerHTML,
        };
      }).catch((diagnosticError) => ({ diagnosticError: String(diagnosticError) }));
      throw new Error(`${name} toolbar did not mount. Page errors: ${JSON.stringify(errors)} DOM: ${JSON.stringify(dom)} Cause: ${String(error)}`);
    }

    const stacking = await page.evaluate(() => {
      const island = document.querySelector("[data-mesurer-island='true']");
      const shadow = island?.shadowRoot;
      const toolbar = shadow?.querySelector("[data-mesurer-toolbar='true']");
      if (!(island instanceof HTMLElement) || !(toolbar instanceof HTMLElement) || !shadow) {
        return { ok: false, reason: "missing island or toolbar" };
      }
      const rect = toolbar.getBoundingClientRect();
      const x = rect.left + Math.min(16, rect.width / 2);
      const y = rect.top + Math.min(16, rect.height / 2);
      const documentTop = document.elementFromPoint(x, y);
      const shadowTop = shadow.elementFromPoint(x, y);
      return {
        ok: documentTop === island && Boolean(shadowTop && (shadowTop === toolbar || toolbar.contains(shadowTop))),
        documentTop: documentTop?.id || documentTop?.getAttribute?.("data-hostile-header") || documentTop?.tagName || null,
        shadowTop: shadowTop?.tagName || null,
        islandZIndex: getComputedStyle(island).zIndex,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      };
    });
    if (!stacking.ok) {
      throw new Error(`${name} Mesurer island lost the host stacking/hit-test contest: ${JSON.stringify(stacking)}`);
    }

    const inspection = await page.evaluate(() => window.__MESURER__.inspect("h1"));
    if (!inspection || inspection.text !== "Trusted Types host" || inspection.rect.width <= 0) {
      throw new Error(`${name} inspection failed: ${JSON.stringify(inspection)}`);
    }

    const description = await page.evaluate(() => window.__MESURER__.describe());
    if (!description?.commands.includes("builtin.settings")) {
      throw new Error(`${name} did not initialize all built-ins`);
    }

    if (errors.length) throw new Error(`${name} page errors:\n${errors.join("\n")}`);
    console.log(`${name} packed-package consumer: PASS`);
  } finally {
    await page.close();
  }
}

function startTrustedTypesServer() {
  const server = createServer((request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; require-trusted-types-for 'script'; trusted-types 'none'",
    });
    response.end("<!doctype html><html><body><header data-hostile-header='hostile-header' style='position:fixed;inset:0 0 auto 0;height:80px;z-index:2147483646;background:#111'></header><main><h1>Trusted Types host</h1><p>No Mesurer import.</p></main></body></html>");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve Trusted Types smoke server address"));
        return;
      }
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

const trustedTypesHost = await startTrustedTypesServer();
const browser = await chromium.launch({ headless: true });
try {
  await Promise.all([
    ...cases.map((testCase) => runCase(browser, testCase)),
    runTrustedTypesCase(browser, trustedTypesHost.url),
  ]);
} finally {
  await browser.close();
  await new Promise((resolve, reject) => trustedTypesHost.server.close((error) => error ? reject(error) : resolve()));
}
