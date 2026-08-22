import { render } from "@solidjs/web";
import {
  ContextActions,
  Measurer as RendererMeasurer,
  colorPickerPlugin as rendererColorPickerPlugin,
  composeMesurerPlugins as rendererComposeMesurerPlugins,
  createMesurerWorkspaceRuntime,
  defaultMesurerPlugins as rendererDefaultMesurerPlugins,
  distancePlugin as rendererDistancePlugin,
  guidesPlugin as rendererGuidesPlugin,
  rulersPlugin as rendererRulersPlugin,
  selectPlugin as rendererSelectPlugin,
  settingsPlugin as rendererSettingsPlugin,
  textInspectorPlugin as rendererTextInspectorPlugin,
  xrayPlugin as rendererXrayPlugin,
  type MeasurerProps as RendererMeasurerProps,
  type MesurerAnnotation,
  type MesurerContextRequest,
} from "@jhomra21/mesurer-solid-renderer";
import { createMesurerAgentHarness, type MesurerAgentHarness } from "./agent";
import {
  captureMesurerContext,
  copyTextToClipboard,
  createMesurerCapturePlan,
  formatMesurerContext,
  reviewMesurerAnnotation,
  toAcpContentBlocks,
  type MesurerCapturePlanV1,
  type MesurerContextSender,
  type MesurerContextV1,
  type MesurerEvidenceProvider,
  type MesurerReviewV1,
} from "./context";
import type { MesurerPlugin, MesurerPluginDescription, MesurerPluginHost } from "./core";
import { mountMesurerHost, type MesurerHostLayerMode } from "./host-layer";

