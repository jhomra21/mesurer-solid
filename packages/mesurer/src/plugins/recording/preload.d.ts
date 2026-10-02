import type { RecordingBridgeResponse } from "./bridge";

export type MesurerRecordingPreloadOptions = {
  channel?: string;
};

export type MesurerRecordingIpcRenderer = {
  invoke(
    channel: string,
  ): Promise<RecordingBridgeResponse>;
};

export const MESURER_RECORDING_BRIDGE_CHANNEL: "mesurer:recording-bridge";

export function createMesurerRecordingPreloadBridge(
  ipcRenderer: MesurerRecordingIpcRenderer,
  options?: MesurerRecordingPreloadOptions,
): () => Promise<RecordingBridgeResponse>;
