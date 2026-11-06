const { app, BrowserWindow } = require("electron");

const assert = require("node:assert/strict");

const { mkdirSync, writeFileSync } = require("node:fs");

const path = require("node:path");

const output = process.env.MESURER_ELECTRON_DOCKING_OUT ?? path.join(__dirname, "docking-artifacts");

mkdirSync(output, { recursive: true });

app.setPath("userData", path.join(output, "user-data"));

// Each topology gets its own native window; closing one must not quit the run.
app.on("window-all-closed", () => {});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves with the first truthy value; rejects with the label and the last value read.
const until = async (label, read, timeoutMs = 8000) => {
  const started = Date.now();
  let last;

  while (Date.now() - started < timeoutMs) {
    last = await read();

    if (last) return last;
    await pause(25);
  }

  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
};

// Recorded inside the page so a failure shows what the toolbar actually received:
// every pointer event (with how many native samples it stands for) and every
// data-dock-edge / orientation change, on one clock.
const RECORDER = `(() => {
  const trace = [];
  const t0 = performance.now();
  const bar = document.querySelector("[data-mesurer-toolbar]");
  const log = (kind, extra) => trace.push({ t: Math.round(performance.now() - t0), kind, ...extra });

  for (const type of ["pointerdown", "pointerup", "pointercancel", "lostpointercapture"]) {
    window.addEventListener(type, (event) => log(type, { x: event.clientX, y: event.clientY, target: event.composedPath()[0]?.tagName }), true);
  }

  window.addEventListener("pointermove", (event) => log("pointermove", { x: event.clientX, y: event.clientY, samples: event.getCoalescedEvents().length }), true);
  new MutationObserver(() => log("dock", { edge: bar.dataset.dockEdge ?? null, orientation: bar.dataset.orientation })).observe(bar, { attributes: true, attributeFilter: ["data-dock-edge", "data-orientation"] });
  window.dockingTrace = trace;
})()`;

