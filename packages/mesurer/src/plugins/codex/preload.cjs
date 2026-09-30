"use strict";

const MESURER_CODEX_BRIDGE_CHANNEL = "mesurer:codex-bridge";

const createMesurerCodexPreloadBridge = (
  ipcRenderer,
  options = {},
) => {
  if (!ipcRenderer?.invoke) {
    throw new Error("createMesurerCodexPreloadBridge requires Electron ipcRenderer.");
  }

  const channel = typeof options.channel === "string" && options.channel.trim()
    ? options.channel.trim()
    : MESURER_CODEX_BRIDGE_CHANNEL;

  return (request) => ipcRenderer.invoke(channel, request);
};

module.exports = {
  MESURER_CODEX_BRIDGE_CHANNEL,
  createMesurerCodexPreloadBridge,
};
