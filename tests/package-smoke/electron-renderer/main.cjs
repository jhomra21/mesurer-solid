require("mesurer-solid/electron");

const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");

const { mkdirSync, writeFileSync } = require("node:fs");

const path = require("node:path");

const artifactDir = process.env.MESURER_ELECTRON_ARTIFACT_DIR
  ?? path.join(__dirname, "artifacts");

let mainWindow = null;

let codexHost = null;

let finished = false;

let timeoutId = null;

let captureCount = 0;


function writeResult(result) {
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    path.join(artifactDir, "result.json"),
    JSON.stringify(result, null, 2),
  );
}

function fail(error) {
  if (finished) return;
  finished = true;
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  writeResult({ ok: false, error: message });
  console.error(message);
  app.exit(1);
}

ipcMain.handle("mesurer:capture-window", async (event) => {
  captureCount += 1;
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed()) {
    throw new Error("Electron capture requested without a live BrowserWindow.");
  }

  const image = await window.webContents.capturePage(undefined, { stayHidden: true });
  const { width, height } = image.getSize();
  const png = image.toPNG();

  return {
    png: new Uint8Array(png.buffer, png.byteOffset, png.byteLength),
    width,
    height,
  };
});

ipcMain.handle("mesurer:click-at", async (event, payload) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed()) {
    throw new Error("Electron click requested without a live BrowserWindow.");
  }

  const x = Math.round(payload?.x);
  const y = Math.round(payload?.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Electron click received invalid coordinates.");
  }

  const webContents = window.webContents;

  window.show();
  window.focus();
  webContents.focus();

  await new Promise((resolve) => setTimeout(resolve, 50));

  webContents.sendInputEvent({ type: "mouseMove", x, y });
  webContents.sendInputEvent({
    type: "mouseDown",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  webContents.sendInputEvent({
    type: "mouseUp",
    x,
    y,
    button: "left",
    clickCount: 1,
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
});

// Physical double-clicks must originate from Electron, not dispatchEvent in
// the renderer. The second press carries clickCount=2 so Chromium synthesizes
// the real dblclick event consumed by the direct-text editor.
ipcMain.handle("mesurer:double-click-at", async (event, payload) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed()) {
    throw new Error("Electron double-click requested without a live BrowserWindow.");
  }

  const x = Math.round(payload?.x);
  const y = Math.round(payload?.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Electron double-click received invalid coordinates.");
  }

  window.show();
  window.focus();
  window.webContents.focus();

  await new Promise((resolve) => setTimeout(resolve, 50));

  for (const count of [1, 2]) {
    window.webContents.sendInputEvent({ type: "mouseMove", x, y });
    window.webContents.sendInputEvent({
      type: "mouseDown",
      x,
      y,
      button: "left",
      clickCount: count,
    });
    window.webContents.sendInputEvent({
      type: "mouseUp",
      x,
      y,
      button: "left",
      clickCount: count,
    });
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
});

ipcMain.handle("mesurer:require-native-select", () => {
  const required = process.env.MESURER_ELECTRON_REQUIRE_NATIVE_SELECT === "1";
  console.log(`Electron native Select strict input: ${required}`);

  return required;
});

ipcMain.handle("mesurer:press-key", async (event, value) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed()) {
    throw new Error("Electron keyboard input requested without a live BrowserWindow.");
  }

  if (!["Enter", "Escape"].includes(value)) {
    throw new Error("Electron contract received an unsupported key.");
  }

  window.webContents.sendInputEvent({ type: "keyDown", keyCode: value });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: value });
});

ipcMain.handle("mesurer:type-text", async (event, value) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed()) {
    throw new Error("Electron text input requires a live window.");
  }

  window.webContents.insertText(String(value ?? ""));
});

ipcMain.handle("mesurer:drag-toolbar", async (event, payload) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed()) {
    throw new Error("Electron toolbar drag requested without a live BrowserWindow.");
  }

  const start = payload?.start;
  const end = payload?.end;

  if (
    !Number.isFinite(start?.x)
    || !Number.isFinite(start?.y)
    || !Number.isFinite(end?.x)
    || !Number.isFinite(end?.y)
  ) {
    throw new Error("Electron toolbar drag received invalid coordinates.");
  }

  const webContents = window.webContents;
  const startX = Math.round(start.x);
  const startY = Math.round(start.y);
  const endX = Math.round(end.x);
  const endY = Math.round(end.y);

  webContents.sendInputEvent({ type: "mouseMove", x: startX, y: startY });
  webContents.sendInputEvent({
    type: "mouseDown",
    x: startX,
    y: startY,
    button: "left",
    clickCount: 1,
  });

  for (let step = 1; step <= 8; step += 1) {
    const progress = step / 8;

    webContents.sendInputEvent({
      type: "mouseMove",
      x: Math.round(startX + (endX - startX) * progress),
      y: Math.round(startY + (endY - startY) * progress),
      button: "left",
    });
  }

  webContents.sendInputEvent({
    type: "mouseUp",
    x: endX,
    y: endY,
    button: "left",
    clickCount: 1,
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
});

ipcMain.handle("mesurer:test-fail", async (_event, message) => {
  fail(new Error(String(message ?? "Electron renderer contract failed.")));
});

