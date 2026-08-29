export { default as Mesurer } from "./ComposableMesurer";
export type { MesurerProps, MesurerSolidRuntimeService } from "./ComposableMesurer";
export { ContextActions } from "./components/ContextActions";
export type { ContextActionsController, ContextActionsProps } from "./components/ContextActions";
export { createMesurerWorkspaceRuntime } from "./runtime/workspace-context";
export type {
  MesurerAnnotation,
  MesurerAnnotationBaseline,
  MesurerAnnotationTarget,
  MesurerContextRequest,
  MesurerResolvedAnnotation,
  MesurerWorkspaceRuntime,
  MesurerWorkspaceSnapshot,
} from "./runtime/workspace-context";
export {
  colorPickerPlugin,
  composeMesurerPlugins,
  defaultMesurerPlugins,
  distancePlugin,
  guidesPlugin,
  rulersPlugin,
  selectPlugin,
  settingsPlugin,
  textInspectorPlugin,
  xrayPlugin,
} from "./plugins/builtins";
export type { MesurerBuiltinPluginId } from "./plugins/builtins";
export {
  MESURER_ARRANGE_ACTIVE_STATE_ID,
  MESURER_ARRANGE_PLUGIN_ID,
  MESURER_ARRANGE_SERVICE_ID,
  MESURER_ARRANGE_STATE_ID,
  arrangePlugin,
} from "./plugins/arrange";
export type {
  ArrangeCapturePlan,
  ArrangeIntent,
  ArrangeOffset,
  ArrangePresentation,
  ArrangeRect,
  ArrangeReview,
  ArrangeReviewTarget,
  ArrangeTarget,
  MesurerArrangeService,
} from "./plugins/arrange";
export {
  MESURER_SCREENSHOT_ACTIVE_STATE_ID,
  MESURER_SCREENSHOT_PLUGIN_ID,
  MESURER_SCREENSHOT_SERVICE_ID,
  MESURER_SCREENSHOT_SETTINGS_STATE_ID,
  screenshotPlugin,
} from "./plugins/screenshot";
export type {
  MesurerScreenshotPluginOptions,
  MesurerScreenshotResult,
  MesurerScreenshotService,
  MesurerScreenshotSettings,
  ScreenshotCaptureContext,
  ScreenshotCaptureProvider,
  ScreenshotRect,
} from "./plugins/screenshot";
export {
  captureVisibleTabPng,
  copyPngToClipboard,
  createScreenshotFilename,
  cropPngToViewportRect,
  MIN_SCREENSHOT_SELECTION,
  normalizeScreenshotRect,
  prepareScreenshotCapture,
  releaseScreenshotCapture,
  waitForNextPaint,
} from "./core/screenshot";
export {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid-core";
export type {
  CommandHandler as MesurerCommandHandler,
  MesurerPlugin,
  MesurerPluginContext,
  MesurerPluginDescription,
  MesurerPluginHost,
  OverlayContribution,
  Registration as MesurerRegistration,
  SettingsContribution,
  StateSliceDefinition,
  ToolContribution,
} from "@jhomra21/mesurer-solid-core";
export {
  createTextInspector,
  TextInspector,
} from "./runtime/text-inspector";
export type {
  TextInspectorAPI,
  TextInspectorOptions,
} from "./runtime/text-inspector";
export type {
  TypographyInfo,
  TypographyRow,
} from "./runtime/text-inspector-typography";
export type { ColorPickerFormat, ColorSample } from "./core/colors";
export {
  createLocalStoragePersistence,
  MESURER_STORAGE_VERSION,
  normalizeStoredSettings,
  normalizeStoredWorkspace,
} from "./core/persistence";
export type {
  MesurerPersistence,
  MesurerPersistenceSnapshot,
  MesurerStoredSettings,
  MesurerStoredWorkspace,
  LinePattern,
  LineStyle,
  GuidePattern,
  GuideStyle,
  SelectionSpacingStyle,
  RulerSettings,
} from "./core/persistence";