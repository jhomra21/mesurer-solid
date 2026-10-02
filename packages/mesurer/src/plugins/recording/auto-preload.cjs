"use strict";

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
