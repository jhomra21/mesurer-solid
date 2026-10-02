"use strict";

const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");

const path = require("node:path");

const { app, ipcMain, session } = require("electron");

const MESURER_ELECTRON_RECORDING_CHANNEL = "mesurer:electron-recording-source";

const MESURER_ELECTRON_RECORDING_PRELOAD_ID = "mesurer-recording";

const MESURER_ELECTRON_BOOTSTRAP_KEY = Symbol.for("mesurer.electron.bootstrap");

const EMBEDDED_PRELOAD = `"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const MESURER_ELECTRON_RECORDING_CHANNEL = "mesurer:electron-recording-source";

if (process.isMainFrame) {
  const recordingHost = {
    captureRecordingStream: () => ipcRenderer.invoke(MESURER_ELECTRON_RECORDING_CHANNEL),
  };

  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld("__MESURER_RECORDING_HOST__", recordingHost);
  } else {
    globalThis.__MESURER_RECORDING_HOST__ = recordingHost;
  }
}
`;

const packagedPreloadPath = () => {
  try {
    const packageJsonRequest = ["mesurer-solid", "package.json"].join("/");
    const packageJsonPath = require.resolve(packageJsonRequest);

    const candidate = path.join(
      path.dirname(packageJsonPath),
      "plugins",
      "recording",
      "auto-preload.cjs",
    );

    if (existsSync(candidate)) return candidate;
  } catch {
    // Bundled main processes may not retain the package directory at runtime.
  }

  return null;
};

const materializedPreloadPath = () => {
  const directory = path.join(app.getPath("userData"), ".mesurer");
  const filePath = path.join(directory, "recording-preload.cjs");

  mkdirSync(directory, { recursive: true });

  let current = "";

  try {
    current = readFileSync(filePath, "utf8");
  } catch {
    // First install or a cleaned application profile.
  }

  if (current !== EMBEDDED_PRELOAD) {
    writeFileSync(filePath, EMBEDDED_PRELOAD, "utf8");
  }

  return filePath;
};

const preloadPath = () => packagedPreloadPath() ?? materializedPreloadPath();

const installMesurerElectron = () => {
  const existing = globalThis[MESURER_ELECTRON_BOOTSTRAP_KEY];

  if (existing && existing.disposed !== true) return existing;

  let disposed = false;
  const registrations = new Map();

  const registerSession = (electronSession) => {
    if (disposed || !electronSession || registrations.has(electronSession)) return;

    const filePath = preloadPath();

    if (electronSession.registerPreloadScript instanceof Function) {
      const id = electronSession.registerPreloadScript({
        type: "frame",
        id: MESURER_ELECTRON_RECORDING_PRELOAD_ID,
        filePath,
      });

      registrations.set(electronSession, { kind: "registered", id });

      return;
    }

    if (
      electronSession.setPreloads instanceof Function
      && electronSession.getPreloads instanceof Function
    ) {
      const previous = electronSession.getPreloads();
      electronSession.setPreloads([...new Set([...previous, filePath])]);
      registrations.set(electronSession, { kind: "legacy", previous });

      return;
    }

    throw new Error(
      "This Electron version cannot register the Mesurer Recording preload.",
    );
  };

  const unregisterSessions = () => {
    for (const [electronSession, registration] of registrations) {
      try {
        if (
          registration.kind === "registered"
          && electronSession.unregisterPreloadScript instanceof Function
        ) {
          electronSession.unregisterPreloadScript(registration.id);
        } else if (
          registration.kind === "legacy"
          && electronSession.setPreloads instanceof Function
        ) {
          electronSession.setPreloads(registration.previous);
        }
      } catch {
        // Electron may already be tearing the session down during app quit.
      }
    }

    registrations.clear();
  };

  ipcMain.removeHandler(MESURER_ELECTRON_RECORDING_CHANNEL);
  ipcMain.handle(MESURER_ELECTRON_RECORDING_CHANNEL, async (event) => {
    if (disposed) throw new Error("Mesurer Electron Recording is disposed.");

    if (event.senderFrame?.parent) {
      throw new Error(
        "Mesurer Electron Recording accepts requests only from the main frame.",
      );
    }

    const sender = event.sender;

    if (!sender || sender.isDestroyed?.()) {
      throw new Error(
        "Mesurer Electron Recording capture requested without live WebContents.",
      );
    }

    if (!(sender.getMediaSourceId instanceof Function)) {
      throw new Error(
        "This Electron version does not support WebContents recording capture.",
      );
    }

    const streamId = sender.getMediaSourceId(sender);

    if (!streamId) {
      throw new Error("Electron returned no Mesurer Recording media source id.");
    }

    return { streamId };
  });

  const onSessionCreated = (electronSession) => {
    try {
      registerSession(electronSession);
    } catch (error) {
      console.error("[mesurer-solid/electron] Could not register Recording preload.", error);
    }
  };

  app.on("session-created", onSessionCreated);

  const ready = app.whenReady().then(() => {
    if (disposed) return;
    registerSession(session.defaultSession);
  });

  const bootstrap = {
    get disposed() {
      return disposed;
    },
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      app.removeListener("session-created", onSessionCreated);
      unregisterSessions();
      ipcMain.removeHandler(MESURER_ELECTRON_RECORDING_CHANNEL);

      if (globalThis[MESURER_ELECTRON_BOOTSTRAP_KEY] === bootstrap) {
        delete globalThis[MESURER_ELECTRON_BOOTSTRAP_KEY];
      }
    },
  };

  globalThis[MESURER_ELECTRON_BOOTSTRAP_KEY] = bootstrap;

  return bootstrap;
};

const mesurerElectron = installMesurerElectron();

module.exports = {
  installMesurerElectron,
  mesurerElectron,
};
