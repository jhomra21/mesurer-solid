export const MESURER_RECORDING_SOURCE_CHANNEL = "mesurer:recording-source";

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

  const channel = configuredChannel || MESURER_RECORDING_SOURCE_CHANNEL;

  return () => ipcRenderer.invoke(channel);
}
