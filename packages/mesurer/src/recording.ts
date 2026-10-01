import {
  MESURER_RECORDING_PLUGIN_ID as rendererPluginId,
  MESURER_RECORDING_SERVICE_ID as rendererServiceId,
  MESURER_RECORDING_SETTINGS_STATE_ID as rendererSettingsStateId,
  recordingPlugin as rendererRecordingPlugin,
} from "@jhomra21/mesurer-solid-renderer";
import type { MesurerPlugin } from "./core";
import { MESURER_VERSION } from "./version";

export type RecordingExportFormat = "webm" | "mp4";

export type RecordingQuality = "low" | "medium" | "high";

export type RecordingScale = 1 | 2 | 3;

export type RecordingRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type RecordingExportOptions = {
  format?: RecordingExportFormat;
  startTime?: number;
  endTime?: number;
  scale?: RecordingScale;
  quality?: RecordingQuality;
};

export type MesurerRecordingStatus =
  | "idle"
  | "selecting"
  | "recording"
  | "ready"
  | "exporting"
  | "error";

export type MesurerRecordingSettings = {
  toolEnabled: boolean;
};

export type MesurerRecordingSnapshot = {
  status: MesurerRecordingStatus;
  elapsed: number;
  rect: RecordingRect | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  error: string | null;
};

export type MesurerRecordingAsset = {
  blob: Blob;
  format: "webm";
  duration: number;
  width: number;
  height: number;
  createdAt: number;
};

export type MesurerRecordingExportResult = {
  blob: Blob;
  filename: string;
  format: RecordingExportFormat;
  duration: number;
  width: number;
  height: number;
};

export type MesurerRecordingPluginOptions = {
  toolEnabled?: boolean;
  frameRate?: number;
  maxDurationSeconds?: number;
  quality?: RecordingQuality;
};

export type MesurerRecordingService = {
  snapshot(): MesurerRecordingSnapshot;
  subscribe(listener: (snapshot: MesurerRecordingSnapshot) => void): () => void;
  formats(): Promise<RecordingExportFormat[]>;
  start(rect?: RecordingRect): Promise<void>;
  stop(): Promise<MesurerRecordingAsset>;
  cancel(): Promise<void>;
  discard(): void;
  export(options?: RecordingExportOptions): Promise<MesurerRecordingExportResult>;
};

export const MESURER_RECORDING_PLUGIN_ID: string = rendererPluginId;

export const MESURER_RECORDING_SERVICE_ID: string = rendererServiceId;

export const MESURER_RECORDING_SETTINGS_STATE_ID: string = rendererSettingsStateId;

/**
 * Create selected-region video recording with MediaBunny-owned encoding,
 * inspection, trimming, resizing, and WebM/MP4 export.
 */
export const recording = (
  options: MesurerRecordingPluginOptions = {},
): MesurerPlugin => ({
  ...rendererRecordingPlugin(options),
  version: MESURER_VERSION,
});
