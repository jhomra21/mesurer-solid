const { contextBridge, ipcRenderer } = require("electron");

const {
  createMesurerCodexPreloadBridge,
} = require("mesurer-solid/plugins/codex/preload");

const {
  createMesurerRecordingPreloadBridge,
} = require("mesurer-solid/plugins/recording/preload");

contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  captureScreenshot: () => ipcRenderer.invoke("mesurer:capture-window"),
  captureRecordingStream: createMesurerRecordingPreloadBridge(ipcRenderer),
  codexBridge: createMesurerCodexPreloadBridge(ipcRenderer),
});

contextBridge.exposeInMainWorld("electronMesurer", {
  complete: (payload) => ipcRenderer.invoke("mesurer:test-complete", payload),
  progress: (payload) => ipcRenderer.invoke("mesurer:test-progress", payload),
  dragToolbar: (payload) => ipcRenderer.invoke("mesurer:drag-toolbar", payload),
});
