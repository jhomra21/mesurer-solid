export const MESURER_RECORDING_BRIDGE_CHANNEL = "mesurer:recording-bridge";

const errorMessage = (cause) =>
  cause instanceof Error ? cause.message : String(cause ?? "Unknown recording host error.");

export function installMesurerRecordingHost(options) {
  const ipcMain = options?.ipcMain;

  if (!ipcMain?.handle || !ipcMain?.removeHandler) {
    throw new Error("installMesurerRecordingHost requires Electron ipcMain.");
  }

  if (typeof options.validateSender !== "function") {
    throw new Error("installMesurerRecordingHost requires validateSender(event).");
  }

  const configuredChannel = options.channel?.constructor === String
    ? options.channel.trim()
    : "";

  const channel = configuredChannel || MESURER_RECORDING_BRIDGE_CHANNEL;

  ipcMain.handle(channel, async (event) => {
    if (event?.senderFrame?.parent) {
      return {
        ok: false,
        error: "Mesurer Recording host only accepts main-frame requests.",
      };
    }

    if (!(await options.validateSender(event))) {
      return {
        ok: false,
        error: "Mesurer Recording host rejected this renderer.",
      };
    }

    const sender = event?.sender;

    if (!sender?.getMediaSourceId) {
      return {
        ok: false,
        error: "This Electron version does not expose webContents.getMediaSourceId().",
      };
    }

    try {
      const streamId = sender.getMediaSourceId(sender);

      if (!streamId) {
        return {
          ok: false,
          error: "Electron did not return a recording stream id.",
        };
      }

      return {
        ok: true,
        streamId,
      };
    } catch (cause) {
      return {
        ok: false,
        error: errorMessage(cause),
      };
    }
  });

  return {
    channel,
    dispose() {
      ipcMain.removeHandler(channel);
    },
  };
}