ipcMain.handle("mesurer:test-complete", async (_event, payload) => {
  if (finished) return;

  const png = Buffer.from(payload.png);
  const recording = Buffer.from(payload.recording);
  const image = nativeImage.createFromBuffer(png);
  const size = image.getSize();
  const summary = payload.summary ?? {};

  if (!png.byteLength || image.isEmpty()) {
    throw new Error("Mesurer Electron capture produced an empty PNG.");
  }

  if (!recording.byteLength) {
    throw new Error("Mesurer Electron Recording produced an empty WebM.");
  }

  const toolbarInitialRect = summary.toolbarInitialRect ?? {};
  const toolbarDraggedRect = summary.toolbarDraggedRect ?? {};

  const overlapsMacOSWindowControls = (rect) =>
    Number(rect.top) < 8
    || (Number(rect.top) < 48 && Number(rect.left) < 84);

  if (
    process.platform === "darwin"
    && (overlapsMacOSWindowControls(toolbarInitialRect) || overlapsMacOSWindowControls(toolbarDraggedRect))
  ) {
    throw new Error(`Mesurer toolbar overlaps the native macOS window controls: ${JSON.stringify({
      toolbarInitialRect,
      toolbarDraggedRect,
    })}`);
  }

  if (
    summary.targetCount !== 1
    || summary.islandCount !== 1
    || summary.mime !== "image/png"
    || summary.copied !== false
    || summary.downloaded !== false
    || summary.colorPickerMode !== "host"
    || !String(summary.colorPickerValue ?? "").includes("#123456")
    || summary.nativeEyeDropperOpens !== 0
    || summary.colorPickerOverlayRemoved !== true
    || summary.electronTextEditIntent !== "Edited in Electron"
    || summary.electronTextDoubleClicks < 1
    || !summary.nativeSelectModeSwitch
    || summary.nativeSelectModeSwitch.usedCommandFallback !== (
      /Linux/i.test(summary.nativeSelectModeSwitch.platform)
      && summary.nativeSelectModeSwitch.nativeReachedSelect === false
    )
    || summary.electronMotionPaused !== true
    || summary.electronMotionDetails !== true
    || summary.codexBridgeOk !== true
    || !["shared", "standalone", "desktop", "none"].includes(summary.codexRuntimeSource)
    || !["shared-app-server", "desktop-queue", "private-stdio", "none"].includes(summary.codexRuntimeTransport)
    || summary.recordingStatus !== "ready"
    || !(summary.recordingDuration > 0)
    || !(summary.recordingWidth > 0)
    || !(summary.recordingHeight > 0)
    || summary.recordingMime !== "video/webm"
    || summary.recordingBytes !== recording.byteLength
    || summary.recordingInteractionClicks !== 1
    || summary.recordingAutoHost !== true
    || summary.recordingFrameRateDefault !== 60
    || summary.recordingFrameRateSelected !== 120
    || summary.recordingSelectModeActive !== true
    || summary.recordingInteractionOverlayPointerEvents !== "none"
    || captureCount !== 2
  ) {
    throw new Error(`Unexpected Mesurer Electron result: ${JSON.stringify(summary)}`);
  }

  if (
    process.env.MESURER_ELECTRON_REQUIRE_NATIVE_SELECT === "1"
    && !summary.nativeSelectModeSwitch.nativeReachedSelect
  ) {
    throw new Error(`Native Select mode click did not reach the button: ${JSON.stringify(summary.nativeSelectModeSwitch)}`);
  }

  finished = true;

  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(path.join(artifactDir, "capture.png"), png);
  writeFileSync(path.join(artifactDir, "recording.webm"), recording);
  writeResult({
    ok: true,
    ...summary,
    pngBytes: png.byteLength,
    imageWidth: size.width,
    imageHeight: size.height,
    captureCount,
  });

  console.log(
    `Mesurer Electron renderer contract: PASS (${size.width}x${size.height}, ${png.byteLength} bytes)`,
  );
  console.log(`Native Select probe: ${JSON.stringify(summary.nativeSelectModeSwitch)}`);

  if (timeoutId) clearTimeout(timeoutId);
  setTimeout(() => app.quit(), 0);
});

if (process.env.MESURER_ELECTRON_USER_DATA_DIR) {
  mkdirSync(process.env.MESURER_ELECTRON_USER_DATA_DIR, { recursive: true });
  app.setPath("userData", process.env.MESURER_ELECTRON_USER_DATA_DIR);
}

app.whenReady().then(async () => {
  const { installMesurerCodexHost } = await import("mesurer-solid/plugins/codex/bridge");

  codexHost = installMesurerCodexHost({
    ipcMain,
    validateSender(event) {
      const window = BrowserWindow.fromWebContents(event.sender);

      return Boolean(window && !window.isDestroyed());
    },
  });

  app.once("before-quit", () => {
    codexHost?.dispose();
    codexHost = null;
  });

  const windowOptions = {
    show: true,
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload-bundled.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  };

  if (process.platform === "darwin") windowOptions.titleBarStyle = "hiddenInset";

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    fail(new Error(`Electron renderer exited: ${details.reason} (${details.exitCode})`));
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    fail(new Error(`Electron page failed to load: ${code} ${description}`));
  });

  timeoutId = setTimeout(() => {
    fail(new Error("Mesurer Electron renderer contract timed out."));
  }, 45_000);

  await mainWindow.loadFile(path.join(__dirname, "index.html"));
});

process.on("uncaughtException", fail);

process.on("unhandledRejection", fail);
