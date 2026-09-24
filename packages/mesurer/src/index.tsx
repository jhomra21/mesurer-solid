import { render } from "@solidjs/web";
import {
  Mesurer as RendererMesurer,
  type MesurerProps as RendererMesurerProps,
} from "@jhomra21/mesurer-solid-renderer";
import {
  MESURER_TEXT_EDIT_SERVICE_ID,
  createMesurerAgentHarness,
  type MesurerAgentHarness,
  type MesurerTextEditIntent,
  type MesurerTextEditService,
} from "./agent";
import {
  MESURER_ARRANGE_SERVICE_ID,
  type ArrangeCapturePlan,
  type ArrangeIntent,
  type ArrangePresentation,
  type ArrangeReview,
  type MesurerArrangeService,
} from "./arrange";
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
import { createPluginRegistry } from "./plugin-catalog";
import { MESURER_VERSION } from "./version";

export type ColorPickerFormat = "hex" | "rgb" | "hsl" | "oklch";

export type MesurerTheme = "system" | "light" | "dark";

/** Public built-in names, aligned with the factories exported by `mesurer-solid/plugins`. */
export type MesurerBuiltin = "select" | "xray" | "colorPicker" | "rulers" | "typography" | "guides" | "distance" | "settings";

/** @deprecated Internal compatibility ids used by the older `excludePlugins` option. */
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
  shortcutsEnabled?: boolean;
  theme?: MesurerTheme;
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
  setPageKey?(pageKey: string): void;
  subscribe?: (listener: (snapshot: MesurerPersistenceSnapshot | null, source?: { settings?: boolean; workspace?: boolean }) => void) => () => void;
  setErrorHandler?: (handler: ((cause: unknown) => void) | undefined) => void;
};

export type AgentBridgeOptions = { globalName?: string; root?: Document | HTMLElement | ShadowRoot };

export type MesurerOptions = {
  highlightColor?: string;
  guideColor?: string;
  hoverHighlightEnabled?: boolean;
  persistOnReload?: boolean;
  shortcutsEnabled?: boolean;
  theme?: MesurerTheme;
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
  /**
   * Initial enabled plugin set. Omit this to enable every first-party Mesurer plugin.
   * Omitted first-party plugins remain toggleable in Settings from the same canonical
   * registry; callers never maintain a separate availability or Settings list.
   */
  plugins?: readonly MesurerPlugin[];
  /** Built-in tools to omit from this mount. Names match the public plugin factories. */
  excludeBuiltins?: readonly MesurerBuiltin[];
  /** @deprecated Use `excludeBuiltins`. This compatibility option uses internal built-in ids. */
  excludePlugins?: readonly MesurerBuiltinPluginId[];
  /**
   * Advanced: supply a plugin host owned outside this mount.
   * The caller remains responsible for disposing the supplied host.
   */
  pluginHost?: MesurerPluginHost;
  /** Advanced: receive the live host before configured plugin setup settles. */
  onPluginHost?: (host: MesurerPluginHost) => void;
  /** @deprecated Await `mounted.ready` instead. */
  onPluginsReady?: (host: MesurerPluginHost) => void;
  onPluginError?: (cause: unknown, pluginId: string) => void;
};

const BUILTIN_PLUGIN_ID: Record<MesurerBuiltin, MesurerBuiltinPluginId> = {
  select: "select",
  xray: "xray",
  colorPicker: "color-picker",
  rulers: "rulers",
  typography: "text-inspector",
  guides: "guides",
  distance: "distance",
  settings: "settings",
};

export type MountMesurerOptions = MesurerOptions & {
  target?: HTMLElement | ShadowRoot;
  isolate?: boolean;
  shadowMode?: ShadowRootMode;
  topLayer?: boolean;
  /**
   * Expose the browser agent API on the owning Window. The mounted handle always
   * exposes `agent`; this option controls only the global bridge.
   */
  agent?: boolean | AgentBridgeOptions;
  /**
   * Dispose this mount when the signal aborts.
   * A caller-supplied pluginHost keeps its separate lifecycle.
   */
  signal?: AbortSignal;
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
    arrange: boolean;
    textEdit: boolean;
  };
};

export type MesurerContextHarness = {
  capabilities(): MesurerAgentCapabilities;
  context(request?: MesurerContextRequest): Promise<MesurerContextV1>;
  contextText(request?: MesurerContextRequest): Promise<string>;
  select(selectors: string | readonly string[]): Promise<MesurerContextV1>;
  annotations(): Promise<MesurerAnnotation[]>;
  review(annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]>;
  capturePlan(request?: MesurerContextRequest): Promise<MesurerCapturePlanV1>;
  prepareCapture(): Promise<void>;
  finishCapture(): Promise<void>;
};

export type MesurerArrangeHarness = {
  arrangements(): Promise<ArrangeIntent[]>;
  arrange(id: string): Promise<ArrangeIntent>;
  showArrange(id: string, state: ArrangePresentation): Promise<void>;
  arrangeCapturePlan(id: string, state: ArrangePresentation): Promise<ArrangeCapturePlan>;
  reviewArrange(id: string, tolerance?: number): Promise<ArrangeReview>;
};

