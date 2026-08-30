import { createMemo, createSignal, onSettled, untrack } from "solid-js";
import {
  createMesurerPluginHost,
  type MesurerPlugin,
  type MesurerPluginHost,
  type PluginStateSnapshot,
  type SettingsToggleContribution,
  type ToolContribution,
} from "@jhomra21/mesurer-solid-core";
import Mesurer, { type MesurerProps as BaseMesurerProps } from "./Mesurer";
import { isEditableKeyboardEvent } from "./core/events";
import {
  MesurerModelRegistrationContext,
  type MesurerModel,
} from "./model/create-mesurer-model";
import { composeMesurerPlugins, type MesurerBuiltinPluginId } from "./plugins/builtins";
import { MesurerPluginSettingsProvider } from "./plugins/settings-runtime";
import type { MesurerBuiltinController } from "./runtime/builtin-actions";
import {
  createMesurerWorkspaceRuntime,
  type MesurerWorkspaceRuntime,
} from "./runtime/workspace-context";

export type MesurerSolidRuntimeService = {
  ownerDocument: Document;
  ownerWindow: Window;
  portalTarget: HTMLElement | ShadowRoot;
  pageTarget: HTMLElement | ShadowRoot;
  createWorkspaceRuntime(): MesurerWorkspaceRuntime;
  /** Create Mesurer-owned DOM that is automatically excluded from inspection/X-ray. */
  createInspectorMount(): { element: HTMLDivElement; dispose(): void };
};

export type MesurerProps = Omit<
  BaseMesurerProps,
  "pluginTools" | "onPluginTool" | "onBuiltinController"
> & {
  /** Public package/release version shown by Settings and official Mesurer plugin metadata. */
  version?: string;
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
  onPluginError?: (cause: unknown, pluginId: string) => void;
};

const BUILTIN_TOOL_IDS = [
  "select",
  "xray",
  "color-picker",
  "rulers",
  "text-inspector",
  "guides",
  "settings",
] as const satisfies readonly Exclude<MesurerBuiltinPluginId, "distance">[];
const DEFAULT_PLUGIN_STORAGE_KEY = "mesurer-plugin-settings";

const isBuiltinPluginId = (value: string): value is MesurerBuiltinPluginId =>
  value === "select"
  || value === "xray"
  || value === "color-picker"
  || value === "rulers"
  || value === "text-inspector"
  || value === "guides"
  || value === "distance"
  || value === "settings";

const builtinCommand = (id: MesurerBuiltinPluginId) => `builtin.${id}`;

type ToolInvocationSource =
  | string
  | { source: string; builtin: MesurerBuiltinPluginId };

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

