import { For, Show, createMemo, createSignal, onSettled, untrack } from "solid-js";
import { Portal } from "@solidjs/web";
import {
  createMesurerPluginHost,
  type MesurerPlugin,
  type MesurerPluginHost,
  type ToolContribution,
} from "@jhomra21/mesurer-solid-core";
import LegacyMeasurer, { type MeasurerProps as LegacyMeasurerProps } from "./Measurer";
import {
  MeasurerModelRegistrationContext,
  type MeasurerModel,
} from "./model/create-measurer-model";
import { composeMesurerPlugins, type MesurerBuiltinPluginId } from "./plugins/builtins";
import {
  createMesurerWorkspaceRuntime,
  type MesurerWorkspaceRuntime,
} from "./runtime/workspace-context";

export type MesurerSolidRuntimeService = {
  ownerDocument: Document;
  ownerWindow: Window;
  portalTarget: HTMLElement | ShadowRoot;
  createWorkspaceRuntime(): MesurerWorkspaceRuntime;
  /** Create Mesurer-owned DOM that is automatically excluded from inspection/X-ray. */
  createInspectorMount(): { element: HTMLDivElement; dispose(): void };
};

export type MeasurerProps = LegacyMeasurerProps & {
  /** Additional plugins loaded after built-ins and the renderer bridge are available. */
  plugins?: MesurerPlugin[];
  /** Remove built-in features without forking the renderer. */
  excludePlugins?: MesurerBuiltinPluginId[];
  /** Supply a long-lived host when plugins should be managed outside the component. */
  pluginHost?: MesurerPluginHost;
  /** Receive the live host immediately for add/remove/replace operations and introspection. */
  onPluginHost?: (host: MesurerPluginHost) => void;
  /** Called after built-ins, renderer bridge, external plugins and persisted plugin state settle. */
  onPluginsReady?: (host: MesurerPluginHost) => void;
  onPluginError?: (error: unknown, pluginId: string) => void;
};

const LABELS: Partial<Record<MesurerBuiltinPluginId, string>> = {
  select: "Select",
  xray: "X-ray",
  "color-picker": "Color picker",
  rulers: "Rulers",
  "text-inspector": "Text inspector",
  guides: "Guides",
  settings: "Settings",
};

const BUILTIN_KEYS: Partial<Record<MesurerBuiltinPluginId, string>> = {
  select: "s",
  xray: "x",
  "color-picker": "p",
  rulers: "r",
  "text-inspector": "a",
  guides: "g",
};

const toolSelector = (label: string) =>
  `[data-mesurer-toolbar='true'] button[aria-label^='${label}']`;

const builtinCommand = (id: MesurerBuiltinPluginId) => `builtin.${id}`;

const matchesShortcut = (event: KeyboardEvent, shortcut: string) => {
  const parts = shortcut
    .toLowerCase()
    .replaceAll("cmd", "meta")
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return false;
  const key = parts.at(-1)!;
  const modifiers = new Set(parts.slice(0, -1));
  const wantsMod = modifiers.has("mod");
  const wantsMeta = modifiers.has("meta");
  const wantsCtrl = modifiers.has("ctrl") || modifiers.has("control");
  const wantsShift = modifiers.has("shift");
  const wantsAlt = modifiers.has("alt") || modifiers.has("option");
  if (wantsMod ? !(event.metaKey || event.ctrlKey) : wantsMeta !== event.metaKey || wantsCtrl !== event.ctrlKey) return false;
  if (wantsShift !== event.shiftKey || wantsAlt !== event.altKey) return false;
  if (!wantsMod && !wantsMeta && !wantsCtrl && (event.metaKey || event.ctrlKey)) return false;
  return event.key.toLowerCase() === key;
};

