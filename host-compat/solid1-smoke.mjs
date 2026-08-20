import { resolve } from "node:path";
import { chromium } from "playwright";

const url = process.env.SOLID1_URL ?? "http://127.0.0.1:4180";
const injectPath = resolve("packages/mesurer/dist/inject.js");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const hostButton = page.getByRole("button", { name: /Solid 1 host/ });
  await hostButton.click();
  if (!(await hostButton.textContent())?.includes("count 1")) {
    throw new Error("Solid 1 host was not reactive before Mesurer injection");
  }

  // This is the intended coding-agent path: the user app has no Mesurer import.
  // A browser harness injects one self-contained module into the already-running page.
  await page.evaluate(() => {
    window.__MESURER_CONFIG__ = { globalName: "__MESURER__" };
  });
  await page.addScriptTag({ path: injectPath, type: "module" });

  await page.waitForFunction(() => Boolean(window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await page.waitForFunction(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    return Boolean(island?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"));
  });

  await hostButton.click();
  if (!(await hostButton.textContent())?.includes("count 2")) {
    throw new Error("Solid 1 host did not remain reactive after external Mesurer injection");
  }

  const feedback = await page.evaluate(() => window.__MESURER__.feedback([
    "[data-testid='solid1-counter']",
    "[data-testid='solid1-sibling']",
  ]));
  if (feedback.elements.length !== 2) {
    throw new Error(`Agent feedback did not inspect both host elements: ${JSON.stringify(feedback)}`);
  }
  if (feedback.elements[0].padding.top !== 16 || feedback.elements[0].rect.width <= 0) {
    throw new Error(`Agent box-model inspection was incorrect: ${JSON.stringify(feedback.elements[0])}`);
  }

  const distance = await page.evaluate(() => window.__MESURER__.distance(
    "[data-testid='solid1-counter']",
    "[data-testid='solid1-sibling']",
  ));
  if (!distance || Math.abs(distance.horizontalGap - 12) > 0.5) {
    throw new Error(`Expected a 12px flex gap from agent measurement, got ${JSON.stringify(distance)}`);
  }

  const pointPick = await page.evaluate(() => {
    const button = document.querySelector("[data-testid='solid1-counter']");
    const rect = button.getBoundingClientRect();
    return window.__MESURER__.at(rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  if (pointPick?.tag !== "button") {
    throw new Error(`Agent point picking missed the Solid 1 button: ${JSON.stringify(pointPick)}`);
  }

  const description = await page.evaluate(() => window.__MESURER__.describe());
  if (!description || description.plugins.length < 8) {
    throw new Error(`Expected default Mesurer plugin distribution, got ${JSON.stringify(description)}`);
  }
  if (!description.services.includes("runtime:solid")) {
    throw new Error(`Expected runtime:solid service in agent description, got ${JSON.stringify(description.services)}`);
  }

  await page.evaluate(() => window.__MESURER__.command("builtin.xray"));
  const xrayEnabled = await page.evaluate(() => document.body.classList.contains("mesurer-solid-xray"));
  if (!xrayEnabled) throw new Error("Agent command bridge did not activate X-ray");
  await page.evaluate(() => window.__MESURER__.command("builtin.xray"));

  await page.evaluate(() => {
    const host = window.__MESURER_INSTANCE__?.pluginHost;
    if (!host) throw new Error("Missing Mesurer plugin host");
    if (!host.remove("mesurer.xray")) throw new Error("Failed to remove X-ray plugin");
  });
  await page.waitForFunction(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const buttons = [...(island?.shadowRoot?.querySelectorAll("[data-mesurer-toolbar='true'] button") ?? [])];
    const xray = buttons.find((button) => button.getAttribute("aria-label")?.startsWith("X-ray"));
    return Boolean(xray && getComputedStyle(xray).display === "none");
  });

  await page.evaluate(async () => {
    const host = window.__MESURER_INSTANCE__?.pluginHost;
    if (!host) throw new Error("Missing Mesurer plugin host");
    await host.load({
      id: "demo.agent-extension",
      version: "1.0.0",
      requires: ["runtime:solid", "tool:select"],
      provides: ["tool:demo"],
      setup(ctx) {
        const runtime = ctx.service.get("runtime:solid");
        if (!runtime) throw new Error("Missing runtime:solid service");
        const pluginMount = runtime.createInspectorMount();
        pluginMount.element.dataset.demoPluginMount = "true";
        pluginMount.element.textContent = "Demo plugin UI";
        ctx.lifecycle.onDispose(() => pluginMount.dispose());

        ctx.state.register({ id: "demo", initial: { clicks: 0 }, history: true, persist: true });
        ctx.command.register("demo.fire", () => {
          ctx.state.update("demo", (value) => ({ ...value, clicks: value.clicks + 1 }));
          window.__MESURER_DEMO_FIRED__ = (window.__MESURER_DEMO_FIRED__ ?? 0) + 1;
        });
        ctx.tool.register({
          id: "demo",
          label: "Demo extension",
          shortcut: "K",
          command: "demo.fire",
          order: 500,
        });
      },
    });
  });

  const extensionButton = page.getByRole("button", { name: "Demo extension (K)" });
  await extensionButton.waitFor({ state: "visible" });
  const pluginMountVisible = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    return Boolean(island?.shadowRoot?.querySelector("[data-demo-plugin-mount='true']"));
  });
  if (!pluginMountVisible) throw new Error("runtime:solid did not create plugin-owned inspector UI");

  await extensionButton.click();
  const fired = await page.evaluate(() => window.__MESURER_DEMO_FIRED__ ?? 0);
  if (fired !== 1) throw new Error(`Expected extension command to run once, got ${fired}`);

  const pluginState = await page.evaluate(() => window.__MESURER__.state());
  if (pluginState.demo?.clicks !== 1) throw new Error(`Unexpected plugin state: ${JSON.stringify(pluginState)}`);

  await page.evaluate(() => window.__MESURER_INSTANCE__?.pluginHost?.remove("demo.agent-extension"));
  await extensionButton.waitFor({ state: "detached" }).catch(async () => {
    if (await extensionButton.isVisible()) throw new Error("Extension toolbar contribution survived plugin disposal");
  });
  const pluginMountAfterRemoval = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    return Boolean(island?.shadowRoot?.querySelector("[data-demo-plugin-mount='true']"));
  });
  if (pluginMountAfterRemoval) throw new Error("Plugin-owned renderer UI survived plugin lifecycle disposal");

  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join("\n")}`);
  if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join("\n")}`);
  console.log("Solid 1 host + external injector + agent feedback loop + runtime services/plugins: PASS");
} finally {
  await browser.close();
}
