export type MesurerRecordingHostEvent = {
  sender: {
    id: number;
    isDestroyed?(): boolean;
    getMediaSourceId(requestWebContents: object): string;
  };
  senderFrame?: { parent?: object | null } | null;
};

export type MesurerRecordingHostOptions = {
  ipcMain: {
    handle(
      channel: string,
      listener: (
        event: MesurerRecordingHostEvent,
      ) => { streamId: string } | Promise<{ streamId: string }>,
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

export const MESURER_RECORDING_SOURCE_CHANNEL: "mesurer:recording-source";

export function installMesurerRecordingHost(
  options: MesurerRecordingHostOptions,
): MesurerRecordingHost;