export default function ComposableMeasurer(props: MeasurerProps) {
  const providedHost = untrack(() => props.pluginHost);
  const host: MesurerPluginHost = providedHost ?? createMesurerPluginHost();
  const ownsHost = !providedHost;
  const initialExclusions = new Set(untrack(() => props.excludePlugins ?? []));
  const initialBuiltinPlugins = untrack(() => composeMesurerPlugins([], props.excludePlugins ?? []));
  const initialExternalPlugins = untrack(() => [...(props.plugins ?? [])]);
  let rendererModel: MeasurerModel | null = null;
  const [revision, setRevision] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  const [extensionMount, setExtensionMount] = createSignal<HTMLDivElement | null>(null);

  const replacementBuiltinTool = (id: MesurerBuiltinPluginId): ToolContribution | undefined => {
    revision();
    return host.tools().find((tool) =>
      (tool.builtin === id || tool.id === id) && tool.command !== builtinCommand(id),
    );
  };

  const builtinEnabled = (id: MesurerBuiltinPluginId) => {
    revision();
    if (!ready()) return !initialExclusions.has(id);
    if (id === "distance") {
      return host.overlays().some((overlay) => overlay.builtin === id || overlay.id === id);
    }
    return host.tools().some((tool) => tool.builtin === id || tool.id === id);
  };

  const customTools = createMemo(() => {
    revision();
    return host.tools().filter((tool) => {
      if (!tool.builtin) return true;
      return tool.command !== builtinCommand(tool.builtin as MesurerBuiltinPluginId);
    });
  });

  const visibilityCss = () => {
    revision();
    const rules: string[] = [];
    for (const [id, label] of Object.entries(LABELS) as Array<[MesurerBuiltinPluginId, string]>) {
      if (!builtinEnabled(id) || replacementBuiltinTool(id)) {
        rules.push(`${toolSelector(label)}{display:none!important}`);
      }
    }
    if (!builtinEnabled("guides") || replacementBuiltinTool("guides")) {
      rules.push("[data-mesurer-toolbar='true'] div:has(>button[aria-label='Guide orientation menu']){display:none!important}");
    }
    if (!builtinEnabled("guides")) rules.push("[data-mesurer-guide='true']{display:none!important}");
    if (!builtinEnabled("distance")) rules.push("[data-mesurer-distance='true']{display:none!important}");
    if (!builtinEnabled("rulers")) rules.push("[data-mesurer-rulers='true']{display:none!important}");
    if (!builtinEnabled("color-picker")) rules.push(".mesurer-color-picker{display:none!important}");
    return rules.join("\n");
  };

  const executeTool = async (tool: ToolContribution, source: unknown = "toolbar") => {
    if (tool.disabled?.()) return;
    try {
      await host.command.execute(tool.command, undefined, { source, toolId: tool.id });
    } catch (error) {
      props.onPluginError?.(error, tool.id);
      throw error;
    }
  };

  const runTool = (tool: ToolContribution, source: unknown = "toolbar") => {
    void executeTool(tool, source).catch(() => undefined);
  };

  onSettled(() => {
    let active = true;
    let persistTimer = 0;
    let dispatchingBuiltin = false;
    let extensionMountFrame = 0;
    const runtimeHost: MesurerPluginHost = host;
    const input: MeasurerProps = props;
    const target = input.portalTarget ?? document.body;
    const ownerDocument = target.ownerDocument ?? document;
    const ownerWindow = ownerDocument.defaultView ?? window;
    const queryRoot: ParentNode = target;

    const createInspectorMount = () => {
      const element = ownerDocument.createElement("div");
      element.dataset.mesurerInspectorUi = "true";
      const inspectorRoot = queryRoot.querySelector<HTMLElement>("[data-mesurer-root='true']");
      (inspectorRoot ?? target).append(element);
      let disposed = false;
      return {
        element,
        dispose() {
          if (disposed) return;
          disposed = true;
          element.remove();
        },
      };
    };

    const createWorkspaceRuntime = () => {
      const model = rendererModel;
      if (!model) throw new Error("Mesurer renderer model is unavailable for runtime bridge setup.");
      return createMesurerWorkspaceRuntime({
        model,
        ownerDocument,
        ownerWindow,
        uiRoot: target,
      });
    };

    const visibilityStyle = ownerDocument.createElement("style");
    visibilityStyle.dataset.mesurerPluginVisibility = "true";
    visibilityStyle.dataset.mesurerInspectorUi = "true";
    visibilityStyle.textContent = visibilityCss();
    target.append(visibilityStyle);

    const extensionMountHandle = createInspectorMount();
    const extensionHost = extensionMountHandle.element;
    extensionHost.dataset.mesurerExtensionHost = "true";
    extensionHost.style.display = "contents";
    const mountExtensionTools = () => {
      if (!active) return;
      const toolbar = queryRoot.querySelector<HTMLElement>("[data-mesurer-toolbar='true']");
      if (!toolbar) {
        extensionMountFrame = ownerWindow.requestAnimationFrame(mountExtensionTools);
        return;
      }
      const settingsButton = toolbar.querySelector<HTMLButtonElement>("button[aria-label^='Settings']");
      const settingsWrapper = settingsButton?.parentElement?.parentElement ?? null;
      toolbar.insertBefore(extensionHost, settingsWrapper);
      setExtensionMount(extensionHost);
    };
    mountExtensionTools();

    const dispatchBuiltin = (id: MesurerBuiltinPluginId) => {
      dispatchingBuiltin = true;
      try {
        if (id === "settings") {
          ownerWindow.dispatchEvent(new ownerWindow.KeyboardEvent("keydown", {
            key: ",",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }));
          return;
        }
        const key = BUILTIN_KEYS[id];
        if (key) {
          ownerWindow.dispatchEvent(new ownerWindow.KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
          }));
        }
      } finally {
        dispatchingBuiltin = false;
      }
    };

    const deactivateBuiltin = (id: MesurerBuiltinPluginId) => {
      const label = LABELS[id];
      if (label) {
        const button = queryRoot.querySelector<HTMLButtonElement>(toolSelector(label));
        if (button?.getAttribute("aria-pressed") === "true") dispatchBuiltin(id);
      }
      if (id === "xray") ownerDocument.body.classList.remove("mesurer-solid-xray");
    };

    const pluginStorageKey = input.persistKey ? `${input.persistKey}:plugins` : null;
    const persistPluginState = () => {
      if (!pluginStorageKey) return;
      ownerWindow.clearTimeout(persistTimer);
      persistTimer = ownerWindow.setTimeout(() => {
        try {
          ownerWindow.localStorage.setItem(pluginStorageKey, JSON.stringify(runtimeHost.state.serialize("persist")));
        } catch (error) {
          input.onPluginError?.(error, "plugin-persistence");
        }
      }, 50);
    };

    const unsubscribe = runtimeHost.subscribe((event) => {
      setRevision((value) => value + 1);
      visibilityStyle.textContent = visibilityCss();
      if (event.reason === "state" || event.reason === "history" || event.reason === "remove" || event.reason === "replace") {
        persistPluginState();
      }
      if (event.reason === "remove" && event.pluginId?.startsWith("mesurer.")) {
        deactivateBuiltin(event.pluginId.slice("mesurer.".length) as MesurerBuiltinPluginId);
      }
    });

    input.onPluginHost?.(runtimeHost);

    const loadPlugin = async (plugin: MesurerPlugin) => {
      if (!active) return;
      try {
        await runtimeHost.load(plugin);
      } catch (error) {
        input.onPluginError?.(error, plugin.id);
      }
    };

    const runBuiltinSlot = async (id: MesurerBuiltinPluginId) => {
      const replacement = replacementBuiltinTool(id);
      if (replacement) {
        await executeTool(replacement, { source: "builtin-command", builtin: id });
        return;
      }
      if (builtinEnabled(id)) dispatchBuiltin(id);
    };

    const setupPlugins = async () => {
      for (const plugin of initialBuiltinPlugins) await loadPlugin(plugin);
      if (!active) return;

      await loadPlugin({
        id: "mesurer.runtime-bridge",
        version: "0.1.0",
        provides: ["runtime:solid"],
        setup(ctx) {
          ctx.service.provide<MesurerSolidRuntimeService>("runtime:solid", {
            ownerDocument,
            ownerWindow,
            portalTarget: target,
            createWorkspaceRuntime,
            createInspectorMount,
          });
          for (const id of Object.keys(BUILTIN_KEYS) as MesurerBuiltinPluginId[]) {
            ctx.command.register(builtinCommand(id), () => runBuiltinSlot(id));
          }
          ctx.command.register(builtinCommand("settings"), () => runBuiltinSlot("settings"));
        },
      });
      if (!active) return;

      // External plugins load after the renderer capability/service exists, so they may
      // safely declare requires: ["runtime:solid"] and use ctx.service.get("runtime:solid").
      for (const plugin of initialExternalPlugins) await loadPlugin(plugin);
      if (!active) return;

      if (pluginStorageKey) {
        try {
          const stored = ownerWindow.localStorage.getItem(pluginStorageKey);
          if (stored) runtimeHost.state.restore(JSON.parse(stored) as Record<string, unknown>, "persist");
        } catch (error) {
          input.onPluginError?.(error, "plugin-persistence");
        }
      }

      if (active) {
        setReady(true);
        visibilityStyle.textContent = visibilityCss();
        input.onPluginsReady?.(runtimeHost);
      }
    };
    void setupPlugins();

    const isEditable = (eventTarget: EventTarget | null) => {
      // SAFETY: ownerWindow is the realm that owns every event target handled by this mounted renderer.
      const realm = ownerWindow as Window & typeof globalThis;
      return eventTarget instanceof realm.HTMLElement && (
        eventTarget.isContentEditable ||
        eventTarget instanceof realm.HTMLInputElement ||
        eventTarget instanceof realm.HTMLTextAreaElement ||
        eventTarget instanceof realm.HTMLSelectElement
      );
    };

    const builtinShortcut = (event: KeyboardEvent): MesurerBuiltinPluginId | null => {
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (mod && key === ",") return "settings";
      if (mod) return null;
      if (key === "s") return "select";
      if (key === "a") return "text-inspector";
      if (key === "g") return "guides";
      if (key === "p") return "color-picker";
      if (key === "x") return "xray";
      if (key === "r") return "rulers";
      return null;
    };

    const captureShortcut = (event: KeyboardEvent) => {
      if (dispatchingBuiltin || isEditable(event.target)) return;

      const slot = builtinShortcut(event);
      const replacement = slot ? replacementBuiltinTool(slot) : undefined;
      if (slot && replacement) {
        event.preventDefault();
        event.stopImmediatePropagation();
        runTool(replacement, { source: "builtin-shortcut", builtin: slot });
        return;
      }

      const key = event.key.toLowerCase();
      if ((key === "h" || key === "v") && replacementBuiltinTool("guides")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const custom = customTools().find((tool) =>
        tool.shortcut && !tool.disabled?.() && matchesShortcut(event, tool.shortcut));
      if (custom) {
        event.preventDefault();
        event.stopImmediatePropagation();
        runTool(custom);
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      if (mod && key === "z") {
        const handled = event.shiftKey ? runtimeHost.redo() : runtimeHost.undo();
        if (handled) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }

      const blocked =
        (mod && key === "," && !builtinEnabled("settings")) ||
        (key === "s" && !builtinEnabled("select")) ||
        (key === "a" && !builtinEnabled("text-inspector")) ||
        (key === "g" && !builtinEnabled("guides")) ||
        ((key === "h" || key === "v") && !builtinEnabled("guides")) ||
        (key === "p" && !builtinEnabled("color-picker")) ||
        (key === "x" && !builtinEnabled("xray")) ||
        (key === "r" && !builtinEnabled("rulers")) ||
        (event.key === "Alt" && !builtinEnabled("distance"));
      if (!blocked) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    ownerWindow.addEventListener("keydown", captureShortcut, true);

    return () => {
      active = false;
      ownerWindow.clearTimeout(persistTimer);
      ownerWindow.cancelAnimationFrame(extensionMountFrame);
      ownerWindow.removeEventListener("keydown", captureShortcut, true);
      unsubscribe();
      ownerDocument.body.classList.remove("mesurer-solid-xray");
      setExtensionMount(null);
      extensionMountHandle.dispose();
      visibilityStyle.remove();
      rendererModel = null;
      if (ownsHost) runtimeHost.dispose();
    };
  });

  return (
    <>
      <MeasurerModelRegistrationContext value={(model: MeasurerModel) => { rendererModel = model; }}>
        <LegacyMeasurer {...props} />
      </MeasurerModelRegistrationContext>
      <Show when={extensionMount()}>{(mount) => (
        <Portal mount={mount()}>
          <Show when={customTools().length > 0}>
            <div
              data-mesurer-plugin-tool-separator="true"
              aria-hidden="true"
              style={{ width: "1px", height: "20px", background: "rgb(0 0 0 / 10%)", margin: "0 2px" }}
            />
            <For each={customTools()}>{(tool) => (
              <div
                data-mesurer-tool-id={tool.id}
                data-mesurer-inspector-ui="true"
                style={{ position: "relative", display: "flex" }}
              >
                <button
                  type="button"
                  data-mesurer-tool-id={tool.id}
                  aria-label={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
                  aria-pressed={tool.active?.() ? "true" : "false"}
                  disabled={tool.disabled?.() ?? false}
                  title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                  onClick={() => runTool(tool)}
                  style={{
                    width: "32px",
                    height: "32px",
                    display: "grid",
                    "place-items": "center",
                    border: "0",
                    "border-radius": "8px",
                    outline: "none",
                    background: tool.active?.() ? "#0d99ff" : "transparent",
                    color: tool.active?.() ? "white" : tool.disabled?.() ? "rgb(0 0 0 / 30%)" : "black",
                    cursor: tool.disabled?.() ? "default" : "pointer",
                    "font-family": "ui-sans-serif, system-ui, sans-serif",
                    "font-size": "12px",
                    "font-weight": 600,
                  }}
                >
                  <Show when={tool.icon} fallback={tool.label.slice(0, 1).toUpperCase()}>{(icon) => (
                    <svg width="20" height="20" viewBox={icon().viewBox ?? "0 0 24 24"} aria-hidden="true">
                      <For each={icon().paths}>{(path) => <path d={path} fill="currentColor" />}</For>
                    </svg>
                  )}</Show>
                </button>
              </div>
            )}</For>
          </Show>
        </Portal>
      )}</Show>
    </>
  );
}
