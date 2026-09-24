import {
  colorPickerPlugin as rendererColorPickerPlugin,
  composeMesurerPlugins as rendererComposeMesurerPlugins,
  defaultMesurerPlugins as rendererDefaultMesurerPlugins,
  distancePlugin as rendererDistancePlugin,
  guidesPlugin as rendererGuidesPlugin,
  rulersPlugin as rendererRulersPlugin,
  selectPlugin as rendererSelectPlugin,
  settingsPlugin as rendererSettingsPlugin,
  textInspectorPlugin as rendererTextInspectorPlugin,
  xrayPlugin as rendererXrayPlugin,
} from "@jhomra21/mesurer-solid-renderer";
import { arrange } from "./arrange";
import { codex } from "./codex-plugin";
import { context } from "./context-plugin";
import { layoutGuides } from "./layout-guides";
import type { MesurerPlugin } from "./core";
import { screenshot } from "./screenshot";
import { MESURER_VERSION } from "./version";

const withPackageVersion = (plugin: MesurerPlugin): MesurerPlugin => ({
  ...plugin,
  version: MESURER_VERSION,
});

export const select = (): MesurerPlugin => withPackageVersion(rendererSelectPlugin());

export const xray = (): MesurerPlugin => withPackageVersion(rendererXrayPlugin());

export const colorPicker = (): MesurerPlugin => withPackageVersion(rendererColorPickerPlugin());

export const rulers = (): MesurerPlugin => withPackageVersion(rendererRulersPlugin());

export const typography = (): MesurerPlugin => withPackageVersion(rendererTextInspectorPlugin());

export const guides = (): MesurerPlugin => withPackageVersion(rendererGuidesPlugin());

export const distance = (): MesurerPlugin => withPackageVersion(rendererDistancePlugin());

export const settings = (): MesurerPlugin => withPackageVersion(rendererSettingsPlugin());

export const defaults = (): MesurerPlugin[] => rendererDefaultMesurerPlugins().map(withPackageVersion);

export const compose = (
  plugins: MesurerPlugin[] = [],
  exclude: Array<"select" | "xray" | "color-picker" | "rulers" | "text-inspector" | "guides" | "distance" | "settings"> = [],
): MesurerPlugin[] => rendererComposeMesurerPlugins(plugins, exclude).map((plugin) =>
  plugin.id.startsWith("mesurer.") ? withPackageVersion(plugin) : plugin,
);

export { arrange, codex, context, layoutGuides, screenshot };

export {
  MESURER_ARRANGE_ACTIVE_STATE_ID,
  MESURER_ARRANGE_PLUGIN_ID,
  MESURER_ARRANGE_SERVICE_ID,
  MESURER_ARRANGE_SETTINGS_STATE_ID,
  MESURER_ARRANGE_STATE_ID,
} from "./arrange";

export type {
  ArrangeCapturePlan,
  ArrangeElementFingerprint,
  ArrangeIntent,
  ArrangeOffset,
  ArrangePresentation,
  ArrangeRect,
  ArrangeReview,
  ArrangeReviewTarget,
  ArrangeTarget,
  MesurerArrangeService,
  MesurerArrangeSettings,
} from "./arrange";

export {
  MESURER_CODEX_PLUGIN_ID,
  MESURER_CODEX_SERVICE_ID,
} from "./codex-plugin";

export type {
  MesurerCodexDelivery,
  MesurerCodexDeliveryStatus,
  MesurerCodexHealth,
  MesurerCodexPluginOptions,
  MesurerCodexQueueRequest,
  MesurerCodexQueueResult,
  MesurerCodexSendRequest,
  MesurerCodexSendResult,
  MesurerCodexService,
  MesurerCodexThread,
  MesurerCodexThreadList,
  MesurerCodexThreadListOptions,
} from "./codex-plugin";

export {
  MESURER_CONTEXT_PLUGIN_ID,
  MESURER_CONTEXT_SERVICE_ID,
  MESURER_CONTEXT_SETTINGS_STATE_ID,
} from "./context-plugin";

export type {
  MesurerContextPluginOptions,
  MesurerContextService,
} from "./context-plugin";

export {
  MESURER_LAYOUT_GUIDES_ACTIVE_STATE_ID,
  MESURER_LAYOUT_GUIDES_PLUGIN_ID,
  MESURER_LAYOUT_GUIDES_SERVICE_ID,
  MESURER_LAYOUT_GUIDES_STATE_ID,
} from "./layout-guides";

export type {
  LayoutGuide,
  LayoutGuideAlign,
  LayoutGuideInput,
  LayoutGuideKind,
  MesurerLayoutGuidesService,
} from "./layout-guides";

export {
  MESURER_SCREENSHOT_ACTIVE_STATE_ID,
  MESURER_SCREENSHOT_PLUGIN_ID,
  MESURER_SCREENSHOT_SERVICE_ID,
  MESURER_SCREENSHOT_SETTINGS_STATE_ID,
  MIN_SCREENSHOT_SELECTION,
  captureVisibleTabPng,
  copyPngToClipboard,
  createScreenshotFilename,
  cropPngToViewportRect,
  normalizeScreenshotRect,
  prepareScreenshotCapture,
  releaseScreenshotCapture,
  waitForNextPaint,
} from "./screenshot";

export type {
  MesurerScreenshotPluginOptions,
  MesurerScreenshotResult,
  MesurerScreenshotService,
  MesurerScreenshotSettings,
  ScreenshotCaptureContext,
  ScreenshotCaptureProvider,
  ScreenshotRect,
} from "./screenshot";
