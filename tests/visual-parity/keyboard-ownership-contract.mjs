import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.KEYBOARD_OWNERSHIP_URL ?? "http://127.0.0.1:4174/keyboard-ownership.html";

const outputDir = process.env.KEYBOARD_OWNERSHIP_OUT ?? "keyboard-ownership-artifacts";

await mkdir(outputDir, { recursive: true });

const variants = [
  { name: "plain", query: "" },
  { name: "document-listener", query: "?doc" },
  { name: "capture-listener", query: "?capture&doc" },
  { name: "refocusing-prompt", query: "?prompt&doc" },
  { name: "hostile", query: "?capture&docblock&prompt&doc" },
  { name: "host-enter-cancel", query: "?hostcancel&doc" },
  { name: "document-capture-listener", query: "?docblock&doc" },
  { name: "dispose-remount", query: "?wrap", wrapMount: true },
  { name: "closed-shadow-mount", query: "?shadow=closed", closedMount: true },
];

const only = process.env.KEYBOARD_OWNERSHIP_ONLY;

if (only) variants.splice(0, variants.length, ...variants.filter((variant) => variant.name === only));

const browser = await chromium.launch({ headless: true });

const report = [];

const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

const runVariant = async (variant) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const results = [];

  page.on("pageerror", (error) => errors.push(String(error)));

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const step = async (label, run) => {
    try {
      await run();
      results.push({ label, passed: true });
    } catch (error) {
      results.push({ label, passed: false, message: String(error.message ?? error).split("\n")[0] });
    }
  };

  const pressed = async (locator) => (await locator.getAttribute("aria-pressed")) === "true";

  const waitPressed = async (locator, expected, label) => {
    const deadline = Date.now() + 2_000;

    while (Date.now() < deadline) {
      if ((await pressed(locator)) === expected) return;
      await page.waitForTimeout(40);
    }

    throw new Error(`${label}: expected aria-pressed=${expected}`);
  };

  const waitCount = async (locator, expected, label) => {
    const deadline = Date.now() + 2_000;

    while (Date.now() < deadline) {
      if ((await locator.count()) === expected) return;
      await page.waitForTimeout(40);
    }

    throw new Error(`${label}: expected ${expected} matches`);
  };

  const settingsButton = page.locator("button[data-mesurer-builtin='settings']").first();

  const selectButton = page.locator("[data-mesurer-builtin='select'] button").first();

  const editButton = page.locator("button[data-mesurer-tool-id='arrange']").first();

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });

  const docKeys = () => page.evaluate(() => window.__KB__.docKeys.splice(0));

  const hostPrompt = page.locator("#host-prompt");

  const promptValue = () => hostPrompt.inputValue();

  const activeId = () => page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName);

  const center = async (locator) => {
    const box = await locator.boundingBox();
    assert(box, "target needs geometry");

    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const clickLocator = async (locator) => {
    const point = await center(locator);
    await page.mouse.click(point.x, point.y);
  };

  const noPageLeak = async (what, typed) => {
    assert.equal(await promptValue(), "", `${what}: characters leaked into the host prompt`);

    if (variant.query.includes("doc")) {
      const seen = await docKeys();
      assert.deepEqual(seen.filter((key) => typed.includes(key)), [], `${what}: host document listener saw Mesurer keys`);
    }
  };

  const openSettings = async (regionName) => {
    if (!(await settingsDialog.isVisible())) await clickLocator(settingsButton);
    await settingsDialog.waitFor({ state: "visible" });

    return settingsDialog.getByRole("region", { name: regionName });
  };

  const dismissSettings = async () => {
    await page.keyboard.press("Escape");
    await settingsDialog.waitFor({ state: "hidden", timeout: 2_000 });
  };

  // Hosts that cancel and stop every key also block typing into their own fields by design.
  const cancelsAll = /capture|docblock/.test(variant.query);
  const hostLast = page.locator("#host-last");

  const focusMesurerControl = () => page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    island.shadowRoot.querySelector("button").focus();
  });

  // Dispatches a host-authored cancelable keydown whose own listener calls preventDefault.
  const hostState = () => page.evaluate(() => {
    const listener = (event) => event.preventDefault();
    document.body.addEventListener("keydown", listener);
    const event = new KeyboardEvent("keydown", { cancelable: true, bubbles: true });
    document.body.dispatchEvent(event);
    document.body.removeEventListener("keydown", listener);

    return { prevented: event.defaultPrevented };
  });

  // Reproduces what a retained wrapper would see: a Mesurer-looking node that takes focus after the real one is gone.
  const focusDetachedMesurerNode = () => page.evaluate(() => {
    const fake = document.createElement("div");
    fake.setAttribute("data-mesurer-root", "true");
    fake.innerHTML = "<input id='fake-mesurer-input' />";
    document.body.append(fake);
    document.getElementById("fake-mesurer-input").focus();

    return () => fake.remove();
  }).then(() => undefined);

  try {
    await page.goto(`${baseUrl}${variant.query}`, { waitUntil: "domcontentloaded" });

    if (variant.wrapMount) {
      await page.waitForFunction(() => Boolean(window.__KB__));
      await settingsButton.waitFor({ state: "visible" });
      await focusMesurerControl();
      await page.evaluate(() => window.__KB__.dispose());

      await step("after dispose a library-wrapped host focus() and preventDefault() behave natively", async () => {
        await focusDetachedMesurerNode();

        const focused = await page.evaluate(() => {
          document.getElementById("host-last").focus();

          return document.activeElement?.id;
        });

        assert.equal(focused, "host-last", "retained focus wrapper still blocks host focus()");

        await focusDetachedMesurerNode();
        assert.equal((await hostState()).prevented, true, "retained preventDefault wrapper still swallows host cancellation");
        await page.evaluate(() => document.querySelector("[data-mesurer-root='true']:not([data-mesurer-island])")?.remove());
      });

      await page.evaluate(() => window.__KB__.remount());
      await settingsButton.waitFor({ state: "visible" });
      await focusMesurerControl();

      await step("after remount, the previous instance's wrappers hold no stale ownership", async () => {
        await clickLocator(hostLast);

        const focused = await page.evaluate(() => {
          document.getElementById("host-mover").focus();

          return document.activeElement?.id;
        });

        assert.equal(focused, "host-mover", "stale focus wrapper blocked host focus()");
        assert.equal((await hostState()).prevented, true, "stale preventDefault wrapper swallowed host cancellation");
      });

      await step("remounted Mesurer fields still receive typing under a hostile host", async () => {
        const guide = await openSettings("Guide settings");
        const hex = guide.getByRole("textbox", { name: "Color hex value" });
        await hex.waitFor({ state: "visible" });
        await clickLocator(hex);
        await page.keyboard.press("Control+a");
        await page.keyboard.type("12ab34");
        assert.match((await hex.inputValue()).toLowerCase(), /12ab34/);
        await dismissSettings();
      });

      await page.screenshot({ path: `${outputDir}/${variant.name}.png` });

      return { variant: variant.name, results, errors };
    }

    if (variant.closedMount) {
      await page.waitForFunction(() => Boolean(window.__KB__));
      await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-mesurer-island]")).length > 0);

      const mode = await page.evaluate(() => {
        const island = document.querySelector("[data-mesurer-island='true']");

        return { hasShadow: Boolean(island?.shadowRoot) };
      });

      assert.equal(mode.hasShadow, false, "closed shadowMode must hide the island root");

      await page.mouse.move(1200, 880);
      await page.keyboard.press("a");
      await settle(page);

      const hit = await page.evaluate(() => {
        const points = [];

        for (let y = 8; y < innerHeight; y += 12) {
          for (let x = 8; x < innerWidth; x += 12) {
            if (document.elementFromPoint(x, y)?.hasAttribute("data-mesurer-island")) points.push({ x, y });
          }
        }

        return points;
      });

      await step("closed mount exposes Mesurer UI hit area", async () => assert(hit.length > 0, "no Mesurer UI under any sampled point"));

      const target = hit.at(Math.floor(hit.length / 2));
      const pinSelector = ".mesurer-ti-card[data-state='visible']:has(.mesurer-ti-close)";

      await step("Typography click on Mesurer UI with closed shadowMode does not pin host text", async () => {
        assert(target, "need a Mesurer UI point");
        await page.mouse.move(target.x, target.y);
        await page.mouse.click(target.x, target.y);
        await settle(page);
        assert.equal(await page.locator(pinSelector).count(), 0, "pin created under Mesurer UI");
      });

      await step("Typography still pins host text away from Mesurer UI in a closed mount", async () => {
        await page.mouse.move(1000, 800);
        await page.mouse.click(1000, 800);
        await settle(page);
        await page.locator(pinSelector).first().waitFor({ state: "visible", timeout: 2_000 });
      });

      await page.screenshot({ path: `${outputDir}/${variant.name}.png` });

      return { variant: variant.name, results, errors };
    }

    await page.waitForFunction(() => Boolean(window.__KB__));
    await settingsButton.waitFor({ state: "visible" });
    await selectButton.waitFor({ state: "visible" });

    if (variant.query.includes("prompt")) {
      await step("host prompt starts focused", async () => assert.equal(await activeId(), "host-prompt"));
    }

    await step("Settings Guide color hex input receives typed characters", async () => {
      const guide = await openSettings("Guide settings");
      const hex = guide.getByRole("textbox", { name: "Color hex value" });
      await hex.waitFor({ state: "visible" });
      await docKeys();
      await clickLocator(hex);
      await page.keyboard.press("Control+a");
      await page.keyboard.type("12ab34");
      assert.match((await hex.inputValue()).toLowerCase(), /12ab34/);
      await noPageLeak("Settings hex", "12ab34a");
    });

    await step("Escape closes Settings", async () => {
      await dismissSettings();
      assert.equal(await settingsDialog.isVisible(), false);
    });

    await step("S and 2 toggle tools after Mesurer interaction while a page prompt exists", async () => {
      await page.keyboard.press("s");
      await waitPressed(selectButton, true, "S");
      await page.keyboard.press("s");
      await waitPressed(selectButton, false, "S again");
      await page.keyboard.press("2");
      await waitPressed(editButton, true, "2");
      await page.keyboard.press("1");
      await waitPressed(editButton, false, "1");
      assert.equal(await promptValue(), "", "shortcut characters leaked into the host prompt");
    });

    await step("Delete removes a selected guide", async () => {
      const guides = page.locator("[data-mesurer-guide='true']");
      const guideTool = page.getByRole("button", { name: /^Guides/ }).first();
      await clickLocator(guideTool);
      await page.mouse.move(900, 500);
      await page.mouse.click(900, 500);
      await clickLocator(guideTool);
      await guides.first().waitFor({ state: "attached", timeout: 2_000 });
      await page.keyboard.press("Delete");
      await waitCount(guides, 0, "Delete");
    });

    await step("Context note composer and Notes search receive typed characters", async () => {
      await clickLocator(selectButton);
      await clickLocator(page.locator("#kb-target"));
      const trigger = page.locator("[data-mesurer-annotation-trigger='true']");
      await trigger.waitFor({ state: "visible", timeout: 3_000 });
      await clickLocator(trigger);
      const composer = page.locator("[data-mesurer-annotation-composer='true'] textarea");
      await composer.waitFor({ state: "visible" });
      await docKeys();
      await page.keyboard.type("probe note");
      assert.equal(await composer.inputValue(), "probe note");
      await noPageLeak("Context composer", "probe note");
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Close annotation", exact: true }).waitFor({ state: "visible" });
      await clickLocator(page.getByRole("button", { name: "Close annotation", exact: true }));
      });

    await step("Notes search receives typed characters", async () => {
      await clickLocator(page.locator("button[data-mesurer-tool-id='context.notes']"));
      const search = page.getByLabel("Search notes");
      await search.waitFor({ state: "visible" });
      await clickLocator(search);
      await docKeys();
      await page.keyboard.type("probe");
      assert.equal(await search.inputValue(), "probe");
      await noPageLeak("Notes search", "probe");
      await page.keyboard.press("Escape");
      await page.screenshot({ path: `${outputDir}/${variant.name}-notes.png` });
    });

    await step("Direct text edit receives typed characters", async () => {
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await clickLocator(editButton);
      const point = await center(page.locator("#kb-target"));
      await page.mouse.click(point.x, point.y);
      await page.mouse.dblclick(point.x, point.y);
      const editor = page.locator("[data-mesurer-text-editor='true']");
      await editor.waitFor({ state: "attached", timeout: 3_000 });
      await page.waitForFunction(() => document.activeElement?.getAttribute("data-mesurer-text-editor") === "true", null, { timeout: 3_000 });
      await page.keyboard.press("End");
      await page.keyboard.type("QZ");
      assert.match(await page.locator("#kb-target").textContent(), /QZ/);
      await noPageLeak("Direct text edit", "QZ");
      await page.keyboard.press("Escape");
      await editor.waitFor({ state: "detached", timeout: 3_000 });
    });

    // Shortcuts must stay off while the user really types in a host control they clicked.
    const idleTools = async () => {
      if (await pressed(editButton)) await clickLocator(editButton);

      if (await pressed(selectButton)) await clickLocator(selectButton);
      assert.equal(await pressed(selectButton), false);
      assert.equal(await pressed(editButton), false);
    };

    const hostTyping = async (label, focus, value) => {
      await step(`shortcuts do not fire while typing in ${label}`, async () => {
        await idleTools();
        await focus();
        await page.keyboard.type("s2");
        await page.waitForTimeout(60);
        assert.equal(await pressed(selectButton), false, "S toggled Select");
        assert.equal(await pressed(editButton), false, "2 toggled Edit");

        // A host that cancels its own keys at window capture also blocks typing into its own fields.
        if (value && !cancelsAll) assert.equal(await value(), "s2");
      });
    };

    // A host that cancels or steals focus on its own keys makes its other fields unusable by design, so they are only checked on cooperative hosts.
    const cooperativeHost = !cancelsAll && !variant.query.includes("prompt");

    if (!cancelsAll) {
      await hostTyping("a host text area", () => clickLocator(hostPrompt), async () => (await promptValue()).slice(-2));
    }

    const tabTo = async (id) => {
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await page.keyboard.press("Shift+Tab");

        if ((await activeId()) === id) return;
      }

      throw new Error(`Tab never reached #${id}`);
    };

    await step("Tab from Mesurer into a host input releases ownership, so typing there stays the host's", async () => {
      await idleTools();
      await focusMesurerControl();
      await tabTo("host-last");
      await page.keyboard.type("s2");
      await page.waitForTimeout(60);
      assert.equal(await pressed(selectButton), false, "S toggled Select while the host input was focused after Tab");
      assert.equal(await pressed(editButton), false, "2 toggled Edit while the host input was focused after Tab");

      if (!cancelsAll) assert.equal(await hostLast.inputValue(), "s2", "host input lost typing after Tab");
    });

    await step("host cancellation of a host-targeted key is left alone after Tab from Mesurer", async () => {
      await focusMesurerControl();
      await tabTo("host-last");
      await page.evaluate(() => window.__KB__.hostCancels.splice(0));
      await page.keyboard.press("Enter");
      const cancels = await page.evaluate(() => window.__KB__.hostCancels.filter((entry) => entry.type === "keydown" && entry.key === "Enter"));

      if (cancelsAll || variant.query.includes("hostcancel")) {
        assert.equal(cancels.length, 1, "host listener did not run");
        assert.equal(cancels[0].prevented, true, "Mesurer neutralized a host listener's preventDefault on a host-targeted event");
      }
    });

    await step("host key handler can move focus after keyboard navigation out of Mesurer", async () => {
      // A host that cancels every key cannot also move focus with one.
      if (cancelsAll) return;

      await focusMesurerControl();
      await tabTo("host-mover");
      await page.keyboard.press("Enter");

      if (!cancelsAll) assert.equal(await activeId(), "host-last", "host focus() was ignored after Tab left Mesurer");
    });

    await step("programmatic host focus() works once the user left Mesurer", async () => {
      await focusMesurerControl();
      await tabTo("host-last");

      const focused = await page.evaluate(() => {
        document.getElementById("host-prompt").focus();

        return document.activeElement?.id;
      });

      assert.equal(focused, "host-prompt");
    });

    await step("pressing Mesurer does not blur a host field Mesurer did not take focus from", async () => {
      // The refocusing prompt steals focus back from any host field by design.
      if (variant.query.includes("prompt")) return;
      await idleTools();
      await clickLocator(hostLast);
      const before = await page.evaluate(() => window.__KB__.state.hostBlurs);
      await page.evaluate(() => {
        const button = document.querySelector("[data-mesurer-island='true']").shadowRoot.querySelector("button");
        const init = { bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 7, pointerType: "mouse" };
        button.dispatchEvent(new PointerEvent("pointerdown", init));
        button.dispatchEvent(new PointerEvent("pointerup", init));
      });
      assert.equal(await activeId(), "host-last", "host field lost focus");
      assert.equal(await page.evaluate(() => window.__KB__.state.hostBlurs), before, "host blur handler ran");
    });

    if (!cooperativeHost) {
      await page.screenshot({ path: `${outputDir}/${variant.name}.png` });

      return { variant: variant.name, results, errors };
    }

    await hostTyping("a host contenteditable", () => clickLocator(page.locator("#host-editable")), () => page.locator("#host-editable").textContent());

    await step("shortcuts do not fire while typing in a host select", async () => {
      await idleTools();
      await clickLocator(settingsButton);
      await dismissSettings();
      await clickLocator(page.locator("#host-select"));
      await page.keyboard.press("Escape");
      await page.keyboard.press("s");
      await page.waitForTimeout(60);
      assert.equal(await pressed(selectButton), false, "S toggled Select while a host select was focused");
    });

    await step("shortcuts do not fire while typing in a same-origin iframe input", async () => {
      await idleTools();
      const frame = page.frameLocator("#host-frame");
      await frame.locator("#frame-input").click();
      await page.keyboard.type("s2");
      await page.waitForTimeout(60);
      assert.equal(await frame.locator("#frame-input").inputValue(), "s2", "iframe input lost typing");
      assert.equal(await pressed(selectButton), false);
      assert.equal(await pressed(editButton), false);
    });

    await step("shortcuts do not fire while typing in a host closed-shadow input", async () => {
      await idleTools();
      await clickLocator(settingsButton);
      await dismissSettings();
      await clickLocator(page.locator("#host-closed"));
      await page.keyboard.type("s2");
      await page.waitForTimeout(60);
      assert.equal(await pressed(selectButton), false, "S toggled Select while a closed-shadow host input was focused");
      assert.equal(await pressed(editButton), false);
    });

    await step("a clicked host checkbox does not disable shortcuts", async () => {
      await idleTools();
      await clickLocator(page.locator("#host-checkbox"));
      await page.keyboard.press("s");
      await waitPressed(selectButton, true, "S after checkbox click");
      await page.keyboard.press("s");
    });

    await page.screenshot({ path: `${outputDir}/${variant.name}.png` });
  } finally {
    if (errors.length) results.push({ label: "browser diagnostics clean", passed: false, message: errors.join(" | ").slice(0, 400) });
    await page.close();
  }

  return { variant: variant.name, results, errors };
};

let failed = 0;

try {
  for (const variant of variants) {
    const outcome = await runVariant(variant);
    report.push(outcome);

    for (const result of outcome.results) {
      if (!result.passed) failed += 1;
      console.log(`${result.passed ? "PASS" : "FAIL"} [${outcome.variant}] ${result.label}${result.passed ? "" : ` :: ${result.message}`}`);
    }
  }
} finally {
  await writeFile(`${outputDir}/keyboard-ownership.json`, JSON.stringify({ baseUrl, report }, null, 2));
  await browser.close();
}

if (failed) {
  console.error(`Keyboard ownership contract failed: ${failed} step(s).`);
  process.exit(1);
}

console.log("Keyboard ownership contract passed: Mesurer fields, shortcuts, Delete, Escape, host isolation, host editors, closed shadow roots, and checkbox focus across hostile host variants.");








