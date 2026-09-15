import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const cases = [
  {
    name: "Packed Solid 2 mount",
    url: process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192",
  },
  {
    name: "Packed React external injection",
    url: process.env.REACT_URL ?? "http://127.0.0.1:4190",
    injectPath: process.env.REACT_INJECT_SCRIPT_PATH
      ?? "/tmp/mesurer-react/node_modules/mesurer-solid/dist/inject-script.js",
  },
];

const browser = await chromium.launch({ headless: true });

const settle = (page) => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const center = async (locator, label) => {
  const box = await locator.boundingBox();
  assert(box, `${label} must have rendered geometry`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

const dispatchSelectPlanePointer = (page, type, point) => page.evaluate(
  ({ eventType, x, y }) => {
    const island = document.querySelector("[data-mesurer-island='true']");
    if (!(island instanceof HTMLElement) || !island.shadowRoot) {
      throw new Error("Missing Mesurer island ShadowRoot");
    }
    const target = island.shadowRoot.elementFromPoint(x, y);
    if (!(target instanceof Element)) {
      throw new Error(`Missing Select-plane hit at ${x},${y}`);
    }
    target.dispatchEvent(new PointerEvent(eventType, {
      bubbles: true,
      cancelable: true,
      composed: false,
      pointerId: 91,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: eventType === "pointerdown" ? 1 : 0,
      clientX: x,
      clientY: y,
    }));
  },
  { eventType: type, x: point.x, y: point.y },
);

const selectionSnapshot = (page) => page.evaluate(() => window.__MESURER__.context({ scope: "selection" }));

const selectedId = async (page, label) => {
  const context = await selectionSnapshot(page);
  assert.equal(context.targets.length, 1, `${label} expected one selected target: ${JSON.stringify(context.targets)}`);
  const target = context.targets[0];
  assert.equal(
    target?.inspection.id,
    "packed-adjacent-b",
    `${label} selected the wrong target: ${JSON.stringify({
      selector: target?.selector ?? null,
      tag: target?.inspection.tag ?? null,
      id: target?.inspection.id ?? null,
      text: target?.inspection.text ?? null,
      rect: target?.inspection.rect ?? null,
    })}`,
  );
  return target.inspection.id;
};

const addAdjacentTargets = (page) => page.evaluate(() => {
  document.querySelector("#packed-adjacent-a")?.remove();
  document.querySelector("#packed-adjacent-b")?.remove();

  const makeTarget = (id, text, left) => {
    const target = document.createElement("div");
    target.id = id;
    target.textContent = text;
    Object.assign(target.style, {
      position: "absolute",
      left: `${left}px`,
      top: "320px",
      width: "180px",
      height: "80px",
      border: "1px solid #cbd5e1",
      background: "white",
      color: "#0f172a",
      font: "18px/1.3 ui-sans-serif, system-ui, sans-serif",
    });
    document.body.append(target);
  };

  // Keep the targets horizontally adjacent so the rejected side-placement
  // composer covers B, but put them below the framework demo content so snapping
  // has no unrelated consumer element to choose at B's click point.
  makeTarget("packed-adjacent-a", "Adjacent target A", 100);
  makeTarget("packed-adjacent-b", "Adjacent target B", 320);
});

async function openDraft(page, trigger, composer, value, label) {
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  const triggerPoint = await center(trigger, `${label} Add Note trigger`);
  await page.mouse.click(triggerPoint.x, triggerPoint.y);
  await composer.waitFor({ state: "visible", timeout: 3000 });
  await composer.locator("textarea").fill(value);
}

async function assertFreshDraft(page, trigger, composer, label) {
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  const triggerPoint = await center(trigger, `${label} restored Add Note trigger`);
  await page.mouse.click(triggerPoint.x, triggerPoint.y);
  await composer.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(
    await composer.locator("textarea").inputValue(),
    "",
    `${label} must not inherit the abandoned draft`,
  );
  await composer.getByRole("button", { name: "Close note composer" }).click();
  await composer.waitFor({ state: "detached", timeout: 3000 });
}

async function runCase(testCase) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const diagnostics = [];
  page.on("pageerror", (error) => diagnostics.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") diagnostics.push(message.text());
  });

  try {
    await page.goto(testCase.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__HOST_READY__));
    if (testCase.injectPath) {
      await page.evaluate(() => {
        window.__MESURER_CONFIG__ = {
          ...(window.__MESURER_CONFIG__ ?? {}),
          context: true,
          reuseExisting: false,
        };
      });
      await page.evaluate(await readFile(testCase.injectPath, "utf8"));
    }
    await page.waitForFunction(() => Boolean(window.__MESURER__));
    await page.evaluate(() => window.__MESURER__.ready());
    await addAdjacentTargets(page);
    await page.evaluate(async () => {
      await window.__MESURER__.command("builtin.select");
      await window.__MESURER__.select("#packed-adjacent-a");
    });
    await settle(page);

    const trigger = page.locator(
      "[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-trigger='true']",
    );
    const composer = page.locator(
      "[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-composer='true']",
    );
    await openDraft(page, trigger, composer, "abandoned draft A", testCase.name);

    const b = page.locator("#packed-adjacent-b");
    const bPoint = await center(b, `${testCase.name} adjacent B`);
    const composerBox = await composer.boundingBox();
    assert(composerBox, `${testCase.name} composer must have rendered geometry`);
    const composerCoversBCenter = bPoint.x >= composerBox.x
      && bPoint.x <= composerBox.x + composerBox.width
      && bPoint.y >= composerBox.y
      && bPoint.y <= composerBox.y + composerBox.height;
    assert.equal(
      composerCoversBCenter,
      false,
      `${testCase.name} initial composer placement must not cover adjacent B's physical click point`,
    );

    const initialHit = await page.evaluate(
      ({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return {
          island: hit instanceof HTMLElement && hit.dataset.mesurerIsland === "true",
          tag: hit?.tagName ?? null,
        };
      },
      bPoint,
    );
    assert.equal(initialHit.island, true, `${testCase.name} physical Select plane must own the initial hit`);

    await page.mouse.move(bPoint.x, bPoint.y);
    await page.mouse.down();
    await composer.waitFor({ state: "detached", timeout: 1200 });
    await page.mouse.up();
    await settle(page);

    assert.equal(
      await selectedId(page, `${testCase.name} adjacent physical handoff`),
      "packed-adjacent-b",
    );
    await assertFreshDraft(page, trigger, composer, `${testCase.name} adjacent physical handoff`);

    // Reproduce the manual failure's important ownership split directly: Select
    // receives the pointer inside its ShadowRoot while a window-level Context
    // listener does not. The rejected candidate could still select B on pointerup
    // while leaving A's draft mounted. Context must therefore also observe the
    // Select interaction plane itself and abandon the draft on pointerdown.
    await page.evaluate(() => window.__MESURER__.select("#packed-adjacent-a"));
    await settle(page);
    await openDraft(
      page,
      trigger,
      composer,
      "select-plane abandoned draft A",
      `${testCase.name} Select-plane-local handoff`,
    );
    await dispatchSelectPlanePointer(page, "pointerdown", bPoint);
    await composer.waitFor({ state: "detached", timeout: 1200 });
    await dispatchSelectPlanePointer(page, "pointerup", bPoint);
    await settle(page);
    assert.equal(
      await selectedId(page, `${testCase.name} Select-plane-local handoff`),
      "packed-adjacent-b",
    );
    await assertFreshDraft(page, trigger, composer, `${testCase.name} Select-plane-local handoff`);

    assert.deepEqual(
      diagnostics,
      [],
      `${testCase.name} adjacent physical handoff diagnostics: ${diagnostics.join("\n")}`,
    );

    console.log(`${testCase.name} adjacent annotation handoff: PASS`, {
      composerClearOfBCenter: true,
      initialHitOwnedByIsland: true,
      composerDismissedBeforePointerUp: true,
      selectionTransferredToB: true,
      selectPlaneLocalComposerDismissedBeforePointerUp: true,
      selectPlaneLocalSelectionTransferredToB: true,
      abandonedDraftCleared: true,
    });
  } finally {
    await page.close();
  }
}

try {
  for (const testCase of cases) await runCase(testCase);
} finally {
  await browser.close();
}
