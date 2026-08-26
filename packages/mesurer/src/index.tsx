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
  let disposed = false;
  let contextService: MesurerContextService | null = null;
  const disposer = render(() => (
    <RendererMeasurer
      {...measurerProps as RendererMeasurerProps}
      portalTarget={portalTarget}
      pageTarget={target}
      onBuiltinController={(controller) => {
        pluginHost?.bindBuiltins(controller);
      }}
      pluginTools={pluginHost?.tools() ?? []}
      onPluginTool={(tool) => {
        void pluginHost?.runTool(tool.id);
      }}
    />
  ), mount);

  const selectedPlugins = rendererComposeMesurerPlugins({
    plugins: options.plugins,
    excludePlugins: options.excludePlugins,
  });
  const host = new rendererPluginHostAdapter({
    plugins: selectedPlugins,
    onError: options.onPluginError,
  });
  pluginHost = host;
  resolvePluginHost(host);
  onPluginHost?.(host);
  void host.initialize().then(() => {
    if (disposed) return;
    contextService = host.getService<MesurerContextService>(MESURER_CONTEXT_SERVICE_ID);
    pluginsReadyResolved = true;
    resolvePluginsReady(host);
    onPluginsReady?.(host);
  });

  const agent = createMesurerAgentHarness({
    root,
    ready: waitForPluginHost,
    context: () => contextService,
  });

  return {
    element: container,
    root,
    get hostLayer() { return hostLayer.mode; },
    get pluginHost() { return pluginHost; },
    ready: pluginsReady,
    agent,
    context: (request) => agent.context(request),
    contextText: (request) => agent.contextText(request),
    copyContext: async (request) => {
      await ownerWindow.navigator.clipboard.writeText(await agent.contextText(request));
    },
    annotations: () => agent.annotations(),
    review: (annotationId) => agent.review(annotationId),
    capturePlan: (request) => agent.capturePlan(request),
    prepareCapture: () => agent.prepareCapture(),
    finishCapture: () => agent.finishCapture(),
    sendContext: (request) => agent.sendContext(request),
    bringToFront: () => hostLayer.bringToFront(),
    describe: () => pluginHost?.describe(),
    dispose() {
      if (disposed) return;
      disposed = true;
      disposer();
      hostLayer.dispose();
      if (pluginsReadyResolved) host.dispose();
      else void pluginsReady.then(() => host.dispose());
    },
  };
}

export { createMesurerAgentHarness } from "./agent";
export {
  type MesurerAgentHarness,
  type MesurerAgentSnapshot,
  type MesurerDistanceEvidence,
  type MesurerFeedbackRequest,
  type MesurerFeedbackResult,
  type MesurerSelectorInput,
} from "./agent";
export {
  createAnnotationService,
  formatMesurerContext,
  resolveCapturePlan,
  type MesurerAnnotation,
  type MesurerAnnotationAnchor,
  type MesurerAnnotationAnchorRegion,
  type MesurerAnnotationAnchorTarget,
  type MesurerAnnotationDraft,
  type MesurerCapturePlanV1,
  type MesurerContextRequest,
  type MesurerContextV1,
  type MesurerReviewItem,
  type MesurerReviewV1,
  type MesurerSendHook,
} from "./context";
export {
  contextPlugin,
  MESURER_CONTEXT_SERVICE_ID,
  type MesurerContextPluginOptions,
  type MesurerContextService,
} from "./context-plugin";
export {
  createMesurerPluginHost,
  type MesurerBuiltinActionController,
  type MesurerBuiltinPluginId as CoreMesurerBuiltinPluginId,
  type MesurerCommand,
  type MesurerCommandContext,
  type MesurerPlugin,
  type MesurerPluginContext,
  type MesurerPluginDescription,
  type MesurerPluginHost,
  type MesurerPluginRegistry,
  type MesurerPluginService,
  type MesurerToolbarContribution,
} from "./core";
export {
  rendererColorPickerPlugin as colorPickerPlugin,
  rendererComposeMesurerPlugins as composeMesurerPlugins,
  rendererDefaultMesurerPlugins as defaultMesurerPlugins,
  rendererDistancePlugin as distancePlugin,
  rendererGuidesPlugin as guidesPlugin,
  rendererRulersPlugin as rulersPlugin,
  rendererSelectPlugin as selectPlugin,
  rendererSettingsPlugin as settingsPlugin,
  rendererTextInspectorPlugin as textInspectorPlugin,
  rendererXrayPlugin as xrayPlugin,
};
