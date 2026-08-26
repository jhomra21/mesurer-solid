import { render } from "@solidjs/web";
import {
  Measurer as RendererMeasurer,
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
  type MeasurerProps as RendererMeasurerProps,
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
  setErrorHandler?: (handler: ((error: unknown) => void) | undefined) => void;
};

export type AgentBridgeOptions = { globalName?: string; root?: ParentNode };
export type MesurerOptions = {
  highlightColor?: string;
  guideColor?: string;
  hoverHighlightEnabled?: boolean;
  persistOnReload?: boolean;
  persistKey?: string;
  persistence?: MesurerPersistence;
  onPersistenceError?: (error: unknown) => void;
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
  onPluginError?: (error: unknown, pluginId: string) => void;
};
export type MountMeasurerOptions = MesurerOptions & {
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
    annotations: boolean;
    review: boolean;
    capturePlan: boolean;
    screenshots: boolean;
    send: boolean;
  };
};
export type MesurerContextHarness = {
  capabilities(): MesurerAgentCapabilities;
  context(request?: MesurerContextRequest): Promise<MesurerContextV1>;
  contextText(request?: MesurerContextRequest): Promise<string>;
  annotations(): Promise<MesurerAnnotation[]>;
  review(annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]>;
  capturePlan(request?: MesurerContextRequest): Promise<MesurerCapturePlanV1>;
  prepareCapture(): Promise<void>;
  finishCapture(): Promise<void>;
  sendContext(request?: MesurerContextRequest): Promise<void>;
};
export type MesurerBrowserAgent = MesurerAgentHarness & MesurerContextHarness;
export type MountedMeasurer = {
  element: HTMLDivElement;
  root: HTMLDivElement | ShadowRoot;
  readonly hostLayer: MesurerHostLayerMode;
  readonly pluginHost: MesurerPluginHost | undefined;
  readonly ready: Promise<void>;
  readonly agent: MesurerBrowserAgent;
  context(request?: MesurerContextRequest): Promise<MesurerContextV1>;
  contextText(request?: MesurerContextRequest): Promise<string>;
  copyContext(request?: MesurerContextRequest): Promise<void>;
  annotations(): Promise<MesurerAnnotation[]>;
  review(annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]>;
  capturePlan(request?: MesurerContextRequest): Promise<MesurerCapturePlanV1>;
  prepareCapture(): Promise<void>;
  finishCapture(): Promise<void>;
  sendContext(request?: MesurerContextRequest): Promise<void>;
  bringToFront(): void;
  describe(): MesurerPluginDescription | undefined;
  dispose(): void;
};

export function mountMeasurer(options: MountMeasurerOptions = {}): MountedMeasurer {
  if (typeof document === "undefined") {
    throw new Error("mountMeasurer() requires a browser or Electron renderer document.");
  }

  const {
    target = document.body,
    isolate = true,
    shadowMode = "open",
    topLayer = true,
    agent: agentOption = false,
    onPluginHost,
    onPluginsReady,
    ...measurerProps
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
  const annotations = async () => (await getContextService()).annotations();
  const review = async (annotationId?: string) => (await getContextService()).review(annotationId);
  const capturePlan = async (request?: MesurerContextRequest) => (await getContextService()).capturePlan(request);
  const prepareCapture = async () => (await getContextService()).prepareCapture();
  const finishCapture = async () => (await getContextService()).finishCapture();
  const sendContext = async (request?: MesurerContextRequest) => (await getContextService()).sendContext(request);
  const capabilities = (): MesurerAgentCapabilities => {
    const service = pluginHost?.service.get<MesurerContextService>(MESURER_CONTEXT_SERVICE_ID);
    const available = Boolean(service);
    return {
      protocol: "mesurer.agent/v1",
      contextSchema: "mesurer.context/v1",
      capabilities: {
        context: available,
        annotations: available,
        review: available,
        capturePlan: available,
        screenshots: service?.screenshots ?? false,
        send: service?.send ?? false,
      },
    };
  };
  const agent = Object.assign(baseAgent, {
    capabilities,
    context,
    contextText,
    annotations,
    review,
    capturePlan,
    prepareCapture,
    finishCapture,
    sendContext,
  }) as MesurerBrowserAgent;

  const rendererProps = measurerProps as RendererMeasurerProps;
  const disposeRender = render(
    () => (
      <RendererMeasurer
        {...rendererProps}
        portalTarget={portalTarget}
        pageTarget={target}
        onPluginHost={(host) => {
          const publicHost = host as unknown as MesurerPluginHost;
          if (!pluginHost) resolvePluginHost(publicHost);
          pluginHost = publicHost;
          onPluginHost?.(publicHost);
        }}
        onPluginsReady={(host) => {
          const publicHost = host as unknown as MesurerPluginHost;
          pluginHost = publicHost;
          if (!pluginsReadyResolved) {
            pluginsReadyResolved = true;
            resolvePluginsReady(publicHost);
          }
          onPluginsReady?.(publicHost);
        }}
      />
    ),
    mount,
  );

  const ready = agent.ready();
  let restoreAgentGlobal: (() => void) | null = null;
  if (agentConfig) {
    const globalName = agentConfig.globalName ?? "__MESURER__";
    const globalRecord = ownerWindow as unknown as Record<string, unknown>;
    const hadPrevious = Object.prototype.hasOwnProperty.call(globalRecord, globalName);
    const previous = globalRecord[globalName];
    globalRecord[globalName] = agent;
    restoreAgentGlobal = () => {
      if (globalRecord[globalName] !== agent) return;
      if (hadPrevious) globalRecord[globalName] = previous;
      else delete globalRecord[globalName];
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
    annotations,
    review,
    capturePlan,
    prepareCapture,
    finishCapture,
    sendContext,
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

export { createMesurerAgentHarness } from "./agent";
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
  toAcpContentBlocks,
} from "./context";
export type {
  AcpImageContentBlock,
  AcpTextContentBlock,
  MesurerAcpContentBlock,
  MesurerAnnotation,
  MesurerAnnotationBaseline,
  MesurerAnnotationTarget,
  MesurerCapturePlanV1,
  MesurerContextDelivery,
  MesurerContextDistance,
  MesurerContextEdges,
  MesurerContextGuide,
  MesurerContextMeasurement,
  MesurerContextRect,
  MesurerContextRequest,
  MesurerContextSender,
  MesurerContextTarget,
  MesurerContextV1,
  MesurerElementFingerprint,
  MesurerElementInspection,
  MesurerEvidenceImage,
  MesurerEvidenceProvider,
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

export const selectPlugin = rendererSelectPlugin as unknown as () => MesurerPlugin;
export const xrayPlugin = rendererXrayPlugin as unknown as () => MesurerPlugin;
export const colorPickerPlugin = rendererColorPickerPlugin as unknown as () => MesurerPlugin;
export const rulersPlugin = rendererRulersPlugin as unknown as () => MesurerPlugin;
export const textInspectorPlugin = rendererTextInspectorPlugin as unknown as () => MesurerPlugin;
export const guidesPlugin = rendererGuidesPlugin as unknown as () => MesurerPlugin;
export const distancePlugin = rendererDistancePlugin as unknown as () => MesurerPlugin;
export const settingsPlugin = rendererSettingsPlugin as unknown as () => MesurerPlugin;
export const defaultMesurerPlugins = rendererDefaultMesurerPlugins as unknown as () => MesurerPlugin[];
export const composeMesurerPlugins = rendererComposeMesurerPlugins as unknown as (
  plugins?: MesurerPlugin[],
  exclude?: MesurerBuiltinPluginId[],
) => MesurerPlugin[];