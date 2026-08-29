import { render } from "@solidjs/web";
import {
  Mesurer as RendererMesurer,
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
  type MesurerProps as RendererMesurerProps,
} from "@jhomra21/mesurer-solid-renderer";
import { createMesurerAgentHarness, type MesurerAgentHarness } from "./agent";
import type {
  MesurerAnnotation,
  MesurerCapturePlanV1,
  MesurerContextRequest,
  MesurerContextV1,
  MesurerReviewV1,
} from "./context";
import {
  MESURER_CONTEXT_SERVICE_ID,
  type MesurerContextService,
} from "./context-plugin";
import type { MesurerPlugin, MesurerPluginDescription, MesurerPluginHost } from "./core";
import { mountMesurerHost, type MesurerHostLayerMode } from "./host-layer";
import { MESURER_VERSION } from "./version";

export type ColorPickerFormat = "hex" | "rgb" | "hsl" | "oklch";
export type MesurerBuiltinPluginId = "select" | "xray" | "color-picker" | "rulers" | "text-inspector" | "guides" | "distance" | "settings";
export type LinePattern = "solid" | "dashed" | "dotted";
export type LineStyle = { opacity: number; width: number; pattern: LinePattern; dashLength: number; gap: number };
export type GuidePattern = LinePattern;
export type GuideStyle = LineStyle;
export type SelectionSpacingStyle = LineStyle & { enabled: boolean; color: string; diagonals: boolean };
export type RulerSettings = { opacity: number; edgeReveal: boolean };
export type MesurerRect = { left: number; top: number; width: number; height: number };
export type MesurerMeasurement = { id: string; rect: MesurerRect; normalizedRect: MesurerRect; deltaX: number; deltaY: number; snapped?: boolean };
export type MesurerGuide = { id: string; orientation: "vertical" | "horizontal"; position: number };
export type MesurerDistance = {
  id: string;
  rectA: MesurerRect;
  rectB: MesurerRect;
  normalizedRectA: MesurerRect;
  normalizedRectB: MesurerRect;
  horizontal: { x1: number; x2: number; y: number; value: number } | null;
  vertical: { y1: number; y2: number; x: number; value: number } | null;
  connectors: Array<{ x1: number; y1: number; x2: number; y2: number }>;
};
export type MesurerStoredSettings = {
  highlightColor?: string;
  guideColor?: string;
  hoverHighlightEnabled?: boolean;
  colorPickerFormats?: ColorPickerFormat[];
  colorPickerClickFormat?: ColorPickerFormat;
  snapEnabled?: boolean;
  snapGuidesEnabled?: boolean;
  selectNewGuideEnabled?: boolean;
  multiMeasureEnabled?: boolean;
  persistOnReload?: boolean;
  guideStyle?: Partial<GuideStyle>;
  selectionSpacingStyle?: Partial<SelectionSpacingStyle>;
  rulerSettings?: Partial<RulerSettings>;
};
export type MesurerStoredWorkspace = {
  enabled: boolean;
  xrayVisible: boolean;
  toolMode: "none" | "select" | "guides" | "text-inspector" | "xray" | "rulers";
  rulersVisible: boolean;
  guideOrientation: "vertical" | "horizontal";
  guides: MesurerGuide[];
  selectedGuideIds: string[];
  measurements: MesurerMeasurement[];
  activeMeasurement: MesurerMeasurement | null;
  heldDistances: MesurerDistance[];
};
export type MesurerPersistenceSnapshot = { settings: MesurerStoredSettings; workspace: MesurerStoredWorkspace | null };
export type MesurerPersistence = {
  load(): MesurerPersistenceSnapshot | null;
  saveSettings(settings: MesurerStoredSettings): void;
  saveWorkspace(workspace: MesurerStoredWorkspace): void;
  clearWorkspace(): void;
  clearSettings(): void;
  subscribe?: (listener: (snapshot: MesurerPersistenceSnapshot | null, source?: { settings?: boolean; workspace?: boolean }) => void) => () => void;
  setErrorHandler?: (handler: ((cause: unknown) => void) | undefined) => void;
};

