const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronMesurer", {
  captureWindow: () => ipcRenderer.invoke("mesurer:capture-window"),
  complete: (payload) => ipcRenderer.invoke("mesurer:test-complete", payload),
});
