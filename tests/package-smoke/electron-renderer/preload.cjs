const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  captureScreenshot: () => ipcRenderer.invoke("mesurer:capture-window"),
  startCodexBridge: () => ipcRenderer.invoke("mesurer:start-codex-bridge"),
});

contextBridge.exposeInMainWorld("electronMesurer", {
  complete: (payload) => ipcRenderer.invoke("mesurer:test-complete", payload),
  dragToolbar: (payload) => ipcRenderer.invoke("mesurer:drag-toolbar", payload),
});
