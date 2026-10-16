import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.RESPONSIVE_PREVIEW_URL ?? "http://localhost:4188/responsive-preview.html";

const output = process.env.RESPONSIVE_PREVIEW_OUT ?? "responsive-preview-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

const errors = [];

const expectedRefusalDiagnostics = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() !== "error") return;

  if (message.text().includes("frame-ancestors 'none'")) expectedRefusalDiagnostics.push(message.text());
  else errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

const waitMesurer = (selector, predicate) => page.waitForFunction(({ selector, predicate }) => {
  const root = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;
  const element = root.querySelector(selector);

  if (!element) return false;

  return predicate === "present" || element.getAttribute("data-mesurer-toolbar-mode") === predicate
    || element.getAttribute("aria-checked") === predicate;
}, { selector, predicate });

const button = page.locator("button[data-mesurer-builtin='responsive']");

const open = async () => {
  await waitMesurer("button[data-mesurer-builtin='responsive']", "present");
  await button.click();
  await page.locator("[data-mesurer-responsive-frame]").waitFor();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), "hidden");
};

const close = async () => {
  await page.keyboard.press("Escape");
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator("button[data-mesurer-builtin='responsive']").waitFor();

  const initialOverflow = await page.evaluate(() => {
    document.documentElement.style.setProperty("overflow", "clip", "important");

    return { value: document.documentElement.style.getPropertyValue("overflow"), priority: document.documentElement.style.getPropertyPriority("overflow") };
  });

  await page.keyboard.press("b");
  await page.locator("[data-mesurer-responsive-frame]").waitFor();
  await page.frameLocator("[data-mesurer-responsive-frame]").locator("[data-testid='breakpoint-label']").waitFor();
  await settle();

  const frameEvidence = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island]");
    const root = island?.shadowRoot ?? document;
    const frame = root.querySelector("iframe[data-mesurer-responsive-frame]");

    if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) throw new Error("Responsive preview did not mount");
    const card = root.querySelector("[data-mesurer-responsive-card]");
    const fit = Math.min(1, (innerWidth - 64) / 393, (innerHeight - 72 - 36 - 12 - 40 - 40) / 852);
    const computed = getComputedStyle(frame);

    return {
      source: frame.src,
      innerWidth: frame.contentWindow.innerWidth,
      innerHeight: frame.contentWindow.innerHeight,
      fit,
      transform: computed.transform,
      mediaColor: getComputedStyle(frame.contentDocument.querySelector("[data-testid='breakpoint-label']")).color,
      nestedToolbar: Boolean(frame.contentDocument.querySelector("[data-mesurer-toolbar]")),
      nestedIsland: Boolean(frame.contentDocument.querySelector("[data-mesurer-island]")),
      isolatedHost: Boolean(island?.shadowRoot),
      topLayerHost: island?.getAttribute("popover"),
      cardTransform: getComputedStyle(card).transform,
      frameRect: frame.getBoundingClientRect().toJSON(),
      header: root.querySelector("[data-mesurer-responsive-header]")?.textContent,
      guards: (() => {
        const view = frame.contentWindow;
        const form = frame.contentDocument.createElement("form");
        frame.contentDocument.body.append(form);
        const submit = new view.Event("submit", { bubbles: true, cancelable: true });
        form.dispatchEvent(submit);
        const download = frame.contentDocument.createElement("a");
        download.download = "blocked.txt";
        frame.contentDocument.body.append(download);
        const click = new view.MouseEvent("click", { bubbles: true, cancelable: true });
        download.dispatchEvent(click);
        form.remove();
        download.remove();

        return {
          popupBlocked: view.open("about:blank") === null,
          alertBlocked: view.alert("blocked") === false,
          confirmBlocked: view.confirm("blocked") === false,
          promptBlocked: view.prompt("blocked") === null,
          submitPrevented: submit.defaultPrevented,
          downloadPrevented: click.defaultPrevented,
        };
      })(),
    };
  });

  assert.equal(frameEvidence.source, url);
  assert.equal(frameEvidence.innerWidth, 393);
  assert.equal(frameEvidence.innerHeight, 852);
  assert.match(frameEvidence.transform, /matrix\(/);
  assert.ok(Math.abs(frameEvidence.frameRect.width - 393 * frameEvidence.fit) < 1, "Rendered frame width should match scaled CSS viewport");
  assert.ok(Math.abs(frameEvidence.frameRect.height - 852 * frameEvidence.fit) < 1, "Rendered frame height should match scaled CSS viewport");
  assert.equal(frameEvidence.nestedToolbar, false);
  assert.equal(frameEvidence.nestedIsland, false);
  assert.equal(frameEvidence.isolatedHost, true, "Default Responsive fixture should use the isolated renderer topology");
  assert.equal(frameEvidence.topLayerHost, "manual");

  const inFrameMount = await page.locator("[data-mesurer-responsive-frame]").evaluate(async (frame) => {
    const child = frame.contentWindow;
    const before = child.document.querySelectorAll("[data-mesurer-island]").length;
    const mounted = child.__mountMesurerForContract();
    const stable = mounted.element === mounted.element && mounted.root === mounted.root;
    const agentReadyError = await mounted.agent.ready().then(() => "", (error) => error.message);
    const handleReadyError = await mounted.ready.then(() => "", (error) => error.message);

    mounted.dispose();
    const after = child.document.querySelectorAll("[data-mesurer-island]").length;

    return { before, after, stable, agentReadyError, handleReadyError };
  });

  assert.deepEqual(inFrameMount, {
    before: 0,
    after: 0,
    stable: true,
    agentReadyError: "Mesurer is suppressed inside a Responsive preview frame.",
    handleReadyError: "Mesurer is suppressed inside a Responsive preview frame.",
  });
  assert.match(frameEvidence.header, /393 × 852/);
  assert.equal(frameEvidence.mediaColor, "rgb(20, 150, 50)");
  assert.deepEqual(frameEvidence.guards, {
    popupBlocked: true,
    alertBlocked: true,
    confirmBlocked: true,
    promptBlocked: true,
    submitPrevented: true,
    downloadPrevented: true,
  });
  const scale = Number(frameEvidence.transform.match(/^matrix\(([^,]+)/)?.[1]);
  assert.ok(Math.abs(scale - frameEvidence.fit) < 0.002, `Frame scale ${scale} != fit ${frameEvidence.fit}`);
  await page.screenshot({ path: join(output, "responsive-open.png"), fullPage: true });
  await page.locator("button[data-mesurer-builtin='settings']").click();
  await page.getByText("General", { exact: true }).click();
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await page.screenshot({ path: join(output, "responsive-open-dark.png"), fullPage: true });
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("light");
  await page.locator("button[data-mesurer-builtin='settings']").click();

  await page.locator("[data-mesurer-responsive-frame]").click({ position: { x: 150, y: 200 } });
  await page.locator("[data-mesurer-responsive-frame]").waitFor();
  await page.getByRole("button", { name: "Guide orientation menu" }).click();
  await page.getByRole("menu").waitFor();
  await page.locator("[data-mesurer-responsive-frame]").click({ position: { x: 150, y: 200 } });
  await page.getByRole("menu").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Close Responsive" }).click();
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });
  await open();
  await page.locator("[data-mesurer-responsive-header]").click();
  await page.locator("[data-mesurer-responsive-frame]").waitFor();
  await page.locator("[data-mesurer-responsive-stage]").click({ position: { x: 4, y: 4 } });
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });
  await open();
  await page.evaluate(async () => {
    const screenshot = window.__responsiveMount.pluginHost.service.get("screenshot");
    await screenshot.start().catch(() => undefined);
  });
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);

  await open();
  await page.getByRole("button", { name: "Record options" }).click();
  await page.getByRole("menuitem", { name: "New recording" }).click();
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);

  await open();
  await page.evaluate(async () => {
    const mounted = window.__responsiveMount;
    const host = await mounted.ready;
    await host.command.execute("recording.toggle");
  });
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
  await button.click();
  await page.locator("[data-mesurer-responsive-frame]").waitFor();
  await button.click();
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });
  await open();
  const previewFrame = page.frameLocator("[data-mesurer-responsive-frame]");
  await previewFrame.getByRole("textbox", { name: "Shortcut input" }).focus();
  await page.keyboard.press("b");
  await page.locator("[data-mesurer-responsive-frame]").waitFor();
  await previewFrame.locator("body").click({ position: { x: 20, y: 20 } });
  await page.locator("[data-mesurer-responsive-frame]").evaluate((frame) => frame.contentDocument.activeElement?.blur());
  await page.keyboard.press("b");
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });

  await open();
  await page.frameLocator("[data-mesurer-responsive-frame]").locator("[data-testid='breakpoint-label']").waitFor();
  await page.evaluate(() => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;
    const frame = root.querySelector("iframe[data-mesurer-responsive-frame]");
    const shadow = frame?.contentDocument?.createElement("div");
    const input = frame?.contentDocument?.createElement("input");

    if (!shadow || !input) throw new Error("Preview input fixture could not be created");
    shadow.attachShadow({ mode: "open" }).append(input);
    frame?.contentDocument?.body.append(shadow);
    input?.focus();
  });
  await page.keyboard.press("b");
  await page.locator("[data-mesurer-responsive-frame]").waitFor();
  await page.locator("[data-mesurer-responsive-frame]").evaluate((frame) => {
    frame.contentWindow.location.href = `${frame.contentWindow.location.origin}${frame.contentWindow.location.pathname}?responsive-navigation=1`;
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("iframe");

    return frame?.contentWindow?.location.search === "?responsive-navigation=1"
      && Boolean(frame.contentDocument?.querySelector("[data-testid='breakpoint-label']"));
  });
  await page.frameLocator("[data-mesurer-responsive-frame]").locator("body").click({ position: { x: 10, y: 10 } });
  await page.locator("[data-mesurer-responsive-frame]").evaluate((frame) => frame.contentDocument.activeElement?.blur());
  await page.keyboard.press("b");
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });

  await open();
  await page.evaluate(() => {
    document.documentElement.style.setProperty("overflow", "scroll", "important");
  });

  await close();

  const hostOverflow = await page.evaluate(() => ({
    value: document.documentElement.style.getPropertyValue("overflow"),
    priority: document.documentElement.style.getPropertyPriority("overflow"),
  }));

  assert.deepEqual(hostOverflow, { value: "scroll", priority: "important" }, "Host overflow updates while preview is open must survive cleanup");
  await page.evaluate(() => document.documentElement.style.setProperty("overflow", "clip", "important"));

  const input = page.getByRole("textbox", { name: "Shortcut input" });
  await input.focus();
  await page.keyboard.press("b");
  assert.equal(await page.locator("[data-mesurer-responsive-frame]").count(), 0);
  await input.blur();

  await open();
  await page.locator("button[data-mesurer-builtin='rulers']").click();
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });

  await open();
  await page.locator("button[data-mesurer-tool-id='arrange']").click();
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });
  await page.locator("button[data-mesurer-tool-id='arrange']").click();
  await waitMesurer("[data-mesurer-toolbar='true']", "select");

  await page.locator("button[data-mesurer-tool-id='arrange']").click();
  await waitMesurer("[data-mesurer-toolbar='true']", "edit");
  await page.keyboard.press("b");
  await page.locator("[data-mesurer-responsive-frame]").waitFor();
  await waitMesurer("[data-mesurer-toolbar='true']", "select");
  await close();

  await page.locator("button[data-mesurer-tool-id='arrange']").click();
  await waitMesurer("[data-mesurer-toolbar='true']", "edit");

  const editRect = await page.locator("[data-testid='edit-target']").boundingBox();
  assert(editRect, "Expected rendered Edit target geometry");
  await page.mouse.dblclick(editRect.x + editRect.width / 2, editRect.y + editRect.height / 2);
  await page.locator("[data-mesurer-text-editor='true']").waitFor();
  await page.keyboard.press("b");
  assert.equal(await page.locator("[data-mesurer-responsive-frame]").count(), 0, "B should be owned by direct text editing");
  await page.keyboard.press("Escape");
  await page.locator("[data-mesurer-text-editor='true']").waitFor({ state: "detached" });
  await page.locator("button[data-mesurer-tool-id='arrange']").click();
  await waitMesurer("[data-mesurer-toolbar='true']", "select");

  await page.locator("button[data-mesurer-builtin='settings']").click();
  await page.getByText("General", { exact: true }).click();
  const shortcutsSwitch = page.getByRole("switch", { name: "Shortcuts", exact: true });
  await shortcutsSwitch.click();
  await page.keyboard.press("Escape");
  await page.locator("[role='dialog'][aria-label='Settings']").waitFor({ state: "detached" });
  await open();
  await page.frameLocator("[data-mesurer-responsive-frame]").locator("body").click({ position: { x: 10, y: 10 } });
  await page.locator("[data-mesurer-responsive-frame]").evaluate((frame) => frame.contentDocument.activeElement?.blur());
  await page.keyboard.press("b");
  await page.locator("[data-mesurer-responsive-frame]").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });
  await page.locator("button[data-mesurer-builtin='settings']").click();
  await page.getByText("General", { exact: true }).click();
  await page.getByRole("switch", { name: "Shortcuts", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.locator("[role='dialog'][aria-label='Settings']").waitFor({ state: "detached" });

  await page.locator("button[data-mesurer-builtin='settings']").click();
  await page.getByText("General", { exact: true }).click();
  await page.locator("[data-mesurer-plugin-settings-disclosure='plugins']").click();
  const responsiveSwitch = page.locator("[data-mesurer-plugin-toggle='mesurer.responsive']");
  await responsiveSwitch.waitFor();
  await responsiveSwitch.click();
  await waitMesurer("[data-mesurer-plugin-toggle='mesurer.responsive']", "false");
  await page.keyboard.press("b");
  assert.equal(await page.locator("[data-mesurer-responsive-frame]").count(), 0);
  await responsiveSwitch.click();
  await waitMesurer("[data-mesurer-plugin-toggle='mesurer.responsive']", "true");
  await page.keyboard.press("Escape");
  await page.locator("[role='dialog'][aria-label='Settings']").waitFor({ state: "detached" });

  await open();
  await page.locator("button[data-mesurer-builtin='settings']").click();
  await page.getByText("General", { exact: true }).click();
  await page.locator("[data-mesurer-plugin-settings-disclosure='plugins']").click();
  await page.locator("[data-mesurer-plugin-toggle='mesurer.responsive']").click();
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });
  await page.locator("[data-mesurer-plugin-toggle='mesurer.responsive']").click();
  await waitMesurer("[data-mesurer-plugin-toggle='mesurer.responsive']", "true");
  await page.keyboard.press("Escape");
  await page.locator("[role='dialog'][aria-label='Settings']").waitFor({ state: "detached" });

  await open();
  await close();
  assert.equal(await page.locator("iframe[data-mesurer-responsive-frame]").count(), 0);

  const restored = await page.evaluate(() => ({
    value: document.documentElement.style.getPropertyValue("overflow"),
    priority: document.documentElement.style.getPropertyPriority("overflow"),
  }));

  assert.deepEqual(restored, initialOverflow);
  await open();
  await page.screenshot({ path: join(output, "responsive-reopen.png"), fullPage: true });
  await page.mouse.move(20, 100);

  const hitOwnership = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island]");
    const root = island?.shadowRoot ?? document;

    return {
      owner: root.elementFromPoint(20, 100)?.getAttribute("data-mesurer-responsive-stage"),
      hoverPaint: root.querySelectorAll("[data-mesurer-hover-measurement='true']").length,
    };
  });

  assert.deepEqual(hitOwnership, { owner: "true", hoverPaint: 0 });
  await close();
  await page.route(url, async (route) => {
    if (route.request().frame() === page.mainFrame()) {
      await route.continue();

      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "Content-Security-Policy": "frame-ancestors 'none'" },
      body: "<!doctype html><title>Refused preview</title>",
    });
  });
  await open();
  await page.locator("[data-mesurer-responsive-refused='true']").waitFor();

  const refusedEvidence = await page.evaluate(() => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    return {
      hover: root.querySelectorAll("[data-mesurer-hover-measurement='true']").length,
      selected: root.querySelectorAll("[data-mesurer-selected-measurement='true']").length,
    };
  });

  assert.deepEqual(refusedEvidence, { hover: 0, selected: 0 },
    "A refused preview must not produce inspection evidence");
  await page.screenshot({ path: join(output, "responsive-refused.png"), fullPage: true });
  await close();
  await open();
  await page.evaluate(() => window.__responsiveMount.dispose());
  await page.locator("[data-mesurer-responsive-frame]").waitFor({ state: "detached" });

  const disposedState = await page.evaluate(() => ({
    stage: Boolean(document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-responsive-stage]")),
    overflow: document.documentElement.style.getPropertyValue("overflow"),
  }));

  assert.deepEqual(disposedState, { stage: false, overflow: "clip" });
  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);
  await writeFile(join(output, "responsive-preview.json"), `${JSON.stringify({
    url, frameEvidence, restored, errors, expectedRefusalDiagnostics, refusedStateCovered: true, refusedEvidence,
  }, null, 2)}\n`);
  console.log(`Responsive preview contract passed. Evidence: ${output}`);
} catch (error) {
  await page.screenshot({ path: join(output, "responsive-failure.png"), fullPage: true }).catch(() => undefined);
  await writeFile(join(output, "responsive-preview-failure.json"), `${JSON.stringify({
    url, errors, error: String(error),
  }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
