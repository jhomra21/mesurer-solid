"use strict";

const MESURER_RECORDING_BRIDGE_CHANNEL = "mesurer:recording-bridge";

const createMesurerRecordingPreloadBridge = (
  ipcRenderer,
  options = {},
) => {
  if (!ipcRenderer?.invoke) {
    throw new Error("createMesurerRecordingPreloadBridge requires Electron ipcRenderer.");
  }

  const configuredChannel = options.channel?.constructor === String
    ? options.channel.trim()
    : "";

  const channel = configuredChannel || MESURER_RECORDING_BRIDGE_CHANNEL;

  return () => ipcRenderer.invoke(channel);
};

module.exports = {
  MESURER_RECORDING_BRIDGE_CHANNEL,
  createMesurerRecordingPreloadBridge,
};
