export const MESURER_RECORDING_BRIDGE_CHANNEL = "mesurer:recording-bridge";

export function createMesurerRecordingPreloadBridge(
  ipcRenderer,
  options = {},
) {
  if (!ipcRenderer?.invoke) {
    throw new Error("createMesurerRecordingPreloadBridge requires Electron ipcRenderer.");
  }

  const configuredChannel = options.channel?.constructor === String
    ? options.channel.trim()
    : "";

  const channel = configuredChannel || MESURER_RECORDING_BRIDGE_CHANNEL;

  return () => ipcRenderer.invoke(channel);
}