export type AgentBridgeOptions = { globalName?: string; root?: Document | HTMLElement | ShadowRoot };
export type MesurerOptions = {
  highlightColor?: string;
  guideColor?: string;
  hoverHighlightEnabled?: boolean;
  persistOnReload?: boolean;
  persistKey?: string;
  persistence?: MesurerPersistence;
  onPersistenceError?: (cause: unknown) => void;
  colorPickerFormats?: ColorPickerFormat[];
  colorPickerClickFormat?: ColorPickerFormat;
  snapEnabled?: boolean;
  snapGuidesEnabled?: boolean;
  selectNewGuideEnabled?: boolean;
  multiMeasureEnabled?: boolean;
  guideStyle?: Partial<GuideStyle>;
  selectionSpacingStyle?: Partial<SelectionSpacingStyle>;
  rulerSettings?: Partial<RulerSettings>;
  plugins?: MesurerPlugin[];
  excludePlugins?: MesurerBuiltinPluginId[];
  pluginHost?: MesurerPluginHost;
  onPluginHost?: (host: MesurerPluginHost) => void;
  onPluginsReady?: (host: MesurerPluginHost) => void;
  onPluginError?: (cause: unknown, pluginId: string) => void;
};
export type MountMesurerOptions = MesurerOptions & {
  target?: HTMLElement | ShadowRoot;
  isolate?: boolean;
  shadowMode?: ShadowRootMode;
  topLayer?: boolean;
  agent?: boolean | AgentBridgeOptions;
};

export type MesurerAgentCapabilities = {
  protocol: "mesurer.agent/v1";
  contextSchema: "mesurer.context/v1";
  capabilities: {
    context: boolean;
    select: boolean;
    annotations: boolean;
    review: boolean;
    capturePlan: boolean;
  };
};
export type MesurerContextHarness = {
  capabilities(): MesurerAgentCapabilities;
  context(request?: MesurerContextRequest): Promise<MesurerContextV1>;
  contextText(request?: MesurerContextRequest): Promise<string>;
  select(selectors: string | string[]): Promise<MesurerContextV1>;
  annotations(): Promise<MesurerAnnotation[]>;
  review(annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]>;
  capturePlan(request?: MesurerContextRequest): Promise<MesurerCapturePlanV1>;
  prepareCapture(): Promise<void>;
  finishCapture(): Promise<void>;
};
export type MesurerBrowserAgent = MesurerAgentHarness & MesurerContextHarness;
export type MountedMesurer = {
  element: HTMLDivElement;
  root: HTMLDivElement | ShadowRoot;
  readonly hostLayer: MesurerHostLayerMode;
  readonly pluginHost: MesurerPluginHost | undefined;
  readonly ready: Promise<void>;
  readonly agent: MesurerBrowserAgent;
  context(request?: MesurerContextRequest): Promise<MesurerContextV1>;
  contextText(request?: MesurerContextRequest): Promise<string>;
  copyContext(request?: MesurerContextRequest): Promise<void>;
  select(selectors: string | string[]): Promise<MesurerContextV1>;
  annotations(): Promise<MesurerAnnotation[]>;
  review(annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]>;
  capturePlan(request?: MesurerContextRequest): Promise<MesurerCapturePlanV1>;
  prepareCapture(): Promise<void>;
  finishCapture(): Promise<void>;
  bringToFront(): void;
  describe(): MesurerPluginDescription | undefined;
  dispose(): void;
};

