const { contextBridge, ipcRenderer } = require("electron");

const {
  createMesurerCodexPreloadBridge,
} = require("mesurer-solid/plugins/codex/preload");

contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  captureScreenshot: (request) => ipcRenderer.invoke("mesurer:capture-window", request),
  codexBridge: createMesurerCodexPreloadBridge(ipcRenderer),
});

contextBridge.exposeInMainWorld("electronMesurer", {
  complete: (payload) => ipcRenderer.invoke("mesurer:test-complete", payload),
  dragToolbar: (payload) => ipcRenderer.invoke("mesurer:drag-toolbar", payload),
  progress: (phase) => ipcRenderer.send("mesurer:test-progress", phase),
});
