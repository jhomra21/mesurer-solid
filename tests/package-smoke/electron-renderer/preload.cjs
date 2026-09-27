const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  captureScreenshot: () => ipcRenderer.invoke("mesurer:capture-window"),
  codexBridge: (request) => ipcRenderer.invoke("mesurer:codex-bridge", request),
});

contextBridge.exposeInMainWorld("electronMesurer", {
  complete: (payload) => ipcRenderer.invoke("mesurer:test-complete", payload),
  dragToolbar: (payload) => ipcRenderer.invoke("mesurer:drag-toolbar", payload),
});
