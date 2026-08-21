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
import {
  createMesurerAgentHarness,
  type MesurerAgentHarness,
} from "./agent";
import type {
  MesurerPlugin,
  MesurerPluginDescription,
  MesurerPluginHost,
} from "./core";
import { mountMesurerHost, type MesurerHostLayerMode } from "./host-layer";

export type ColorPickerFormat = "hex" | "rgb" | "hsl" | "oklch";
export type MesurerBuiltinPluginId =
  | "select"
  | "xray"
  | "color-picker"
  | "rulers"
  | "text-inspector"
  | "guides"
  | "distance"
  | "settings";

export type GuidePattern = "solid" | "dashed" | "dotted";
export type GuideStyle = {
  opacity: number;
  width: number;
  pattern: GuidePattern;
  dashLength: number;
  gap: number;
};
export type RulerSettings = { opacity: number; edgeReveal: boolean };
export type MesurerRect = { left: number; top: number; width: number; height: number };
export type MesurerMeasurement = {
  id: string;
  rect: MesurerRect;
  normalizedRect: MesurerRect;
  deltaX: number;
  deltaY: number;
  snapped?: boolean;
};
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
export type MesurerPersistenceSnapshot = {
  settings: MesurerStoredSettings;
  workspace: MesurerStoredWorkspace | null;
};
export type MesurerPersistence = {
  load(): MesurerPersistenceSnapshot | null;
  saveSettings(settings: MesurerStoredSettings): void;
  saveWorkspace(workspace: MesurerStoredWorkspace): void;
  clearWorkspace(): void;
  clearSettings(): void;
  subscribe?: (
    listener: (
      snapshot: MesurerPersistenceSnapshot | null,
      source?: { settings?: boolean; workspace?: boolean },
    ) => void,
  ) => () => void;
  setErrorHandler?: (handler: ((error: unknown) => void) | undefined) => void;
};

export type AgentBridgeOptions = {
  /** Window property used by Playwright/Cypress/browser agents. Defaults to __MESURER__. */
  globalName?: string;
  /** Application DOM root to inspect. Defaults to the target ShadowRoot or owner document. */
  root?: ParentNode;
};

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
  rulerSettings?: Partial<RulerSettings>;
  plugins?: MesurerPlugin[];
  excludePlugins?: MesurerBuiltinPluginId[];
  pluginHost?: MesurerPluginHost;
  onPluginHost?: (host: MesurerPluginHost) => void;
  onPluginsReady?: (host: MesurerPluginHost) => void;
  onPluginError?: (error: unknown, pluginId: string) => void;
};

export type MountMeasurerOptions = MesurerOptions & {
  /** Element or ShadowRoot that owns the Mesurer island. Defaults to document.body. */
  target?: HTMLElement | ShadowRoot;
  /** Create a private ShadowRoot so Mesurer never depends on the host framework's renderer or CSS. */
  isolate?: boolean;
  /** ShadowRoot mode used when isolate is enabled. Defaults to open for devtools visibility. */
  shadowMode?: ShadowRootMode;
  /**
   * Promote the Mesurer host into the browser top layer when supported so host
   * stacking contexts and ancestor clipping cannot cover it. Defaults to true.
   */
  topLayer?: boolean;
  /** Opt in to a window-level agent bridge, or configure its global name/root. */
  agent?: boolean | AgentBridgeOptions;
};

export type MountedMeasurer = {
  element: HTMLDivElement;
  root: HTMLDivElement | ShadowRoot;
  /** Actual host-layer strategy selected for this browser. */
  readonly hostLayer: MesurerHostLayerMode;
  readonly pluginHost: MesurerPluginHost | undefined;
  /** Resolves after built-ins, renderer bridge, external plugins and persisted plugin state settle. */
  readonly ready: Promise<void>;
  /** JSON-safe browser measurement and command API for coding-agent harnesses. */
  readonly agent: MesurerAgentHarness;
  /** Reassert Mesurer as the newest top-layer entry after host overlays if needed. */
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
  const agent = createMesurerAgentHarness({
    ownerDocument,
    root: inspectionRoot,
    getPluginHost: () => pluginHost,
    waitForPluginHost,
  });

  const rendererProps = measurerProps as RendererMeasurerProps;
  const disposeRender = render(
    () => (
      <RendererMeasurer
        {...rendererProps}
        portalTarget={portalTarget}
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
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "./core";
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
