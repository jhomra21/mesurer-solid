export const MESURER_RECORDING_SOURCE_CHANNEL = "mesurer:recording-source";

export function installMesurerRecordingHost(options) {
  const ipcMain = options?.ipcMain;

  if (!ipcMain?.handle || !ipcMain?.removeHandler) {
    throw new Error("installMesurerRecordingHost requires Electron ipcMain.");
  }

  if (!(options?.validateSender instanceof Function)) {
    throw new Error("installMesurerRecordingHost requires validateSender(event).");
  }

  const configuredChannel = options.channel?.constructor === String
    ? options.channel.trim()
    : "";

  const channel = configuredChannel || MESURER_RECORDING_SOURCE_CHANNEL;
  let disposed = false;

  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event) => {
    if (disposed) throw new Error("Mesurer Recording host is disposed.");

    if (event.senderFrame?.parent) {
      throw new Error("Mesurer Recording host accepts requests only from the main frame.");
    }

    if (!(await options.validateSender(event))) {
      throw new Error("Mesurer Recording host rejected the renderer.");
    }

    const sender = event.sender;

    if (!sender || sender.isDestroyed?.()) {
      throw new Error("Mesurer Recording capture requested without live WebContents.");
    }

    if (!(sender.getMediaSourceId instanceof Function)) {
      throw new Error("This Electron version does not support WebContents recording capture.");
    }

    const streamId = sender.getMediaSourceId(sender);

    if (!streamId) {
      throw new Error("Electron returned no Recording media source id.");
    }

    return { streamId };
  });

  return {
    channel,
    dispose() {
      if (disposed) return;
      disposed = true;
      ipcMain.removeHandler(channel);
    },
  };
}
