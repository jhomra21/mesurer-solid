export const MESURER_CODEX_BRIDGE_CHANNEL = "mesurer:codex-bridge";

export function createMesurerCodexPreloadBridge(
  ipcRenderer,
  options = {},
) {
  if (!ipcRenderer?.invoke) {
    throw new Error("createMesurerCodexPreloadBridge requires Electron ipcRenderer.");
  }

  const configuredChannel = options.channel?.constructor === String
    ? options.channel.trim()
    : "";

  const channel = configuredChannel || MESURER_CODEX_BRIDGE_CHANNEL;

  return (request) => ipcRenderer.invoke(channel, request);
}
