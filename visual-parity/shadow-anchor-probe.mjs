import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));
  await page.locator("#isolated-scroll-target").evaluate((element) => element.scrollIntoView({ block: "center" }));

  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    const target = document.querySelector("#isolated-scroll-target");
    const subject = window.__MESURER_ISOLATED_SCROLL_TEST__?.subject;
    if (!(target instanceof HTMLElement)) return reject(new Error("Missing target"));
    if (!subject || !(subject.root instanceof ShadowRoot)) return reject(new Error("Missing isolated Mesurer root"));

    const originalAnchorName = target.style.getPropertyValue("anchor-name");
    target.style.setProperty("anchor-name", "--mesurer-shadow-probe");
    const previousId = subject.element.id;
    subject.element.id = "mesurer-shadow-anchor-probe-host";

    const style = document.createElement("style");
    style.dataset.mesurerShadowAnchorProbe = "true";
    style.textContent = `
      #mesurer-shadow-anchor-probe-host::part(mesurer-shadow-anchor-probe) {
        position: absolute !important;
        position-anchor: --mesurer-shadow-probe !important;
        left: anchor(left) !important;
        top: anchor(top) !important;
        width: anchor-size(width) !important;
        height: anchor-size(height) !important;
        transition: none !important;
        animation: none !important;
      }
    `;
    document.head.append(style);

    const probe = document.createElement("div");
    probe.setAttribute("part", "mesurer-shadow-anchor-probe");
    subject.root.append(probe);

    const snapshot = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const before = { target: snapshot(target), probe: snapshot(probe) };
    const finish = () => {
      const after = { target: snapshot(target), probe: snapshot(probe) };
      probe.remove();
      style.remove();
      subject.element.id = previousId;
      if (originalAnchorName) target.style.setProperty("anchor-name", originalAnchorName);
      else target.style.removeProperty("anchor-name");
      resolve({ before, after });
    };
    window.addEventListener("scroll", finish, { capture: true, once: true });
    window.scrollBy({ top: 60, behavior: "instant" });
  }));

  const same = (left, right, stage) => {
    for (const key of ["x", "y", "width", "height"]) {
      assert(Math.abs(left[key] - right[key]) <= 1.5, `${stage}: ${key} target=${right[key]} probe=${left[key]}`);
    }
  };
  same(result.before.probe, result.before.target, "document ::part probe before scroll");
  same(result.after.probe, result.after.target, "document ::part probe in scroll event");
  console.log("Document ::part CSS anchor rule follows the host page in the isolated mount: PASS");
} finally {
  await browser.close();
}
