import { chromium } from "playwright";

const url = process.env.SOLID1_URL ?? "http://127.0.0.1:4180";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const hostButton = page.getByRole("button", { name: /Solid 1 host/ });
  await hostButton.click();
  if (!(await hostButton.textContent())?.includes("count 1")) {
    throw new Error("Solid 1 host did not remain reactive after Mesurer mounted");
  }

  await page.waitForFunction(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    return Boolean(island?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"));
  });

  const description = await page.evaluate(async () => {
    const instance = window.__MESURER_SOLID1__;
    for (let attempt = 0; attempt < 100 && !instance?.pluginHost?.has("mesurer.settings"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return instance?.describe();
  });
  if (!description || description.plugins.length < 8) {
    throw new Error(`Expected default Mesurer plugin distribution, got ${JSON.stringify(description)}`);
  }

  await page.evaluate(() => {
    const host = window.__MESURER_SOLID1__?.pluginHost;
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
    const host = window.__MESURER_SOLID1__?.pluginHost;
    if (!host) throw new Error("Missing Mesurer plugin host");
    await host.load({
      id: "demo.agent-extension",
      version: "1.0.0",
      provides: ["tool:demo"],
      setup(ctx) {
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
  await extensionButton.click();
  const fired = await page.evaluate(() => window.__MESURER_DEMO_FIRED__ ?? 0);
  if (fired !== 1) throw new Error(`Expected extension command to run once, got ${fired}`);

  const pluginState = await page.evaluate(() => window.__MESURER_SOLID1__?.pluginHost?.state.get("demo"));
  if (pluginState?.clicks !== 1) throw new Error(`Unexpected plugin state: ${JSON.stringify(pluginState)}`);

  await page.evaluate(() => window.__MESURER_SOLID1__?.pluginHost?.remove("demo.agent-extension"));
  await extensionButton.waitFor({ state: "detached" }).catch(async () => {
    if (await extensionButton.isVisible()) throw new Error("Extension toolbar contribution survived plugin disposal");
  });

  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join("\n")}`);
  console.log("Solid 1 + universal Mesurer + runtime plugin composition: PASS");
} finally {
  await browser.close();
}
