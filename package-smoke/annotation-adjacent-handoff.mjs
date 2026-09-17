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

const selectionSnapshot = (page) => page.evaluate(() => window.__MESURER__.context({ scope: "selection" }));

const selectedId = async (page, expectedId, label) => {
  const context = await selectionSnapshot(page);
  assert.equal(context.targets.length, 1, `${label} expected one selected target: ${JSON.stringify(context.targets)}`);
  const target = context.targets[0];
  assert.equal(
    target?.inspection.id,
    expectedId,
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
  await composer
    .getByRole("button", { name: "Close note composer" })
    .evaluate((button) => button.click());
  await composer.waitFor({ state: "detached", timeout: 3000 });
}

const contextOwnership = (page) => page.evaluate(() => {
  const islands = [...document.querySelectorAll("[data-mesurer-island='true']")];
  const island = islands[0] ?? null;
  const shadow = island instanceof HTMLElement ? island.shadowRoot : null;
  const root = shadow?.querySelector("[data-mesurer-root='true']") ?? null;
  const contextRoot = document.querySelector("[data-mesurer-context-root='true']");
  const composer = contextRoot?.querySelector("[data-mesurer-annotation-composer='true']") ?? null;
  return {
    islandCount: islands.length,
    contextInsideCanonicalRoot: Boolean(root && contextRoot && root.contains(contextRoot)),
    composerInsideCanonicalRoot: Boolean(root && composer && root.contains(composer)),
    contextInDocument: contextRoot?.getRootNode() === document,
    composerInDocument: composer?.getRootNode() === document,
    documentInspectorMount: contextRoot instanceof HTMLElement
      ? contextRoot.dataset.mesurerDocumentInspectorMount ?? null
      : null,
    coordinateSpace: composer instanceof HTMLElement
      ? composer.dataset.mesurerContextCoordinateSpace ?? null
      : null,
    bodyComposerCount: document.body.querySelectorAll("[data-mesurer-annotation-composer='true']").length,
  };
});

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
          ...window.__MESURER_CONFIG__,
          context: true,
          reuseExisting: false,
        };
      });
      await page.evaluate(await readFile(testCase.injectPath, "utf8"));
    }
    await page.waitForFunction(() => Boolean(window.__MESURER__));
    await page.evaluate(() => window.__MESURER__.ready());
    await addAdjacentTargets(page);
    await page.evaluate(() => window.__MESURER__.command("builtin.select"));
    await settle(page);

    const a = page.locator("#packed-adjacent-a");
    const aPoint = await center(a, `${testCase.name} adjacent A`);
    await page.mouse.click(aPoint.x, aPoint.y);
    await settle(page);
    assert.equal(
      await selectedId(page, "packed-adjacent-a", `${testCase.name} initial physical selection`),
      "packed-adjacent-a",
    );

    const trigger = page.locator(
      "[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']",
    );
    const composer = page.locator(
      "[data-mesurer-context-root='true'] [data-mesurer-annotation-composer='true']",
    );
    await openDraft(page, trigger, composer, "abandoned draft A", testCase.name);

    const ownership = await contextOwnership(page);
    assert.equal(ownership.islandCount, 1, `${testCase.name} packed consumer must have exactly one public Mesurer island`);
    assert.equal(ownership.contextInsideCanonicalRoot, false, `${testCase.name} page-owned Context must leave the viewport root`);
    assert.equal(ownership.composerInsideCanonicalRoot, false, `${testCase.name} page-owned composer must leave the viewport root`);
    assert.equal(ownership.contextInDocument, true, `${testCase.name} Context must share the host document scroll tree`);
    assert.equal(ownership.composerInDocument, true, `${testCase.name} composer must share the host document scroll tree`);
    assert.equal(ownership.documentInspectorMount, "true", `${testCase.name} Context must use one document inspector mount`);
    assert.equal(ownership.coordinateSpace, "document", `${testCase.name} Context must use document ownership`);
    assert.equal(ownership.bodyComposerCount, 1, `${testCase.name} must render exactly one document-backed composer`);

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
    assert.equal(initialHit.island, true, `${testCase.name} canonical Mesurer island must own the initial page hit`);

    // Real browser pointer input must dismiss the document-backed draft while
    // the pointer is still down; pointerup then transfers Select ownership to B.
    await page.mouse.move(bPoint.x, bPoint.y);
    await page.mouse.down();
    await composer.waitFor({ state: "detached", timeout: 1200 });
    await page.mouse.up();
    await settle(page);

    assert.equal(
      await selectedId(page, "packed-adjacent-b", `${testCase.name} adjacent physical handoff`),
      "packed-adjacent-b",
    );
    await assertFreshDraft(page, trigger, composer, `${testCase.name} adjacent physical handoff`);

    assert.deepEqual(
      diagnostics,
      [],
      `${testCase.name} adjacent physical handoff diagnostics: ${diagnostics.join("\n")}`,
    );

    console.log(`${testCase.name} adjacent annotation handoff: PASS`, {
      initialSelectionWasPhysical: true,
      documentContextRoot: true,
      documentComposer: true,
      coordinateSpace: "document",
      composerClearOfBCenter: true,
      initialHitOwnedByIsland: true,
      composerDismissedBeforePointerUp: true,
      selectionTransferredToB: true,
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
