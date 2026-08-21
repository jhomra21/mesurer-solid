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

async function assertHostIsolation(page, testCase) {
  const result = await page.evaluate(async () => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const toolbar = island?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']");
    if (!(island instanceof HTMLElement) || !(toolbar instanceof HTMLElement)) {
      throw new Error("Mesurer island/toolbar missing during host-isolation smoke test");
    }

    const frames = async (count = 2) => {
      for (let index = 0; index < count; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    };

    const originalParent = island.parentNode;
    const hostileStyle = document.createElement("style");
    hostileStyle.dataset.hostileMesurerSmoke = "true";
    hostileStyle.textContent = `
      html, body { overflow: hidden !important; }
      body { transform: translateZ(0) !important; contain: paint !important; }
      [data-mesurer-island='true'] {
        display: none !important;
        position: static !important;
        inset: auto !important;
        width: 1px !important;
        height: 1px !important;
        overflow: hidden !important;
        z-index: -1 !important;
        opacity: 0.01 !important;
        transform: scale(0.01) !important;
      }
    `;
    document.head.append(hostileStyle);

    const blocker = document.createElement("div");
    blocker.dataset.hostileOverlay = "true";
    Object.assign(blocker.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      pointerEvents: "auto",
      background: "rgba(255, 0, 0, 0.01)",
    });
    document.body.append(blocker);

    await frames(3);

    const toolbarRect = toolbar.getBoundingClientRect();
    const point = {
      x: toolbarRect.left + toolbarRect.width / 2,
      y: toolbarRect.top + toolbarRect.height / 2,
    };
    const computed = getComputedStyle(island);
    const ordinaryHit = document.elementFromPoint(point.x, point.y);
    const topLayer = island.matches(":popover-open");

    let laterPopoverStayedAbove = true;
    if ("popover" in HTMLElement.prototype && typeof HTMLElement.prototype.showPopover === "function") {
      const hostPopover = document.createElement("div");
      hostPopover.popover = "manual";
      Object.assign(hostPopover.style, {
        position: "fixed",
        inset: "0",
        width: "100vw",
        height: "100vh",
        margin: "0",
        pointerEvents: "auto",
        background: "rgba(0, 0, 255, 0.01)",
      });
      document.body.append(hostPopover);
      hostPopover.showPopover();
      await frames(4);
      laterPopoverStayedAbove = document.elementFromPoint(point.x, point.y) === island;
      hostPopover.hidePopover();
      hostPopover.remove();
    }

    let modalInteractive = true;
    let restoredAfterModal = true;
    if (typeof HTMLDialogElement.prototype.showModal === "function") {
      const dialog = document.createElement("dialog");
      dialog.textContent = "Host modal";
      Object.assign(dialog.style, {
        position: "fixed",
        inset: "0",
        width: "100vw",
        height: "100vh",
        margin: "0",
        border: "0",
        padding: "0",
      });
      document.body.append(dialog);
      dialog.showModal();
      await frames(4);
      modalInteractive = island.parentNode === dialog
        && document.elementFromPoint(point.x, point.y) === island;
      dialog.close();
      await frames(3);
      restoredAfterModal = island.parentNode === originalParent;
      dialog.remove();
    }

    blocker.remove();
    hostileStyle.remove();

    return {
      topLayer,
      ordinaryHitIsMesurer: ordinaryHit === island,
      laterPopoverStayedAbove,
      modalInteractive,
      restoredAfterModal,
      hostStyle: {
        display: computed.display,
        position: computed.position,
        width: computed.width,
        height: computed.height,
        zIndex: computed.zIndex,
        opacity: computed.opacity,
        transform: computed.transform,
        overflow: computed.overflow,
      },
      toolbarRect: {
        width: toolbarRect.width,
        height: toolbarRect.height,
      },
    };
  });

  if (!result.topLayer) {
    throw new Error(`${testCase.name} did not promote Mesurer into the browser top layer: ${JSON.stringify(result)}`);
  }
  if (!result.ordinaryHitIsMesurer) {
    throw new Error(`${testCase.name} Mesurer toolbar was occluded by an extreme host overlay: ${JSON.stringify(result)}`);
  }
  if (!result.laterPopoverStayedAbove) {
    throw new Error(`${testCase.name} Mesurer did not reassert above a later host popover: ${JSON.stringify(result)}`);
  }
  if (!result.modalInteractive || !result.restoredAfterModal) {
    throw new Error(`${testCase.name} Mesurer did not stay interactive through a modal dialog: ${JSON.stringify(result)}`);
  }
  if (
    result.hostStyle.display === "none"
    || result.hostStyle.position !== "fixed"
    || result.hostStyle.opacity !== "1"
    || result.hostStyle.transform !== "none"
    || result.hostStyle.overflow !== "visible"
    || result.toolbarRect.width <= 0
    || result.toolbarRect.height <= 0
  ) {
    throw new Error(`${testCase.name} host-page CSS overrode Mesurer's protected host contract: ${JSON.stringify(result)}`);
  }
}

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

    await assertHostIsolation(page, testCase);

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
  const testCase = { name: "Trusted Types browser-eval injector" };
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
    await page.waitForFunction(() => {
      const island = document.querySelector("[data-mesurer-island='true']");
      return Boolean(island?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"));
    }, undefined, { timeout: 5000 });

    await assertHostIsolation(page, testCase);

    const island = page.locator("[data-mesurer-island='true']");
    const toolbarButton = island.locator("[data-mesurer-toolbar='true'] button").first();
    await toolbarButton.click();
    if ((await toolbarButton.getAttribute("aria-pressed")) !== "true") {
      throw new Error(`${testCase.name} toolbar did not remain interactive`);
    }

    const inspection = await page.evaluate(() => window.__MESURER__.inspect("h1"));
    if (!inspection || inspection.text !== "Trusted Types host" || inspection.rect.width <= 0) {
      throw new Error(`${testCase.name} inspection failed: ${JSON.stringify(inspection)}`);
    }

    const description = await page.evaluate(() => window.__MESURER__.describe());
    if (!description?.commands.includes("builtin.settings")) {
      throw new Error(`${testCase.name} did not initialize all built-ins`);
    }

    if (errors.length) throw new Error(`${testCase.name} page errors:\n${errors.join("\n")}`);
    console.log(`${testCase.name} packed-package consumer: PASS`);
  } finally {
    await page.close();
  }
}

function startTrustedTypesServer() {
  const server = createServer((_request, response) => {
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
