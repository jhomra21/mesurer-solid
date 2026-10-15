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

    try {
      await window.loadFile(path.join(__dirname, "toolbar-docking.html"), { query: { topology } });

      for (let attempt = 0; attempt < 100 && !(await evaluate("Boolean(window.dockingReady)")); attempt++) await pause(50);
      assert(await evaluate("Boolean(window.dockingReady)"), "packed renderer mounted");
      const geometry = () => evaluate(`(() => { const bar = document.querySelector("[data-mesurer-toolbar]"); const rect = bar.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, edge: bar.dataset.dockEdge, orientation: bar.dataset.orientation, viewport: { width: innerWidth, height: innerHeight } }; })()`);

      const click = async (selector) => {
        const point = await evaluate(`(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }; })()`);
        web.sendInputEvent({ type: "mouseMove", ...point });
        web.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
        web.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 });
        await pause(150);
      };

      await click("button[data-mesurer-builtin='settings']");
      await evaluate(`(() => { const select = document.querySelector("select[aria-label='Toolbar dock']"); select.value = "snap"; select.dispatchEvent(new Event("change", { bubbles: true })); })()`);
      await pause(250);
      await click("button[data-mesurer-builtin='settings']");

      for (const edge of ["left", "top", "right", "bottom"]) {
        const before = await geometry();

        const end = {
          left: { x: 24, y: 500 },
          top: { x: 140, y: 24 },
          right: { x: before.viewport.width - 24, y: 500 },
          bottom: { x: 640, y: before.viewport.height - 24 },
        }[edge];

        const start = { x: Math.round(before.x + 8), y: Math.round(before.y + 8) };
        web.sendInputEvent({ type: "mouseMove", ...start });
        web.sendInputEvent({ type: "mouseDown", ...start, button: "left", clickCount: 1 });
        let previous = start;

        for (const destination of [{ x: 640, y: 500 }, end]) {
          const from = previous;

          for (let step = 1; step <= 18; step++) {
            const point = { x: Math.round(from.x + (destination.x - from.x) * step / 18), y: Math.round(from.y + (destination.y - from.y) * step / 18) };
            web.sendInputEvent({ type: "mouseMove", ...point, button: "left", movementX: point.x - previous.x, movementY: point.y - previous.y });
            previous = point;
            await pause(16);
          }
        }

        web.sendInputEvent({ type: "mouseUp", ...end, button: "left", clickCount: 1 });
        await pause(550);
        const after = await geometry();
        assert.equal(after.edge, edge, `${topology} ${edge}`);
        assert.equal(after.orientation, edge === "left" || edge === "right" ? "vertical" : "horizontal");

        if (topology === "controls") assert(!(after.x < 90 && after.y < 42 && after.x + after.width > 0), "native controls remain clear");

        if (edge === "left") assert(Math.abs(after.x - 16) <= 2, "left docking uses available renderer edge");

        if (edge === "top" && topology !== "controls") assert(Math.abs(after.y - 16) <= 2, "no unnecessary framed/hidden titlebar exclusion");
        evidence.push({ topology, edge, after });
        writeFileSync(path.join(output, `${topology}-${edge}.png`), (await web.capturePage()).toPNG());
      }
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
