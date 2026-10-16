import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.RESPONSIVE_EXTENSION_ASSETS_URL ?? "http://127.0.0.1:4192/responsive-preview.html";

const extensionPath = process.env.MESURER_EXTENSION_PATH ?? "extension/dist";

const output = process.env.RESPONSIVE_EXTENSION_ASSETS_OUT ?? "responsive-extension-assets-artifacts";

const manifest = JSON.parse(await readFile(`${extensionPath}/manifest.json`, "utf8"));

assert.deepEqual(manifest.host_permissions ?? [], [], "Extension must not request broad host permissions");

assert(manifest.permissions.includes("activeTab"), "Extension must retain its explicit activeTab permission");

await mkdir(output, { recursive: true });

const browser = await chromium.launch();

const context = await browser.newContext();

const errors = [];

const page = await context.newPage();

await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await window.__responsiveMount?.dispose();
  });
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-island]").length === 0);

  const injectBuiltExtensionAssets = async () => {
    await page.evaluate(() => {
      window.__MESURER_CONFIG__ = { screenshot: false, recoverDisconnected: true };
    });
    await page.addScriptTag({ path: `${extensionPath}/mediabunny-vendor.js` });
    await page.addScriptTag({ path: `${extensionPath}/mesurer-main.js` });
    await page.waitForFunction(() => Boolean(window.__MESURER_INSTANCE__?.element?.isConnected));
  };

  // This contract checks built extension assets in a normal page context.
  // Toolbar-action activation and activeTab authorization are manually verified.
  await injectBuiltExtensionAssets();
  await page.waitForFunction(() =>
    Boolean(window.__MESURER_INSTANCE__?.element?.shadowRoot?.querySelector("button[data-mesurer-builtin='responsive']")));
  assert.equal(await page.locator("[data-mesurer-island]").count(), 1,
    "Injecting built assets creates one Responsive instance");

  // Re-evaluating the built injector against a live instance must reuse it.
  await page.addScriptTag({ path: `${extensionPath}/mesurer-main.js` });
  assert.equal(await page.locator("[data-mesurer-island]").count(), 1,
    "Re-evaluating the built injector reuses the live instance");

  await page.keyboard.press("b");
  const frame = page.locator("iframe[data-mesurer-responsive-frame]");
  await frame.waitFor();
  await page.waitForFunction(() =>
    Boolean(document.querySelector("[data-mesurer-island]")?.shadowRoot
      ?.querySelector("iframe[data-mesurer-responsive-frame]")?.contentDocument?.body));

  const preview = page.frameLocator("iframe[data-mesurer-responsive-frame]");
  await preview.getByTestId("breakpoint-label").waitFor();
  await page.locator("button[data-mesurer-builtin='guides']").click();

  // Send physical browser input with focus held in the preview document.
  const target = preview.getByTestId("inspection-target");
  const targetBox = await target.boundingBox();
  assert(targetBox, "Preview inspection target should be visible");
  const targetPoint = { x: targetBox.x + 20, y: targetBox.y + targetBox.height / 2 };
  await page.mouse.move(targetPoint.x, targetPoint.y);
  await page.mouse.down();
  await page.mouse.move(targetPoint.x + 28, targetPoint.y, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction(() =>
    Boolean(document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-preview-guide]")));

  const guide = page.locator("[data-mesurer-island]").evaluate((host) => {
    const root = host.shadowRoot;
    const line = root.querySelector("[data-mesurer-preview-guide]");
    const rect = line?.getBoundingClientRect();

    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  });

  const guidePoint = await guide;
  assert(guidePoint, "Dragging in the preview creates a selected preview guide");
  await page.mouse.click(guidePoint.x, guidePoint.y);

  await preview.locator("body").press("Delete");
  await page.waitForFunction(() =>
    !document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-preview-guide]"));
  assert.equal(await page.locator("[data-mesurer-guide='true']").count(), 0,
    "Delete from the preview removes its selected guide, not a root guide");

  await preview.locator("body").press("Escape");
  await frame.waitFor({ state: "detached" });

  // Reload resets page globals. Reinjecting built assets checks page-level
  // remounting only, not extension background recovery or activeTab authorization.
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await window.__responsiveMount?.dispose();
  });
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-island]").length === 0);
  await injectBuiltExtensionAssets();
  await page.waitForFunction(() =>
    Boolean(window.__MESURER_INSTANCE__?.element?.shadowRoot?.querySelector("button[data-mesurer-builtin='responsive']")));
  assert.equal(await page.locator("[data-mesurer-island]").count(), 1,
    "Reinjecting built assets after reload restores Responsive");
  await page.addScriptTag({ path: `${extensionPath}/mesurer-main.js` });
  assert.equal(await page.locator("[data-mesurer-island]").count(), 1,
    "Re-evaluating the built injector reuses the live instance after reload");

  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);

  const report = {
    status: "PASS",
    url,
    extensionPath,
    permissions: manifest.permissions,
    hostPermissions: manifest.host_permissions ?? [],
    contract: "built extension assets exercised in a normal browser page",
    previewLoaded: true,
    previewKeys: { deleteRemovedSelectedGuide: true, escapeClosedResponsive: true },
    reload: "built assets reinjected after reload; toolbar activation, activeTab authorization, and automatic recovery require manual verification",
    duplicateMounts: false,
    errors,
  };

  await writeFile(`${output}/result.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("Responsive extension assets contract: PASS", report);
} finally {
  await context.close();
  await browser.close();
}