export function mountMesurer(options: MountMesurerOptions = {}): MountedMesurer {
  if (!("document" in globalThis)) {
    throw new Error("mountMesurer() requires a browser or Electron renderer document.");
  }

  const {
    target = document.body,
    isolate = true,
    shadowMode = "open",
    topLayer = true,
    agent: agentOption = false,
    onPluginHost,
    onPluginsReady,
    ...mesurerProps
  } = options;
  const ownerDocument = target.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView ?? window;
  const container = ownerDocument.createElement("div");
  container.dataset.mesurerIsland = "true";
  const hostLayer = mountMesurerHost(container, target, topLayer);

  let root: HTMLDivElement | ShadowRoot = container;
  let mount: HTMLDivElement = container;
  let portalTarget: HTMLElement | ShadowRoot = container;
  if (isolate) {
    const shadow = container.attachShadow({ mode: shadowMode });
    mount = ownerDocument.createElement("div");
    mount.dataset.mesurerIslandMount = "true";
    shadow.append(mount);
    root = shadow;
    portalTarget = shadow;
  }

  let pluginHost: MesurerPluginHost | undefined;
  let resolvePluginHost!: (host: MesurerPluginHost) => void;
  let resolvePluginsReady!: (host: MesurerPluginHost) => void;
  let pluginsReadyResolved = false;
  const pluginHostCreated = new Promise<MesurerPluginHost>((resolve) => {
    resolvePluginHost = resolve;
  });
  const pluginsReady = new Promise<MesurerPluginHost>((resolve) => {
    resolvePluginsReady = resolve;
  });
  const waitForPluginHost = async () => {
    await (pluginHost ? Promise.resolve(pluginHost) : pluginHostCreated);
    return pluginsReady;
  };

  const agentConfig: AgentBridgeOptions | null = agentOption === true
    ? {}
    : agentOption === false
      ? null
      : agentOption;
  const inspectionRoot = agentConfig?.root ?? (target.nodeType === 11 ? target : ownerDocument);
  const baseAgent = createMesurerAgentHarness({
    ownerDocument,
    root: inspectionRoot,
    getPluginHost: () => pluginHost,
    waitForPluginHost,
  });

  const getContextService = async () => {
    await baseAgent.ready();
    const service = pluginHost?.service.get<MesurerContextService>(MESURER_CONTEXT_SERVICE_ID);
    if (!service) {
      throw new Error("Mesurer context plugin is not loaded. Add contextPlugin() to the plugins array.");
    }
    return service;
  };
  const context = async (request?: MesurerContextRequest) => (await getContextService()).context(request);
  const contextText = async (request?: MesurerContextRequest) => (await getContextService()).contextText(request);
  const copyContext = async (request?: MesurerContextRequest) => (await getContextService()).copyContext(request);
  const select = async (selectors: string | string[]) => (await getContextService()).select(selectors);
  const annotations = async () => (await getContextService()).annotations();
  const review = async (annotationId?: string) => (await getContextService()).review(annotationId);
  const capturePlan = async (request?: MesurerContextRequest) => (await getContextService()).capturePlan(request);
  const prepareCapture = async () => (await getContextService()).prepareCapture();
  const finishCapture = async () => (await getContextService()).finishCapture();
  const capabilities = (): MesurerAgentCapabilities => {
    const available = Boolean(pluginHost?.service.get<MesurerContextService>(MESURER_CONTEXT_SERVICE_ID));
    return {
      protocol: "mesurer.agent/v1",
      contextSchema: "mesurer.context/v1",
      capabilities: {
        context: available,
        select: available,
        annotations: available,
        review: available,
        capturePlan: available,
      },
    };
  };
  const agent: MesurerBrowserAgent = Object.assign(baseAgent, {
    capabilities,
    context,
    contextText,
    select,
    annotations,
    review,
    capturePlan,
    prepareCapture,
    finishCapture,
  });

  const rendererProps: RendererMesurerProps = { ...mesurerProps, version: MESURER_VERSION };
  const disposeRender = render(
    () => (
      <RendererMesurer
        {...rendererProps}
        portalTarget={portalTarget}
        pageTarget={target}
        onPluginHost={(host) => {
          if (!pluginHost) resolvePluginHost(host);
          pluginHost = host;
          onPluginHost?.(host);
        }}
        onPluginsReady={(host) => {
          pluginHost = host;
          if (!pluginsReadyResolved) {
            pluginsReadyResolved = true;
            resolvePluginsReady(host);
          }
          onPluginsReady?.(host);
        }}
      />
    ),
    mount,
  );

  const ready = agent.ready();
  let restoreAgentGlobal: (() => void) | null = null;
  if (agentConfig) {
    const globalName = agentConfig.globalName ?? "__MESURER__";
    const previousDescriptor = Object.getOwnPropertyDescriptor(ownerWindow, globalName);
    Reflect.set(ownerWindow, globalName, agent);
    restoreAgentGlobal = () => {
      const currentDescriptor = Object.getOwnPropertyDescriptor(ownerWindow, globalName);
      if (currentDescriptor?.value !== agent) return;
      if (previousDescriptor) Object.defineProperty(ownerWindow, globalName, previousDescriptor);
      else Reflect.deleteProperty(ownerWindow, globalName);
    };
  }

  let disposed = false;
  return {
    element: container,
    root,
    hostLayer: hostLayer.mode,
    get pluginHost() {
      return pluginHost;
    },
    ready,
    agent,
    context,
    contextText,
    copyContext,
    select,
    annotations,
    review,
    capturePlan,
    prepareCapture,
    finishCapture,
    bringToFront: hostLayer.bringToFront,
    describe: () => pluginHost?.describe(),
    dispose() {
      if (disposed) return;
      disposed = true;
      restoreAgentGlobal?.();
      disposeRender();
      hostLayer.dispose();
      container.remove();
    },
  };
}

