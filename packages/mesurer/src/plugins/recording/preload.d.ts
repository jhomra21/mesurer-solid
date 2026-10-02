export type MesurerRecordingPreloadOptions = {
  channel?: string;
};

export type MesurerRecordingIpcRenderer = {
  invoke(
    channel: string,
  ): Promise<{ streamId: string }>;
};

export const MESURER_RECORDING_SOURCE_CHANNEL: "mesurer:recording-source";

export function createMesurerRecordingPreloadBridge(
  ipcRenderer: MesurerRecordingIpcRenderer,
  options?: MesurerRecordingPreloadOptions,
): () => Promise<{ streamId: string }>;