export type MesurerBrowserAgent = MesurerAgentHarness & MesurerContextHarness & MesurerArrangeHarness;

export type MountedMesurer = {
  readonly element: HTMLDivElement;
  readonly root: HTMLDivElement | ShadowRoot;
  readonly hostLayer: MesurerHostLayerMode;
  /** @deprecated Await `ready` when direct plugin-host access is required. */
  readonly pluginHost: MesurerPluginHost | undefined;
  /** Resolves to the live plugin host after startup and initial rendered state settle. */
  readonly ready: Promise<MesurerPluginHost>;
  readonly agent: MesurerBrowserAgent;
  service<T>(id: string): Promise<T>;
  context(request?: MesurerContextRequest): Promise<MesurerContextV1>;
  contextText(request?: MesurerContextRequest): Promise<string>;
  copyContext(request?: MesurerContextRequest): Promise<void>;
  select(selectors: string | readonly string[]): Promise<MesurerContextV1>;
  annotations(): Promise<MesurerAnnotation[]>;
  review(annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]>;
  capturePlan(request?: MesurerContextRequest): Promise<MesurerCapturePlanV1>;
  prepareCapture(): Promise<void>;
  finishCapture(): Promise<void>;
  arrangements(): Promise<ArrangeIntent[]>;
  arrange(id: string): Promise<ArrangeIntent>;
  showArrange(id: string, state: ArrangePresentation): Promise<void>;
  arrangeCapturePlan(id: string, state: ArrangePresentation): Promise<ArrangeCapturePlan>;
  reviewArrange(id: string, tolerance?: number): Promise<ArrangeReview>;
  textEdits(): Promise<MesurerTextEditIntent[]>;
  textEdit(id: string): Promise<MesurerTextEditIntent>;
  bringToFront(): void;
  describe(): Promise<MesurerPluginDescription>;
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
    signal,
    onPluginHost,
    onPluginsReady,
    plugins,
    excludeBuiltins,
    excludePlugins,
    ...mesurerProps
  } = options;

  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Mesurer mount aborted.", "AbortError");
  }

  if (!target) {
    throw new Error("mountMesurer() requires document.body to exist or an explicit target.");
  }

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
  let rejectPluginHost!: (cause: unknown) => void;
  let resolvePluginsReady!: (host: MesurerPluginHost) => void;
  let rejectPluginsReady!: (cause: unknown) => void;
  let pluginHostCreatedResolved = false;
  let pluginsReadyResolved = false;

  const pluginHostCreated = new Promise<MesurerPluginHost>((resolve, reject) => {
    resolvePluginHost = resolve;
    rejectPluginHost = reject;
  });

  const pluginsReady = new Promise<MesurerPluginHost>((resolve, reject) => {
    resolvePluginsReady = resolve;
    rejectPluginsReady = reject;
  });

  // The caller may never await readiness. Keep lifecycle cancellation from
  // surfacing as an unhandled rejection while preserving rejection for awaiters.
  void pluginHostCreated.catch(() => undefined);
  void pluginsReady.catch(() => undefined);

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

  const service = async <T,>(id: string): Promise<T> => {
    await waitForPluginHost();
    const value = pluginHost?.service.get<T>(id);

    if (value === undefined) throw new Error(`Mesurer service is unavailable: ${id}.`);

    return value;
  };

  const getContextService = async () => {
    await baseAgent.ready();
    const service = pluginHost?.service.get<MesurerContextService>(MESURER_CONTEXT_SERVICE_ID);

    if (!service) {
      throw new Error("Mesurer Context is disabled. Enable it in Settings or include context() in plugins.");
    }

    return service;
  };

  const getArrangeService = async () => {
    await baseAgent.ready();
    const service = pluginHost?.service.get<MesurerArrangeService>(MESURER_ARRANGE_SERVICE_ID);

    if (!service) {
      throw new Error("Mesurer Arrange is disabled. Enable it in Settings or include arrange() in plugins.");
    }

    return service;
  };

  const context = async (request?: MesurerContextRequest) => (await getContextService()).context(request);
  const contextText = async (request?: MesurerContextRequest) => (await getContextService()).contextText(request);
  const copyContext = async (request?: MesurerContextRequest) => (await getContextService()).copyContext(request);
  const select = async (selectors: string | readonly string[]) => (await getContextService()).select(selectors);
  const annotations = async () => (await getContextService()).annotations();
  const review = async (annotationId?: string) => (await getContextService()).review(annotationId);
  const capturePlan = async (request?: MesurerContextRequest) => (await getContextService()).capturePlan(request);
  const prepareCapture = async () => (await getContextService()).prepareCapture();
  const finishCapture = async () => (await getContextService()).finishCapture();
  const arrangements = async () => (await getArrangeService()).intents();

  const arrange = async (id: string) => {
    const intent = (await getArrangeService()).intent(id);

    if (!intent) throw new Error(`Arrange intent not found: ${id}`);

    return intent;
  };

  const showArrange = async (id: string, state: ArrangePresentation) => {
    (await getArrangeService()).show(id, state);
  };

  const arrangeCapturePlan = async (id: string, state: ArrangePresentation) =>
    (await getArrangeService()).capturePlan(id, state);

  const reviewArrange = async (id: string, tolerance?: number) =>
    (await getArrangeService()).review(id, tolerance);

  // Keep the base harness implementations intact. Object.assign mutates
  // baseAgent, so replacing these methods with wrappers that call
  // baseAgent.textEdits()/textEdit() would make each wrapper call itself.
  const textEdits = () => baseAgent.textEdits();
  const textEdit = (id: string) => baseAgent.textEdit(id);

  const capabilities = (): MesurerAgentCapabilities => {
    const contextAvailable = Boolean(pluginHost?.service.get<MesurerContextService>(MESURER_CONTEXT_SERVICE_ID));
    const arrangeAvailable = Boolean(pluginHost?.service.get<MesurerArrangeService>(MESURER_ARRANGE_SERVICE_ID));
    const textEditAvailable = Boolean(pluginHost?.service.get<MesurerTextEditService>(MESURER_TEXT_EDIT_SERVICE_ID));

    return {
      protocol: "mesurer.agent/v1",
      contextSchema: "mesurer.context/v1",
      capabilities: {
        context: contextAvailable,
        select: contextAvailable,
        annotations: contextAvailable,
        review: contextAvailable,
        capturePlan: contextAvailable,
        arrange: arrangeAvailable,
        textEdit: textEditAvailable,
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
    arrangements,
    arrange,
    showArrange,
    arrangeCapturePlan,
    reviewArrange,
  });

  const rendererProps: RendererMesurerProps = {
    ...mesurerProps,
    version: MESURER_VERSION,
    plugins: createPluginRegistry(plugins),
    excludePlugins: excludeBuiltins
      ? excludeBuiltins.map((id) => BUILTIN_PLUGIN_ID[id])
      : [...(excludePlugins ?? [])],
  };

  const disposeRender = render(
    () => (
      <RendererMesurer
        {...rendererProps}
        portalTarget={portalTarget}
        pageTarget={target}
        onPluginHost={(host) => {
          if (!pluginHostCreatedResolved) {
            pluginHostCreatedResolved = true;
            resolvePluginHost(host);
          }

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

  let rejectReadiness!: (cause: unknown) => void;

  const readinessCancelled = new Promise<never>((_resolve, reject) => {
    rejectReadiness = reject;
  });

  void readinessCancelled.catch(() => undefined);

  const ready = Promise.race([
    (async () => {
      await agent.ready();

      return waitForPluginHost();
    })(),
    readinessCancelled,
  ]);

  void ready.catch(() => undefined);

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
  let removeAbortListener: () => void = () => undefined;

  const cancelPendingReady = (cause: unknown) => {
    if (!pluginHostCreatedResolved) rejectPluginHost(cause);

    if (!pluginsReadyResolved) rejectPluginsReady(cause);
    rejectReadiness(cause);
  };

  const mounted: MountedMesurer = {
    element: container,
    root,
    hostLayer: hostLayer.mode,
    get pluginHost() {
      return pluginHost;
    },
    ready,
    agent,
    service,
    context,
    contextText,
    copyContext,
    select,
    annotations,
    review,
    capturePlan,
    prepareCapture,
    finishCapture,
    arrangements,
    arrange,
    showArrange,
    arrangeCapturePlan,
    reviewArrange,
    textEdits,
    textEdit,
    bringToFront: hostLayer.bringToFront,
    describe: async () => (await ready).describe(),
    dispose() {
      if (disposed) return;
      disposed = true;
      removeAbortListener();
      cancelPendingReady(new DOMException("Mesurer was disposed before it became ready.", "AbortError"));
      restoreAgentGlobal?.();
      disposeRender();
      hostLayer.dispose();
      container.remove();
    },
  };

  if (signal) {
    const onAbort = () => {
      if (disposed) return;
      const reason = signal.reason ?? new DOMException("Mesurer mount aborted.", "AbortError");

      cancelPendingReady(reason);
      mounted.dispose();
    };

    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => {
      signal.removeEventListener("abort", onAbort);
    };
  }

  return mounted;
}

/** @deprecated Use `MountMesurerOptions`. */
export type MountMeasurerOptions = MountMesurerOptions;

/** @deprecated Use `MountedMesurer`. */
export type MountedMeasurer = MountedMesurer;

/** @deprecated Use `mountMesurer()`. */
export const mountMeasurer = mountMesurer;

export { createMesurerAgentHarness, MESURER_TEXT_EDIT_SERVICE_ID } from "./agent";

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
  MesurerTextEditIntent,
  MesurerTextEditService,
  MesurerTextStyleChange,
  MesurerTextStyleProperty,
} from "./agent";

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
} from "./arrange";

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
  MesurerContextLayoutGuide,
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