export default function ComposableMesurer(props: MesurerProps) {
  const providedHost = untrack(() => props.pluginHost);
  const host: MesurerPluginHost = providedHost ?? createMesurerPluginHost();
  const ownsHost = !providedHost;
  const version = untrack(() => props.version ?? "0.1.0");
  const versionPlugin = (plugin: MesurerPlugin): MesurerPlugin =>
    props.version && plugin.id.startsWith("mesurer.") ? { ...plugin, version } : plugin;
  const initialExclusions = new Set(untrack(() => props.excludePlugins ?? []));
  const initialBuiltinPlugins = untrack(() => composeMesurerPlugins([], props.excludePlugins ?? []).map(versionPlugin));
  const initialExternalPlugins = untrack(() => [...(props.plugins ?? [])].map(versionPlugin));
  const pluginDefaults = new Map<string, Map<string, boolean>>();
  let rendererModel: MesurerModel | null = null;
  let builtinController: MesurerBuiltinController | null = null;
  const [revision, setRevision] = createSignal(0);
  const [ready, setReady] = createSignal(false);

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
      if (tool.hidden?.()) return false;
      if (!tool.builtin || !isBuiltinPluginId(tool.builtin)) return true;
      return tool.command !== builtinCommand(tool.builtin);
    });
  });

  const customSettings = createMemo(() => {
    revision();
    return host.settings().filter((section) => (section.controls?.length ?? 0) > 0);
  });

  const visibilityCss = () => {
    revision();
    const rules: string[] = [];
    for (const id of BUILTIN_TOOL_IDS) {
      if (!builtinEnabled(id) || replacementBuiltinTool(id)) {
        rules.push(`[data-mesurer-builtin='${id}']{display:none!important}`);
      }
    }
    if (!builtinEnabled("guides") || replacementBuiltinTool("guides")) {
      rules.push("[data-mesurer-builtin='guides-menu']{display:none!important}");
    }
    if (!builtinEnabled("guides")) rules.push("[data-mesurer-guide='true']{display:none!important}");
    if (!builtinEnabled("distance")) rules.push("[data-mesurer-distance='true']{display:none!important}");
    if (!builtinEnabled("rulers")) rules.push("[data-mesurer-rulers='true']{display:none!important}");
    if (!builtinEnabled("color-picker")) rules.push(".mesurer-color-picker{display:none!important}");
    return rules.join("\n");
  };

  const executeTool = async (tool: ToolContribution, source: ToolInvocationSource = "toolbar") => {
    if (tool.disabled?.()) return;
    try {
      await host.command.execute(tool.command, undefined, { source, toolId: tool.id });
    } catch (error) {
      props.onPluginError?.(error, tool.id);
      throw error;
    }
  };

  const runTool = (tool: ToolContribution, source: ToolInvocationSource = "toolbar") => {
    void executeTool(tool, source).catch(() => undefined);
  };

  const updatePluginSetting = (
    sectionId: string,
    control: SettingsToggleContribution,
    value: boolean,
  ) => {
    void Promise.resolve(control.set(value)).catch((error) => {
      props.onPluginError?.(error, `${sectionId}.${control.id}`);
    });
  };

  const resetPluginSettings = () => {
    for (const section of host.settings()) {
      const defaults = pluginDefaults.get(section.id);
      if (!defaults) continue;
      for (const control of section.controls ?? []) {
        const value = defaults.get(control.id);
        if (value !== undefined) updatePluginSetting(section.id, control, value);
      }
    }
  };

  onSettled(() => {
    let active = true;
    let persistTimer = 0;
    const runtimeHost: MesurerPluginHost = host;
    const input: MesurerProps = props;
    const target = input.portalTarget ?? document.body;
    const ownerDocument = target.ownerDocument ?? document;
    const ownerWindow = ownerDocument.defaultView ?? window;
    const pageTarget = input.pageTarget ?? ownerDocument.body;
    const queryRoot: ParentNode = target;

    const requireModel = () => {
      if (!rendererModel) throw new Error("Mesurer renderer model is unavailable for runtime bridge setup.");
      return rendererModel;
    };
    const requireBuiltinController = () => {
      if (!builtinController) throw new Error("Mesurer built-in controller is unavailable for runtime bridge setup.");
      return builtinController;
    };

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

    const createWorkspaceRuntime = () => createMesurerWorkspaceRuntime({
      model: requireModel(),
      ownerDocument,
      ownerWindow,
      uiRoot: target,
      pageTarget,
    });

    const visibilityStyle = ownerDocument.createElement("style");
    visibilityStyle.dataset.mesurerPluginVisibility = "true";
    visibilityStyle.dataset.mesurerInspectorUi = "true";
    visibilityStyle.textContent = visibilityCss();
    target.append(visibilityStyle);

    const pluginStorageKey = input.persistKey ? `${input.persistKey}:plugins` : DEFAULT_PLUGIN_STORAGE_KEY;
    const writePluginState = () => {
      persistTimer = 0;
      try {
        ownerWindow.localStorage.setItem(pluginStorageKey, JSON.stringify(runtimeHost.state.serialize("persist")));
      } catch (error) {
        input.onPluginError?.(error, "plugin-persistence");
      }
    };
    const persistPluginState = () => {
      ownerWindow.clearTimeout(persistTimer);
      persistTimer = ownerWindow.setTimeout(writePluginState, 50);
    };

    const unsubscribe = runtimeHost.subscribe((event) => {
      setRevision((value) => value + 1);
      visibilityStyle.textContent = visibilityCss();
      if (event.reason === "state" || event.reason === "history" || event.reason === "remove" || event.reason === "replace") {
        persistPluginState();
      }
      if (event.reason === "remove" && event.pluginId?.startsWith("mesurer.")) {
        const id = event.pluginId.slice("mesurer.".length);
        if (isBuiltinPluginId(id)) requireBuiltinController().deactivate(id);
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

    const runBuiltinSlot = async (id: Exclude<MesurerBuiltinPluginId, "distance">) => {
      const replacement = replacementBuiltinTool(id);
      if (replacement) {
        await executeTool(replacement, { source: "builtin-command", builtin: id });
        return;
      }
      if (!builtinEnabled(id)) return;
      await requireBuiltinController().run(id);
    };

    const setupPlugins = async () => {
      for (const plugin of initialBuiltinPlugins) await loadPlugin(plugin);
      if (!active) return;

      await loadPlugin({
        id: "mesurer.runtime-bridge",
        version,
        provides: ["runtime:solid"],
        setup(ctx) {
          ctx.service.provide<MesurerSolidRuntimeService>("runtime:solid", {
            ownerDocument,
            ownerWindow,
            portalTarget: target,
            pageTarget,
            createWorkspaceRuntime,
            createInspectorMount,
          });
          for (const id of BUILTIN_TOOL_IDS) {
            ctx.command.register(builtinCommand(id), () => runBuiltinSlot(id));
          }
        },
      });
      if (!active) return;

      for (const plugin of initialExternalPlugins) await loadPlugin(plugin);
      if (!active) return;

      pluginDefaults.clear();
      for (const section of runtimeHost.settings()) {
        pluginDefaults.set(section.id, new Map(
          (section.controls ?? []).map((control) => [control.id, control.value()] as const),
        ));
      }

      try {
        const stored = ownerWindow.localStorage.getItem(pluginStorageKey);
        if (stored) {
          const snapshot: PluginStateSnapshot = JSON.parse(stored);
          runtimeHost.state.restore(snapshot, "persist");
        }
      } catch (error) {
        input.onPluginError?.(error, "plugin-persistence");
      }

      if (active) {
        setReady(true);
        visibilityStyle.textContent = visibilityCss();
        input.onPluginsReady?.(runtimeHost);
      }
    };
    void setupPlugins();

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
      if (isEditableKeyboardEvent(event, ownerWindow)) return;

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
      if (persistTimer) {
        ownerWindow.clearTimeout(persistTimer);
        writePluginState();
      }
      ownerWindow.removeEventListener("keydown", captureShortcut, true);
      unsubscribe();
      visibilityStyle.remove();
      rendererModel = null;
      builtinController = null;
      if (ownsHost) runtimeHost.dispose();
    };
  });

  return (
    <MesurerPluginSettingsProvider runtime={{ sections: customSettings, version: () => version, update: updatePluginSetting, reset: resetPluginSettings }}>
      <MesurerModelRegistrationContext value={(model: MesurerModel) => { rendererModel = model; }}>
        <Mesurer
          {...props}
          pluginTools={customTools()}
          onPluginTool={(tool) => runTool(tool)}
          onBuiltinController={(controller) => { builtinController = controller; }}
        />
      </MesurerModelRegistrationContext>
    </MesurerPluginSettingsProvider>
  );
}
