export type RecordingBridgeResponse =
  | {
      ok: true;
      streamId: string;
    }
  | {
      ok: false;
      error: string;
    };

export type MesurerRecordingHostEvent = {
  sender: {
    id: number;
    getMediaSourceId(requestWebContents: { id: number }): string;
  };
  senderFrame?: { parent?: object | null } | null;
};

export type MesurerRecordingHostOptions = {
  ipcMain: {
    handle(
      channel: string,
      listener: (
        event: MesurerRecordingHostEvent,
      ) => RecordingBridgeResponse | Promise<RecordingBridgeResponse>,
    ): void;
    removeHandler(channel: string): void;
  };
  channel?: string;
  validateSender(
    event: MesurerRecordingHostEvent,
  ): boolean | Promise<boolean>;
};

export type MesurerRecordingHost = {
  channel: string;
  dispose(): void;
};

export const MESURER_RECORDING_BRIDGE_CHANNEL: "mesurer:recording-bridge";

export function installMesurerRecordingHost(
  options: MesurerRecordingHostOptions,
): MesurerRecordingHost;
