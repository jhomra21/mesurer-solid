import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const url = process.env.SOLID1_URL ?? "http://127.0.0.1:4180";
const injectPath = resolve("packages/mesurer/dist/inject-script.js");
const injectSource = await readFile(injectPath, "utf8");
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

  await page.evaluate(injectSource);
  await page.evaluate(() => window.__MESURER__.ready());

  const directContract = await page.evaluate(() => {
    const capabilities = window.__MESURER__.capabilities().capabilities;
    const island = window.__MESURER_INSTANCE__?.element;
    const inspectorRoot = island?.shadowRoot ?? island;
    const contextToolIds = [...(inspectorRoot?.querySelectorAll("[data-mesurer-tool-id] button") ?? [])]
      .map((button) => button.closest("[data-mesurer-tool-id]")?.dataset.mesurerToolId ?? null)
      .filter((id) => id?.startsWith("context."))
      .sort();
    return {
      capabilities,
      capabilityKeys: Object.keys(capabilities).sort(),
      contextToolIds,
    };
  });

  const expectedCapabilityKeys = ["annotations", "capturePlan", "context", "review", "select"];
  if (JSON.stringify(directContract.capabilityKeys) !== JSON.stringify(expectedCapabilityKeys)) {
    throw new Error(`Unexpected direct context capability surface: ${JSON.stringify(directContract)}`);
  }
  const expectedContextToolIds = ["context.add-note", "context.copy", "context.copy-selection"];
  if (JSON.stringify(directContract.contextToolIds) !== JSON.stringify(expectedContextToolIds)) {
    throw new Error(`Unexpected direct context toolbar surface: ${JSON.stringify(directContract)}`);
  }

  const selectedByAgent = await page.evaluate(async () => {
    const island = window.__MESURER_INSTANCE__?.element;
    const hostRoot = [...document.body.children].find((element) => element !== island);
    const targetA = hostRoot instanceof HTMLElement ? hostRoot : null;
    const targetB = targetA?.querySelector("button, p, h1, h2, h3, section, article, div") ?? null;
    if (!(targetA instanceof HTMLElement) || !(targetB instanceof HTMLElement)) {
      throw new Error("Expected two host elements for agent selection smoke test.");
    }
    targetA.setAttribute("data-testid", "mesurer-agent-select-a");
    targetB.setAttribute("data-testid", "mesurer-agent-select-b");
    const context = await window.__MESURER__.select([
      '[data-testid="mesurer-agent-select-a"]',
      '[data-testid="mesurer-agent-select-b"]',
    ]);
    const reread = await window.__MESURER__.context({ scope: "selection" });
    return {
      scope: context.scope.kind,
      targetCount: context.targets.length,
      selectors: context.targets.map((target) => target.inspection.selector).sort(),
      rereadTargetCount: reread.targets.length,
    };
  });

  if (
    selectedByAgent.scope !== "selection"
    || selectedByAgent.targetCount !== 2
    || selectedByAgent.rereadTargetCount !== 2
  ) {
    throw new Error(`Programmatic selection did not return scoped context: ${JSON.stringify(selectedByAgent)}`);
  }

  await page.evaluate(async () => {
    const instance = window.__MESURER_INSTANCE__;
    if (!instance?.pluginHost) throw new Error("Expected injected Mesurer plugin host.");
    instance.element.dataset.reuseProbe = "human-state";
    window.__MESURER_REUSE_BEFORE_ELEMENT__ = instance.element;
    window.__MESURER_REUSE_BEFORE_AGENT__ = window.__MESURER__;
    await instance.pluginHost.load({
      id: "test.human-state",
      version: "1.0.0",
      setup(ctx) {
        ctx.state.register({
          id: "test.human-state.value",
          initial: { marker: 42 },
        });
      },
    });
  });

  // This models an agent evaluating its bundled injector after a human has
  // already selected/measured/annotated the page. Default injection must reuse
  // the live instance instead of destroying that shared review state.
  await page.evaluate(injectSource);
  await page.evaluate(() => window.__MESURER__.ready());

  const reused = await page.evaluate(async () => {
    const state = await window.__MESURER__.state();
    const selection = await window.__MESURER__.context({ scope: "selection" });
    return {
      sameElement: window.__MESURER_INSTANCE__?.element === window.__MESURER_REUSE_BEFORE_ELEMENT__,
      sameAgent: window.__MESURER__ === window.__MESURER_REUSE_BEFORE_AGENT__,
      marker: window.__MESURER_INSTANCE__?.element.dataset.reuseProbe ?? null,
      pluginState: state["test.human-state.value"] ?? null,
      selectionTargets: selection.targets.length,
      islandCount: document.querySelectorAll("[data-mesurer-island='true']").length,
    };
  });

  if (reused.marker !== "human-state" || reused.pluginState?.marker !== 42 || reused.selectionTargets !== 2) {
    throw new Error(`Agent reinjection destroyed human Mesurer state: ${JSON.stringify(reused)}`);
  }
  if (!reused.sameElement || !reused.sameAgent || reused.islandCount !== 1) {
    throw new Error(`Agent reinjection did not reuse exactly one live Mesurer instance: ${JSON.stringify(reused)}`);
  }

  await page.evaluate(() => {
    window.__MESURER_CONFIG__ = { reuseExisting: false };
  });
  await page.evaluate(injectSource);
  await page.evaluate(() => window.__MESURER__.ready());

  const replaced = await page.evaluate(async () => {
    const state = await window.__MESURER__.state();
    return {
      sameElement: window.__MESURER_INSTANCE__?.element === window.__MESURER_REUSE_BEFORE_ELEMENT__,
      marker: window.__MESURER_INSTANCE__?.element.dataset.reuseProbe ?? null,
      pluginState: state["test.human-state.value"] ?? null,
      islandCount: document.querySelectorAll("[data-mesurer-island='true']").length,
    };
  });
  if (replaced.sameElement || replaced.marker !== null || replaced.pluginState !== null || replaced.islandCount !== 1) {
    throw new Error(`reuseExisting:false did not deliberately replace the injected instance: ${JSON.stringify(replaced)}`);
  }

  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join("\n")}`);
  if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join("\n")}`);
  console.log("Context-returning selection and human-state-safe injection: PASS");
} finally {
  await browser.close();
}