const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");

const { mkdirSync, writeFileSync } = require("node:fs");

const path = require("node:path");

const artifactDir = process.env.MESURER_ELECTRON_ARTIFACT_DIR
  ?? path.join(__dirname, "artifacts");

let mainWindow = null;

let finished = false;

let timeoutId = null;

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

ipcMain.handle("mesurer:test-complete", async (_event, payload) => {
  if (finished) return;

  const png = Buffer.from(payload.png);
  const image = nativeImage.createFromBuffer(png);
  const size = image.getSize();
  const summary = payload.summary ?? {};

  if (!png.byteLength || image.isEmpty()) {
    throw new Error("Mesurer Electron capture produced an empty PNG.");
  }

  if (
    summary.targetCount !== 1
    || summary.islandCount !== 1
    || summary.mime !== "image/png"
    || summary.copied !== false
    || summary.downloaded !== false
  ) {
    throw new Error(`Unexpected Mesurer Electron result: ${JSON.stringify(summary)}`);
  }

  finished = true;

  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(path.join(artifactDir, "capture.png"), png);
  writeResult({
    ok: true,
    ...summary,
    pngBytes: png.byteLength,
    imageWidth: size.width,
    imageHeight: size.height,
  });

  console.log(
    `Mesurer Electron renderer contract: PASS (${size.width}x${size.height}, ${png.byteLength} bytes)`,
  );

  if (timeoutId) clearTimeout(timeoutId);
  setTimeout(() => app.quit(), 0);
});

app.whenReady().then(async () => {
  mainWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    fail(new Error(`Electron renderer exited: ${details.reason} (${details.exitCode})`));
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    fail(new Error(`Electron page failed to load: ${code} ${description}`));
  });

  timeoutId = setTimeout(() => {
    fail(new Error("Mesurer Electron renderer contract timed out."));
  }, 30_000);

  await mainWindow.loadFile(path.join(__dirname, "index.html"));
});

process.on("uncaughtException", fail);

process.on("unhandledRejection", fail);
