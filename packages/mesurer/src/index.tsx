import { render } from "@solidjs/web";
import {
  Measurer,
  type MeasurerPluginDescription,
  type MeasurerPluginHost,
  type MeasurerProps,
} from "@jhomra21/mesurer-solid";

export type MountMeasurerOptions = Omit<MeasurerProps, "portalTarget"> & {
  /** Element or ShadowRoot that owns the Mesurer island. Defaults to document.body. */
  target?: HTMLElement | ShadowRoot;
  /** Create a private ShadowRoot so Mesurer never depends on the host framework's renderer or CSS. */
  isolate?: boolean;
  /** ShadowRoot mode used when isolate is enabled. Defaults to open for devtools visibility. */
  shadowMode?: ShadowRootMode;
};

export type MountedMeasurer = {
  element: HTMLDivElement;
  root: HTMLDivElement | ShadowRoot;
  readonly pluginHost: MesurerPluginHost | undefined;
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
    onPluginHost,
    ...measurerProps
  } = options;
  const ownerDocument = target.ownerDocument ?? document;
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
  const disposeRender = render(
    () => (
      <Measurer
        {...measurerProps}
        portalTarget={portalTarget}
        onPluginHost={(host) => {
          pluginHost = host;
          onPluginHost?.(host);
        }}
      />
    ),
    mount,
  );

  let disposed = false;
  return {
    element: container,
    root,
    get pluginHost() {
      return pluginHost;
    },
    describe: () => pluginHost?.describe(),
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeRender();
      container.remove();
    },
  };
}

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
