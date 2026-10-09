const { contextBridge, ipcRenderer } = require("electron");

const {
  createMesurerCodexPreloadBridge,
} = require("mesurer-solid/plugins/codex/preload");

contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  captureScreenshot: () => ipcRenderer.invoke("mesurer:capture-window"),
  codexBridge: createMesurerCodexPreloadBridge(ipcRenderer),
});

contextBridge.exposeInMainWorld("electronMesurer", {
  complete: (payload) => ipcRenderer.invoke("mesurer:test-complete", payload),
  fail: (message) => ipcRenderer.invoke("mesurer:test-fail", message),
  dragToolbar: (payload) => ipcRenderer.invoke("mesurer:drag-toolbar", payload),
  clickAt: (payload) => ipcRenderer.invoke("mesurer:click-at", payload),
  doubleClickAt: (payload) => ipcRenderer.invoke("mesurer:double-click-at", payload),
  pressKey: (key) => ipcRenderer.invoke("mesurer:press-key", key),
  requireNativeSelect: () => ipcRenderer.invoke("mesurer:require-native-select"),
  typeText: (value) => ipcRenderer.invoke("mesurer:type-text", value),
});
