import { render } from "@solidjs/web";
import {
  Measurer,
  type MeasurerPluginDescription,
  type MesurerPluginHost,
  type MeasurerProps,
} from "@jhomra21/mesurer-solid";
import {
  createMesurerAgentHarness,
  type MesurerAgentHarness,
} from "./agent";

export type AgentBridgeOptions = {
  /** Window property used by Playwright/Cypress/browser agents. Defaults to __MESURER__. */
  globalName?: string;
  /** Application DOM root to inspect. Defaults to the target ShadowRoot or owner document. */
  root?: ParentNode;
};

export type MountMeasurerOptions = Omit<MeasurerProps, "portalTarget"> & {
  /** Element or ShadowRoot that owns the Mesurer island. Defaults to document.body. */
  target?: HTMLElement | ShadowRoot;
  /** Create a private ShadowRoot so Mesurer never depends on the host framework's renderer or CSS. */
  isolate?: boolean;
  /** ShadowRoot mode used when isolate is enabled. Defaults to open for devtools visibility. */
  shadowMode?: ShadowRootMode;
  /** Opt in to a window-level agent bridge, or configure its global name/root. */
  agent?: boolean | AgentBridgeOptions;
};

export type MountedMeasurer = {
  element: HTMLDivElement;
  root: HTMLDivElement | ShadowRoot;
  readonly pluginHost: MesurerPluginHost | undefined;
  /** Resolves when the plugin/runtime bridge and browser layout are ready for automation. */
  readonly ready: Promise<void>;
  /** JSON-safe browser measurement and command API for coding-agent harnesses. */
  readonly agent: MesurerAgentHarness;
  describe(): MeasurerPluginDescription | undefined;
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
    agent: agentOption = false,
    onPluginHost,
    ...measurerProps
  } = options;
  const ownerDocument = target.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView ?? window;
  const container = ownerDocument.createElement("div");
  container.dataset.mesurerIsland = "true";
  target.append(container);

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
  const pluginHostCreated = new Promise<MesurerPluginHost>((resolve) => {
    resolvePluginHost = resolve;
  });

  const waitForPluginHost = async () => {
    const host = pluginHost ?? await pluginHostCreated;
    if (host.has("mesurer.runtime-bridge")) return host;
    await new Promise<void>((resolve) => {
      const unsubscribe = host.subscribe(() => {
        if (!host.has("mesurer.runtime-bridge")) return;
        unsubscribe();
        resolve();
      });
    });
    return host;
  };

  const agentConfig: AgentBridgeOptions | null = agentOption === true
    ? {}
    : agentOption === false
      ? null
      : agentOption;
  const inspectionRoot = agentConfig?.root ?? (target instanceof ShadowRoot ? target : ownerDocument);
  const agent = createMesurerAgentHarness({
    ownerDocument,
    root: inspectionRoot,
    getPluginHost: () => pluginHost,
    waitForPluginHost,
  });

  const disposeRender = render(
    () => (
      <Measurer
        {...measurerProps}
        portalTarget={portalTarget}
        onPluginHost={(host) => {
          if (!pluginHost) resolvePluginHost(host);
          pluginHost = host;
          onPluginHost?.(host);
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
    get pluginHost() {
      return pluginHost;
    },
    ready,
    agent,
    describe: () => pluginHost?.describe(),
    dispose() {
      if (disposed) return;
      disposed = true;
      restoreAgentGlobal?.();
      disposeRender();
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
  colorPickerPlugin,
  composeMesurerPlugins,
  createMesurerPluginHost,
  defaultMesurerPlugins,
  defineMesurerPlugin,
  distancePlugin,
  guidesPlugin,
  rulersPlugin,
  selectPlugin,
  settingsPlugin,
  textInspectorPlugin,
  xrayPlugin,
} from "@jhomra21/mesurer-solid";
export type {
  MesurerBuiltinPluginId,
  MesurerPlugin,
  MesurerPluginContext,
  MeasurerPluginDescription,
  MesurerPluginHost,
  ToolContribution,
} from "@jhomra21/mesurer-solid";
