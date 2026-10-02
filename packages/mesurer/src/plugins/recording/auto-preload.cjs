"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const MESURER_ELECTRON_RECORDING_CHANNEL = "mesurer:electron-recording-source";

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("__MESURER_RECORDING_HOST__", {
    captureRecordingStream: () => ipcRenderer.invoke(MESURER_ELECTRON_RECORDING_CHANNEL),
  });
}
