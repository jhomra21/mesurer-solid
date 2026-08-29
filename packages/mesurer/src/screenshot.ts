import {
  MESURER_SCREENSHOT_ACTIVE_STATE_ID as rendererActiveStateId,
  MESURER_SCREENSHOT_PLUGIN_ID as rendererPluginId,
  MESURER_SCREENSHOT_SERVICE_ID as rendererServiceId,
  MESURER_SCREENSHOT_SETTINGS_STATE_ID as rendererSettingsStateId,
  MIN_SCREENSHOT_SELECTION as rendererMinSelection,
  captureVisibleTabPng as rendererCaptureVisibleTabPng,
  copyPngToClipboard as rendererCopyPngToClipboard,
  createScreenshotFilename as rendererCreateScreenshotFilename,
  cropPngToViewportRect as rendererCropPngToViewportRect,
  normalizeScreenshotRect as rendererNormalizeScreenshotRect,
  prepareScreenshotCapture as rendererPrepareScreenshotCapture,
  releaseScreenshotCapture as rendererReleaseScreenshotCapture,
  screenshotPlugin as rendererScreenshotPlugin,
  waitForNextPaint as rendererWaitForNextPaint,
} from "@jhomra21/mesurer-solid-renderer";
import type { MesurerPlugin } from "./core";

export type ScreenshotRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ScreenshotCaptureContext = {
  ownerDocument: Document;
  ownerWindow: Window;
};

export type ScreenshotCaptureProvider = (
  context: ScreenshotCaptureContext,
) => Promise<Blob>;

export type MesurerScreenshotSettings = {
  toolEnabled: boolean;
  copy: boolean;
  download: boolean;
  includeMeasurements: boolean;
};

export type MesurerScreenshotResult = {
  blob: Blob;
  rect: ScreenshotRect;
  copied: boolean;
  downloaded: boolean;
};

export type MesurerScreenshotPluginOptions = Partial<MesurerScreenshotSettings> & {
  captureVisibleTab?: ScreenshotCaptureProvider;
  previewDurationMs?: number;
};

export type MesurerScreenshotService = {
  active(): boolean;
  settings(): MesurerScreenshotSettings;
  setSettings(patch: Partial<MesurerScreenshotSettings>): void;
  start(): Promise<void>;
  cancel(): void;
  capture(rect: ScreenshotRect): Promise<MesurerScreenshotResult>;
};

export const MESURER_SCREENSHOT_ACTIVE_STATE_ID: string = rendererActiveStateId;
export const MESURER_SCREENSHOT_PLUGIN_ID: string = rendererPluginId;
export const MESURER_SCREENSHOT_SERVICE_ID: string = rendererServiceId;
export const MESURER_SCREENSHOT_SETTINGS_STATE_ID: string = rendererSettingsStateId;
export const MIN_SCREENSHOT_SELECTION: number = rendererMinSelection;

export const captureVisibleTabPng: ScreenshotCaptureProvider = rendererCaptureVisibleTabPng;

export const copyPngToClipboard = (
  png: Blob | Promise<Blob>,
  ownerWindow: Window,
): Promise<void> => rendererCopyPngToClipboard(png, ownerWindow);

export const createScreenshotFilename = (now = new Date()): string =>
  rendererCreateScreenshotFilename(now);

export const cropPngToViewportRect = (
  blob: Blob,
  rect: ScreenshotRect,
  viewport: { width: number; height: number },
  ownerDocument: Document,
): Promise<Blob> => rendererCropPngToViewportRect(blob, rect, viewport, ownerDocument);

export const normalizeScreenshotRect = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  viewport: { width: number; height: number },
): ScreenshotRect => rendererNormalizeScreenshotRect(start, end, viewport);

export const prepareScreenshotCapture = (
  ownerDocument: Document,
  ownerWindow: Window,
): Promise<void> => rendererPrepareScreenshotCapture(ownerDocument, ownerWindow);

export const releaseScreenshotCapture = (ownerWindow: Window): void =>
  rendererReleaseScreenshotCapture(ownerWindow);

export const screenshotPlugin = (
  options: MesurerScreenshotPluginOptions = {},
): MesurerPlugin => rendererScreenshotPlugin(options);

export const waitForNextPaint = (ownerWindow: Window): Promise<void> =>
  rendererWaitForNextPaint(ownerWindow);