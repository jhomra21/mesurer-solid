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
    if (!(target instanceof HTMLElement)) return reject(new Error("Missing target"));

    const originalAnchorName = target.style.getPropertyValue("anchor-name");
    target.style.setProperty("anchor-name", "--mesurer-shadow-probe");

    const host = document.createElement("div");
    host.dataset.mesurerShadowAnchorProbe = "true";
    host.style.display = "contents";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      #probe {
        position: absolute;
        position-anchor: --mesurer-shadow-probe;
        left: anchor(left);
        top: anchor(top);
        width: anchor-size(width);
        height: anchor-size(height);
      }
    `;
    const probe = document.createElement("div");
    probe.id = "probe";
    shadow.append(style, probe);
    document.body.append(host);

    const snapshot = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const before = { target: snapshot(target), probe: snapshot(probe) };
    const finish = () => {
      const after = { target: snapshot(target), probe: snapshot(probe) };
      host.remove();
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
  same(result.before.probe, result.before.target, "cross-shadow probe before scroll");
  same(result.after.probe, result.after.target, "cross-shadow probe in scroll event");
  console.log("Cross-shadow CSS anchor bridge follows the host page in the scroll event: PASS");
} finally {
  await browser.close();
}