/** @deprecated Use `MountMesurerOptions`. */
export type MountMeasurerOptions = MountMesurerOptions;
/** @deprecated Use `MountedMesurer`. */
export type MountedMeasurer = MountedMesurer;
/** @deprecated Use `mountMesurer()`. */
export const mountMeasurer = mountMesurer;

export { createMesurerAgentHarness } from "./agent";
export { MESURER_VERSION } from "./version";
export type {
  AgentDistance,
  AgentEdges,
  AgentElementInspection,
  AgentFeedbackSnapshot,
  AgentRect,
  AgentViewportSnapshot,
  CreateMesurerAgentHarnessOptions,
  MesurerAgentHarness,
} from "./agent";
export {
  captureMesurerContext,
  copyTextToClipboard,
  createMesurerCapturePlan,
  formatMesurerContext,
  reviewMesurerAnnotation,
} from "./context";
export type {
  MesurerAnnotation,
  MesurerAnnotationBaseline,
  MesurerAnnotationTarget,
  MesurerCapturePlanV1,
  MesurerContextDistance,
  MesurerContextEdges,
  MesurerContextGuide,
  MesurerContextMeasurement,
  MesurerContextRect,
  MesurerContextRequest,
  MesurerContextTarget,
  MesurerContextV1,
  MesurerElementFingerprint,
  MesurerElementInspection,
  MesurerReviewChange,
  MesurerReviewMetricChange,
  MesurerReviewPresenceChange,
  MesurerReviewV1,
} from "./context";
export {
  contextPlugin,
  MESURER_CONTEXT_PLUGIN_ID,
  MESURER_CONTEXT_SERVICE_ID,
} from "./context-plugin";
export type {
  MesurerContextPluginOptions,
  MesurerContextService,
} from "./context-plugin";
export { createMesurerPluginHost, createMesurerRuntime, defineMesurerPlugin } from "./core";
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
} from "./core";
export type { MesurerHostLayerMode } from "./host-layer";

const withPackageVersion = (plugin: MesurerPlugin): MesurerPlugin => ({ ...plugin, version: MESURER_VERSION });
export const selectPlugin = (): MesurerPlugin => withPackageVersion(rendererSelectPlugin());
export const xrayPlugin = (): MesurerPlugin => withPackageVersion(rendererXrayPlugin());
export const colorPickerPlugin = (): MesurerPlugin => withPackageVersion(rendererColorPickerPlugin());
export const rulersPlugin = (): MesurerPlugin => withPackageVersion(rendererRulersPlugin());
export const textInspectorPlugin = (): MesurerPlugin => withPackageVersion(rendererTextInspectorPlugin());
export const guidesPlugin = (): MesurerPlugin => withPackageVersion(rendererGuidesPlugin());
export const distancePlugin = (): MesurerPlugin => withPackageVersion(rendererDistancePlugin());
export const settingsPlugin = (): MesurerPlugin => withPackageVersion(rendererSettingsPlugin());
export const defaultMesurerPlugins = (): MesurerPlugin[] => rendererDefaultMesurerPlugins().map(withPackageVersion);
export const composeMesurerPlugins = (
  plugins: MesurerPlugin[] = [],
  exclude: MesurerBuiltinPluginId[] = [],
): MesurerPlugin[] => rendererComposeMesurerPlugins(plugins, exclude).map((plugin) =>
  plugin.id.startsWith("mesurer.") ? withPackageVersion(plugin) : plugin,
);