app.whenReady().then(async () => {
  const evidence = [];

  for (const topology of ["framed", "controls", "hidden"]) {
    const window = new BrowserWindow({
      width: 1280,
      height: 1000,
      frame: topology === "framed",
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
    });

    const web = window.webContents;
    const evaluate = (code) => web.executeJavaScript(code);
    let trace = [];

    try {
      await window.loadFile(path.join(__dirname, "toolbar-docking.html"), { query: { topology } });
      window.show();
      window.focus();
      web.focus();

      await until("the packed renderer to mount", () => evaluate("Boolean(window.dockingReady)"), 60000);
      await evaluate(RECORDER);

      const geometry = () => evaluate(`(() => { const bar = document.querySelector("[data-mesurer-toolbar]"); const rect = bar.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, edge: bar.dataset.dockEdge, orientation: bar.dataset.orientation, animations: bar.getAnimations().length, viewport: { width: innerWidth, height: innerHeight } }; })()`);

      // The toolbar has stopped when nothing animates and its box and edge hold
      // still for longer than the 180 ms timer that settles the dock after a release.
      const settled = async (label) => {
        let previous = "";
        let quiet = 0;

        return until(label, async () => {
          const now = await geometry();
          const key = JSON.stringify([now.x, now.y, now.width, now.height, now.edge, now.orientation]);

          quiet = now.animations === 0 && key === previous ? quiet + 1 : 0;
          previous = key;

          return quiet >= 12 ? now : null;
        });
      };

      const click = async (selector) => {
        const point = await evaluate(`(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }; })()`);
        web.sendInputEvent({ type: "mouseMove", ...point });
        web.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
        web.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 });
      };

      const settingsButton = "button[data-mesurer-builtin='settings']";
      const settingsOpen = (open) => async () => (await evaluate(`Boolean(document.querySelector("[role='dialog'][aria-label='Settings']"))`)) === open;

      await click(settingsButton);
      await until("Settings to open", settingsOpen(true));
      await evaluate(`(() => { const select = document.querySelector("select[aria-label='Toolbar dock']"); select.value = "snap"; select.dispatchEvent(new Event("change", { bubbles: true })); })()`);
      // Snap is applied once the toolbar reports the edge it docked to.
      await until("snap docking to apply", () => evaluate(`Boolean(document.querySelector("[data-mesurer-toolbar]").dataset.dockEdge)`));
      await click(settingsButton);
      await until("Settings to close", settingsOpen(false));
      await settled("the toolbar to rest after enabling snap");

      // `stalled` blocks the renderer's main thread while the whole path is
      // delivered, so Chromium hands the toolbar one pointermove that stands for
      // every sample (as a busy frame does on a slow machine).
      const drag = async (edge, { stalled }) => {
        const before = await settled(`the toolbar to rest before dragging to ${edge}`);

        // A stalled drag ends low on the side: without the free-middle pass, the
        // nearest drop spot to that point is the bottom corner, not the side.
        const sideY = stalled ? before.viewport.height - 160 : 500;

        const end = {
          left: { x: 24, y: sideY },
          top: { x: 140, y: 24 },
          right: { x: before.viewport.width - 24, y: sideY },
          bottom: { x: 640, y: before.viewport.height - 24 },
        }[edge];

        const start = { x: Math.round(before.x + 8), y: Math.round(before.y + 8) };
        const downs = await evaluate(`window.dockingTrace.filter((entry) => entry.kind === "pointerdown").length`);
        web.sendInputEvent({ type: "mouseMove", ...start });
        web.sendInputEvent({ type: "mouseDown", ...start, button: "left", clickCount: 1 });
        // The drag begins only once the toolbar has received the press.
        await until("the toolbar to receive the press", () => evaluate(`window.dockingTrace.filter((entry) => entry.kind === "pointerdown").length > ${downs}`));

        const stall = stalled ? evaluate("(() => { const until = performance.now() + 400; while (performance.now() < until); return true; })()") : null;

        // Let the busy loop start before the path is sent.
        if (stall) await pause(40);
        let previous = start;

        for (const destination of [{ x: 640, y: 500 }, end]) {
          const from = previous;

          for (let step = 1; step <= 18; step++) {
            const point = { x: Math.round(from.x + (destination.x - from.x) * step / 18), y: Math.round(from.y + (destination.y - from.y) * step / 18) };
            web.sendInputEvent({ type: "mouseMove", ...point, button: "left", movementX: point.x - previous.x, movementY: point.y - previous.y });
            previous = point;

            if (!stalled) await pause(16);
          }
        }

        web.sendInputEvent({ type: "mouseUp", ...end, button: "left", clickCount: 1 });

        if (stall) await stall;

        const after = await settled(`the toolbar to rest after dragging to ${edge}`);
        trace = await evaluate("window.dockingTrace");

        const label = `${topology} ${stalled ? "stalled " : ""}${edge}`;
        const context = () => JSON.stringify({ before, after, trace: trace.slice(-40) });

        assert.equal(after.edge, edge, `${label}: ${context()}`);
        assert.equal(after.orientation, edge === "left" || edge === "right" ? "vertical" : "horizontal", label);

        if (topology === "controls") assert(!(after.x < 90 && after.y < 42 && after.x + after.width > 0), "native controls remain clear");

        if (edge === "left") assert(Math.abs(after.x - 16) <= 2, "left docking uses available renderer edge");

        if (edge === "top" && topology !== "controls") assert(Math.abs(after.y - 16) <= 2, "no unnecessary framed/hidden titlebar exclusion");

        if (stalled) {
          const moves = trace.filter((entry) => entry.kind === "pointermove");
          assert(moves.some((entry) => entry.samples > 1), `${label}: the stalled drag arrived as coalesced samples: ${context()}`);
        }

        evidence.push({ topology, edge, stalled, after, pointerEvents: trace.length, coalescedSamples: Math.max(...trace.filter((entry) => entry.kind === "pointermove").map((entry) => entry.samples), 0), dockChanges: trace.filter((entry) => entry.kind === "dock") });
        writeFileSync(path.join(output, `${topology}${stalled ? "-stalled" : ""}-${edge}.png`), (await web.capturePage()).toPNG());
        await evaluate("window.dockingTrace.length = 0");
      };

      for (const edge of ["left", "top", "right", "bottom"]) await drag(edge, { stalled: false });

      // Each stalled drag leaves an edge for another one across the free middle.
      for (const edge of ["left", "top", "right", "bottom"]) await drag(edge, { stalled: true });
    } catch (error) {
      writeFileSync(path.join(output, `${topology}-failure-trace.json`), JSON.stringify(trace, null, 2));
      throw error;
    } finally {
      window.destroy();
    }
  }

  writeFileSync(path.join(output, "result.json"), JSON.stringify({ passed: true, evidence }, null, 2));
  app.exit(0);
}).catch((error) => {
  writeFileSync(path.join(output, "result.json"), JSON.stringify({ passed: false, error: String(error) }, null, 2));
  console.error(error);
  app.exit(1);
});