export type ColorPickerFormat = "hex" | "rgb" | "hsl" | "oklch";
export type MesurerBuiltinPluginId = "select" | "xray" | "color-picker" | "rulers" | "text-inspector" | "guides" | "distance" | "settings";
export type GuidePattern = "solid" | "dashed" | "dotted";
export type GuideStyle = { opacity: number; width: number; pattern: GuidePattern; dashLength: number; gap: number };
export type RulerSettings = { opacity: number; edgeReveal: boolean };
export type MesurerRect = { left: number; top: number; width: number; height: number };
export type MesurerMeasurement = {
  id: string; rect: MesurerRect; normalizedRect: MesurerRect; deltaX: number; deltaY: number; snapped?: boolean;
};
export type MesurerGuide = { id: string; orientation: "vertical" | "horizontal"; position: number };
export type MesurerDistance = {
  id: string;
  rectA: MesurerRect; rectB: MesurerRect; normalizedRectA: MesurerRect; normalizedRectB: MesurerRect;
  horizontal: { x1: number; x2: number; y: number; value: number } | null;
  vertical: { y1: number; y2: number; x: number; value: number } | null;
  connectors: Array<{ x1: number; y1: number; x2: number; y2: number }>;
};
export type MesurerStoredSettings = {
  highlightColor?: string; guideColor?: string; hoverHighlightEnabled?: boolean;
  colorPickerFormats?: ColorPickerFormat[]; colorPickerClickFormat?: ColorPickerFormat;
  snapEnabled?: boolean; snapGuidesEnabled?: boolean; selectNewGuideEnabled?: boolean;
  multiMeasureEnabled?: boolean; persistOnReload?: boolean; guideStyle?: Partial<GuideStyle>; rulerSettings?: Partial<RulerSettings>;
};
export type MesurerStoredWorkspace = {
  enabled: boolean; xrayVisible: boolean;
  toolMode: "none" | "select" | "guides" | "text-inspector" | "xray" | "rulers";
  rulersVisible: boolean; guideOrientation: "vertical" | "horizontal";
  guides: MesurerGuide[]; selectedGuideIds: string[]; measurements: MesurerMeasurement[];
  activeMeasurement: MesurerMeasurement | null; heldDistances: MesurerDistance[];
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

export type AgentBridgeOptions = {
  /** Window property used by Playwright/Cypress/browser agents. Defaults to __MESURER__. */
  globalName?: string;
  /** Application DOM root to inspect. Defaults to the target ShadowRoot or owner document. */
  root?: ParentNode;
};
export type MesurerOptions = {
  highlightColor?: string; guideColor?: string; hoverHighlightEnabled?: boolean; persistOnReload?: boolean;
  persistKey?: string; persistence?: MesurerPersistence; onPersistenceError?: (error: unknown) => void;
  colorPickerFormats?: ColorPickerFormat[]; colorPickerClickFormat?: ColorPickerFormat;
  snapEnabled?: boolean; snapGuidesEnabled?: boolean; selectNewGuideEnabled?: boolean; multiMeasureEnabled?: boolean;
  guideStyle?: Partial<GuideStyle>; rulerSettings?: Partial<RulerSettings>; plugins?: MesurerPlugin[];
  excludePlugins?: MesurerBuiltinPluginId[]; pluginHost?: MesurerPluginHost;
  onPluginHost?: (host: MesurerPluginHost) => void; onPluginsReady?: (host: MesurerPluginHost) => void;
  onPluginError?: (error: unknown, pluginId: string) => void;
};
export type MountMeasurerOptions = MesurerOptions & {
  /** Element or ShadowRoot that owns the Mesurer island. Defaults to document.body. */
  target?: HTMLElement | ShadowRoot;
  /** Create a private ShadowRoot so Mesurer never depends on the host framework's renderer or CSS. */
  isolate?: boolean;
  /** ShadowRoot mode used when isolate is enabled. Defaults to open for devtools visibility. */
  shadowMode?: ShadowRootMode;
  /** Promote the Mesurer host into the browser top layer when supported. Defaults to true. */
  topLayer?: boolean;
  /** Opt in to a window-level agent bridge, or configure its global name/root. */
  agent?: boolean | AgentBridgeOptions;
  /** Show Copy Context / annotation controls. Defaults to true. */
  contextUi?: boolean;
  /** Optional browser/extension screenshot provider. Mesurer only plans evidence; the host captures pixels. */
  evidenceProvider?: MesurerEvidenceProvider;
  /** Optional direct handoff callback, normally backed by an ACP client outside browser core. */
  sendContext?: MesurerContextSender;
  /** Optional label for direct handoff UI. Defaults to Send to agent. */
  sendLabel?: string;
};

export type MesurerAgentCapabilities = {
  protocol: "mesurer.agent/v1";
  contextSchema: "mesurer.context/v1";
  capabilities: { context: true; annotations: true; review: true; capturePlan: true; screenshots: boolean; send: boolean };
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
  if (typeof document === "undefined") throw new Error("mountMeasurer() requires a browser or Electron renderer document.");
  const {
    target = document.body, isolate = true, shadowMode = "open", topLayer = true,
    agent: agentOption = false, contextUi = true, evidenceProvider,
    sendContext: sendContextOption, sendLabel, onPluginHost, onPluginsReady, ...measurerProps
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
    shadow.append(mount); root = shadow; portalTarget = shadow;
  }

  const workspace = createMesurerWorkspaceRuntime({ ownerDocument, ownerWindow, uiRoot: root });
  let pluginHost: MesurerPluginHost | undefined;
  let resolvePluginHost!: (host: MesurerPluginHost) => void;
  let resolvePluginsReady!: (host: MesurerPluginHost) => void;
  let pluginsReadyResolved = false;
  const pluginHostCreated = new Promise<MesurerPluginHost>((resolve) => { resolvePluginHost = resolve; });
  const pluginsReady = new Promise<MesurerPluginHost>((resolve) => { resolvePluginsReady = resolve; });
  const waitForPluginHost = async () => { await (pluginHost ? Promise.resolve(pluginHost) : pluginHostCreated); return pluginsReady; };

  const agentConfig: AgentBridgeOptions | null = agentOption === true ? {} : agentOption === false ? null : agentOption;
  const inspectionRoot = agentConfig?.root ?? (target.nodeType === 11 ? target : ownerDocument);
  const baseAgent = createMesurerAgentHarness({ ownerDocument, root: inspectionRoot, getPluginHost: () => pluginHost, waitForPluginHost });
  const ensureReady = async () => { await baseAgent.ready(); };
  const context = async (request?: MesurerContextRequest) => {
    await ensureReady();
    return captureMesurerContext({ runtime: workspace, ownerDocument, ownerWindow, request });
  };
  const contextText = async (request?: MesurerContextRequest) => formatMesurerContext(await context(request));
  const copyContext = async (request?: MesurerContextRequest) => copyTextToClipboard(ownerDocument, ownerWindow, await contextText(request));
  const annotations = async () => { await ensureReady(); return workspace.annotations(); };
  const review = async (annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]> => {
    await ensureReady();
    await baseAgent.stable(1);
    if (annotationId) return reviewMesurerAnnotation({ runtime: workspace, ownerDocument, ownerWindow, annotationId });
    return workspace.annotations().map((annotation) => reviewMesurerAnnotation({ runtime: workspace, ownerDocument, ownerWindow, annotationId: annotation.id }));
  };
  const capturePlan = async (request?: MesurerContextRequest) => createMesurerCapturePlan(await context(request));
  const prepareCapture = async () => { await ensureReady(); workspace.prepareCapture(); await baseAgent.stable(1); };
  const finishCapture = async () => { workspace.finishCapture(); await baseAgent.stable(1); };
  const sendContext = async (request?: MesurerContextRequest) => {
    if (!sendContextOption) throw new Error("No Mesurer context sender is configured.");
    const value = await context(request);
    const text = formatMesurerContext(value);
    const plan = createMesurerCapturePlan(value);
    let images = [] as Awaited<ReturnType<MesurerEvidenceProvider>>;
    if (evidenceProvider) {
      workspace.prepareCapture();
      try {
        await baseAgent.stable(1);
        images = await evidenceProvider({ context: value, plan });
      } finally {
        workspace.finishCapture();
        await baseAgent.stable(1);
      }
    }
    await sendContextOption({ context: value, text, images });
  };
  const capabilities = (): MesurerAgentCapabilities => ({
    protocol: "mesurer.agent/v1", contextSchema: "mesurer.context/v1",
    capabilities: { context: true, annotations: true, review: true, capturePlan: true, screenshots: Boolean(evidenceProvider), send: Boolean(sendContextOption) },
  });
  const agent = Object.assign(baseAgent, { capabilities, context, contextText, annotations, review, capturePlan, prepareCapture, finishCapture, sendContext }) as MesurerBrowserAgent;

  const rendererProps = measurerProps as RendererMeasurerProps;
  const disposeRender = render(
    () => (<>
      <RendererMeasurer
        {...rendererProps}
        portalTarget={portalTarget}
        onPluginHost={(host) => {
          const publicHost = host as unknown as MesurerPluginHost;
          if (!pluginHost) resolvePluginHost(publicHost);
          pluginHost = publicHost; onPluginHost?.(publicHost);
        }}
        onPluginsReady={(host) => {
          const publicHost = host as unknown as MesurerPluginHost;
          pluginHost = publicHost;
          if (!pluginsReadyResolved) { pluginsReadyResolved = true; resolvePluginsReady(publicHost); }
          onPluginsReady?.(publicHost);
        }}
      />
      {contextUi ? <ContextActions runtime={workspace} onCopy={copyContext} onSend={sendContextOption ? sendContext : undefined} sendLabel={sendLabel} /> : null}
    </>),
    mount,
  );
  workspace.bindCurrentModel();

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
      if (hadPrevious) globalRecord[globalName] = previous; else delete globalRecord[globalName];
    };
  }

  let disposed = false;
  return {
    element: container, root, hostLayer: hostLayer.mode,
    get pluginHost() { return pluginHost; },
    ready, agent, context, contextText, copyContext, annotations, review, capturePlan, prepareCapture, finishCapture, sendContext,
    bringToFront: hostLayer.bringToFront,
    describe: () => pluginHost?.describe(),
    dispose() {
      if (disposed) return;
      disposed = true;
      restoreAgentGlobal?.();
      workspace.dispose();
      disposeRender(); hostLayer.dispose(); container.remove();
    },
  };
}

export { createMesurerAgentHarness } from "./agent";
export type {
  AgentDistance, AgentEdges, AgentElementInspection, AgentFeedbackSnapshot, AgentRect,
  AgentViewportSnapshot, CreateMesurerAgentHarnessOptions, MesurerAgentHarness,
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
  AcpImageContentBlock, AcpTextContentBlock, MesurerAcpContentBlock, MesurerCapturePlanV1,
  MesurerContextDelivery, MesurerContextDistance, MesurerContextGuide, MesurerContextMeasurement,
  MesurerContextRequest, MesurerContextSender, MesurerContextTarget, MesurerContextV1,
  MesurerEvidenceImage, MesurerEvidenceProvider, MesurerReviewChange, MesurerReviewV1,
} from "./context";
export {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "./core";
export type {
  CommandHandler as MesurerCommandHandler, MesurerPlugin, MesurerPluginContext, MesurerPluginDescription,
  MesurerPluginHost, OverlayContribution, Registration as MesurerRegistration, SettingsContribution,
  StateSliceDefinition, ToolContribution,
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
export const composeMesurerPlugins = rendererComposeMesurerPlugins as unknown as (plugins?: MesurerPlugin[], exclude?: MesurerBuiltinPluginId[]) => MesurerPlugin[];
