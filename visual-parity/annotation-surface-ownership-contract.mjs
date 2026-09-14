import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ANNOTATION_OWNERSHIP_URL ?? "http://127.0.0.1:4174/self-hosting.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const clickByCoordinates = async (locator, stage) => {
  const box = await locator.boundingBox();
  assert(box, `${stage}: expected rendered geometry`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_SELF_HOSTING__?.subject));

  await page.evaluate(async () => {
    await window.__MESURER_SELF_HOSTING__.subject.select("[data-self-host-target]");
  });
  await settle();

  const trigger = page.locator(
    "[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-trigger='true']",
  );
  await trigger.waitFor({ state: "visible" });
  await clickByCoordinates(trigger, "annotation trigger");

  const composer = page.locator(
    "[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-composer='true']",
  );
  await composer.waitFor({ state: "visible" });
  await composer.locator("textarea").fill("Unsaved note bound to the first selection");

  // A document-backed Context card must share paint ownership with live page
  // hover chrome. In isolated hosts the hover is portaled into the document;
  // in this non-isolated self-hosting fixture it already lives there. Exercise
  // the real pointer path and require the final hover surface to be document-owned.
  const hoverTarget = page.locator(".fixture-copy h1");
  const hoverBox = await hoverTarget.boundingBox();
  assert(hoverBox, "hover target must have rendered geometry");
  await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2);
  await page.waitForFunction(() => {
    const hover = document.querySelector("[data-mesurer-hover-measurement='true']");
    return hover instanceof HTMLElement && hover.getRootNode() === document;
  });

  const ownership = await page.evaluate(() => {
    const card = document.querySelector("[data-mesurer-annotation-composer='true']");
    const hover = document.querySelector("[data-mesurer-hover-measurement='true']");
    const selection = document.querySelector(
      "body > [data-mesurer-selected-measurement='true'] > [data-mesurer-measurement-chrome='true']",
    );
    if (!(card instanceof HTMLElement) || !(hover instanceof HTMLElement)) {
      throw new Error("Missing annotation card or document hover chrome");
    }
    return {
      cardZ: Number.parseInt(getComputedStyle(card).zIndex, 10),
      hoverZ: Number.parseInt(getComputedStyle(hover).zIndex, 10),
      selectionZ: selection instanceof HTMLElement
        ? Number.parseInt(getComputedStyle(selection).zIndex, 10)
        : null,
      hoverRootIsDocument: hover.getRootNode() === document,
      hoverDocumentLayer: hover.dataset.mesurerDocumentHoverLayer === "true",
    };
  });
  assert.equal(ownership.hoverRootIsDocument, true, "hover chrome must share the annotation card's document paint tree");
  assert(
    ownership.cardZ > ownership.hoverZ,
    `annotation card z-index ${ownership.cardZ} must beat hover ${ownership.hoverZ}`,
  );
  if (ownership.selectionZ !== null) {
    assert(
      ownership.cardZ > ownership.selectionZ,
      `annotation card z-index ${ownership.cardZ} must beat selection ${ownership.selectionZ}`,
    );
  }

  // The composer belongs to the selection that opened it. Selecting a different
  // element must close/discard that transient composer instead of moving it to
  // the new target. The new selection gets the normal small Add Note trigger.
  await page.evaluate(() => {
    const second = document.createElement("button");
    second.type = "button";
    second.dataset.selfHostTargetSecond = "true";
    second.textContent = "Second selection target";
    Object.assign(second.style, {
      position: "absolute",
      left: "720px",
      top: "430px",
      width: "220px",
      height: "72px",
      border: "1px solid #cbd5e1",
      borderRadius: "12px",
      background: "white",
    });
    document.body.append(second);
  });

  await page.evaluate(async () => {
    await window.__MESURER_SELF_HOSTING__.subject.select("[data-self-host-target-second]");
  });
  await composer.waitFor({ state: "detached" });
  await trigger.waitFor({ state: "visible" });
  await settle();

  const secondBox = await page.locator("[data-self-host-target-second]").boundingBox();
  const triggerBox = await trigger.boundingBox();
  assert(secondBox && triggerBox, "new selection and Add Note trigger must have rendered geometry");
  const triggerCenter = { x: triggerBox.x + triggerBox.width / 2, y: triggerBox.y + triggerBox.height / 2 };
  const secondCenter = { x: secondBox.x + secondBox.width / 2, y: secondBox.y + secondBox.height / 2 };
  assert(
    Math.hypot(triggerCenter.x - secondCenter.x, triggerCenter.y - secondCenter.y) < 180,
    "new selection must own the restored Add Note trigger",
  );

  const triggerZ = await trigger.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10));
  assert(
    triggerZ > ownership.hoverZ,
    `restored Add Note trigger z-index ${triggerZ} must remain above page hover chrome ${ownership.hoverZ}`,
  );

  // The abandoned draft must not follow the selection invisibly and reappear on
  // the new target when its Add Note button is used.
  await clickByCoordinates(trigger, "second selection annotation trigger");
  await composer.waitFor({ state: "visible" });
  assert.equal(
    await composer.locator("textarea").inputValue(),
    "",
    "selection change must discard the previous selection's unsaved annotation draft",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log(`Annotation ownership contract passed: Context cards occlude document-owned page chrome (${ownership.hoverDocumentLayer ? "ported" : "direct"}), selection change closes/discards the draft, and the new target gets a fresh Add Note trigger.`);
} finally {
  await browser.close();
}
