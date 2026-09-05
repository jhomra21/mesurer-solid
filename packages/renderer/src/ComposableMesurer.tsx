import { createMemo, createSignal, onSettled, untrack } from "solid-js";
import {
  createMesurerPluginHost,
  type MesurerPlugin,
  type MesurerPluginHost,
  type PluginStateSnapshot,
  type SettingsToggleContribution,
  type ToolContribution,
  type ToolMenuItemContribution,
} from "@jhomra21/mesurer-solid-core";
import Mesurer, { type MesurerProps as BaseMesurerProps } from "./Mesurer";
import { isEditableKeyboardEvent } from "./core/events";
import {
  MesurerModelRegistrationContext,
  type MesurerModel,
} from "./model/create-mesurer-model";
import {
  MESURER_ARRANGE_ACTIVE_STATE_ID,
  MESURER_ARRANGE_PLUGIN_ID,
  arrangePlugin,
} from "./plugins/arrange";
import { composeMesurerPlugins, type MesurerBuiltinPluginId } from "./plugins/builtins";
import {
  MESURER_SCREENSHOT_PLUGIN_ID,
  screenshotPlugin,
} from "./plugins/screenshot";
import { MesurerPluginSettingsProvider } from "./plugins/settings-runtime";
import { installArrangeSelectGuard } from "./runtime/arrange-select-guard";
import type { MesurerBuiltinController } from "./runtime/builtin-actions";
import { installTextEditing } from "./runtime/text-editing";
import {
  createMesurerWorkspaceRuntime,
  type MesurerWorkspaceRuntime,
} from "./runtime/workspace-context";

export type MesurerSolidRuntimeService = {
  ownerDocument: Document;
  ownerWindow: Window;
  portalTarget: HTMLElement | ShadowRoot;
  pageTarget: HTMLElement | ShadowRoot;
  /** Current canonical page-targeting tool when exposed by the renderer bridge. */
  currentToolMode?(): MesurerModel["state"]["toolMode"];
  createWorkspaceRuntime(): MesurerWorkspaceRuntime;
  /** Create Mesurer-owned DOM that is automatically excluded from inspection/X-ray. */
  createInspectorMount(): { element: HTMLDivElement; dispose(): void };
};

export type MesurerAvailablePlugin = {
  id: string;
  label: string;
  order?: number;
  create(): MesurerPlugin | Promise<MesurerPlugin>;
  /** Settings section ids owned by this plugin when known before first load. */
  settingsIds?: string[];
  /** Plugin controls kept as API state but omitted from Settings because the plugin row owns on/off. */
  hiddenSettingsControlIds?: string[];
};

export type MesurerProps = Omit<
  BaseMesurerProps,
  "pluginTools" | "onPluginTool" | "onPluginToolMenuItem" | "isBuiltinActionDisabled" | "onBuiltinController"
> & {
  /** Public package/release version shown by Settings and official Mesurer plugin metadata. */
  version?: string;
  /** Additional plugins enabled on first mount after built-ins and the renderer bridge are available. */
  plugins?: MesurerPlugin[];
  /** Plugins Settings may load later even when they were not supplied in `plugins`. */
  availablePlugins?: MesurerAvailablePlugin[];
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
const AVAILABLE_PLUGIN_STORAGE_VERSION = 1;

const DEFAULT_AVAILABLE_PLUGINS: MesurerAvailablePlugin[] = [
  {
    id: MESURER_ARRANGE_PLUGIN_ID,
    label: "Arrange",
    order: 35,
    create: arrangePlugin,
    settingsIds: ["arrange"],
  },
  {
    id: MESURER_SCREENSHOT_PLUGIN_ID,
    label: "Screenshot",
    order: 40,
    create: screenshotPlugin,
    settingsIds: ["screenshot"],
    hiddenSettingsControlIds: ["tool"],
  },
];

type StoredAvailablePluginState = {
  version: number;
  enabled: Record<string, boolean>;
  state: Record<string, PluginStateSnapshot>;
};

const pluginLabelFromId = (id: string) => {
  const value = id.startsWith("mesurer.") ? id.slice("mesurer.".length) : id;
  return value
    .split(/[.-]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ") || id;
};

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
  const initialEnabledPluginIds = new Set(initialExternalPlugins.map((plugin) => plugin.id));
  const availablePlugins = new Map<string, MesurerAvailablePlugin>();
  for (const entry of [
    ...DEFAULT_AVAILABLE_PLUGINS,
    ...untrack(() => props.availablePlugins ?? []),
  ]) {
    availablePlugins.set(entry.id, entry);
  }
  for (const [index, plugin] of initialExternalPlugins.entries()) {
    const existing = availablePlugins.get(plugin.id);
    availablePlugins.set(plugin.id, {
      ...existing,
      id: plugin.id,
      label: existing?.label ?? pluginLabelFromId(plugin.id),
      order: existing?.order ?? 1_000 + index,
      create: () => plugin,
    });
  }
  const managedSettingsIds = new Map<string, Set<string>>(
    [...availablePlugins.values()].map((entry) => [entry.id, new Set(entry.settingsIds ?? [])]),
  );
  const managedStateIds = new Map<string, Set<string>>();
  const retainedPluginState = new Map<string, PluginStateSnapshot>();
  const busyPluginIds = new Set<string>();
  const pluginDefaults = new Map<string, Map<string, boolean>>();
  let rendererModel: MesurerModel | null = null;
  let builtinController: MesurerBuiltinController | null = null;
  let setManagedPluginEnabled: (pluginId: string, enabled: boolean) => void = () => undefined;
  let resetManagedPluginAvailability: () => Promise<void> = async () => undefined;
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

  const arrangeActive = () => {
    revision();
    return host.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
  };

  const builtinActionDisabled = (id: Exclude<MesurerBuiltinPluginId, "distance">) =>
    arrangeActive() && (id === "color-picker" || id === "text-inspector" || id === "guides");

  const customTools = createMemo(() => {
    revision();
    return host.tools().filter((tool) => {
      if (tool.hidden?.()) return false;
      if (!tool.builtin || !isBuiltinPluginId(tool.builtin)) return true;
      return tool.command !== builtinCommand(tool.builtin);
    });
  });

  const managedPluginSettings = createMemo(() => {
    revision();
    const sections = host.settings();
    return [...availablePlugins.values()]
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map((entry) => {
        const settingsIds = managedSettingsIds.get(entry.id) ?? new Set<string>();
        const hiddenControls = new Set(entry.hiddenSettingsControlIds ?? []);
        const ownedSections = sections
          .filter((section) => settingsIds.has(section.id))
          .map((section) => ({
            ...section,
            controls: (section.controls ?? []).filter((control) => !hiddenControls.has(control.id)),
          }))
          .filter((section) => (section.controls?.length ?? 0) > 0);
        return {
          id: entry.id,
          label: entry.label,
          enabled: host.has(entry.id),
          busy: busyPluginIds.has(entry.id),
          sections: ownedSections,
        };
      });
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

  const runToolMenuItem = (tool: ToolContribution, item: ToolMenuItemContribution) => {
    if (item.disabled?.()) return;
    void Promise.resolve(item.run()).catch((error) => {
      props.onPluginError?.(error, `${tool.id}.${item.id}`);
    });
  };

  const setPluginSetting = async (
    sectionId: string,
    control: SettingsToggleContribution,
    value: boolean,
  ) => {
    try {
      await control.set(value);
    } catch (error) {
      props.onPluginError?.(error, `${sectionId}.${control.id}`);
    }
  };

  const updatePluginSetting = (
    sectionId: string,
    control: SettingsToggleContribution,
    value: boolean,
  ) => {
    void setPluginSetting(sectionId, control, value);
  };

  const resetPluginSectionDefaults = async (sectionIds?: Set<string>) => {
    for (const section of host.settings()) {
      if (sectionIds && !sectionIds.has(section.id)) continue;
      const defaults = pluginDefaults.get(section.id);
      if (!defaults) continue;
      for (const control of section.controls ?? []) {
        const value = defaults.get(control.id);
        if (value !== undefined) await setPluginSetting(section.id, control, value);
      }
    }
  };

  const resetPluginSettings = async () => {
    await resetManagedPluginAvailability();
  };

  onSettled(() => {
    let active = true;
    let persistTimer = 0;
    let availabilityWriteSuspended = false;
    let lifecycleQueue: Promise<void> = Promise.resolve();
    const pendingOwnedLoads = new Set<MesurerPlugin>();
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
    const availablePluginStorageKey = `${pluginStorageKey}:availability`;
    const storedEnabled = new Map<string, boolean>();
    try {
      const stored = ownerWindow.localStorage.getItem(availablePluginStorageKey);
      if (stored) {
        // SAFETY: This versioned, namespaced payload is written only by writeAvailablePluginState below; incompatible JSON is ignored by the version gate or caught by this boundary.
        const parsed = JSON.parse(stored) as StoredAvailablePluginState;
        if (parsed?.version === AVAILABLE_PLUGIN_STORAGE_VERSION) {
          for (const [id, enabled] of Object.entries(parsed.enabled ?? {})) storedEnabled.set(id, enabled);
          for (const [id, snapshot] of Object.entries(parsed.state ?? {})) retainedPluginState.set(id, snapshot);
        }
      }
    } catch (error) {
      input.onPluginError?.(error, "plugin-availability-persistence");
    }

    const writeAvailablePluginState = () => {
      const enabled = Object.fromEntries(
        [...availablePlugins.keys()].map((id) => [id, runtimeHost.has(id)]),
      );
      const state = Object.fromEntries(retainedPluginState);
      try {
        ownerWindow.localStorage.setItem(availablePluginStorageKey, JSON.stringify({
          version: AVAILABLE_PLUGIN_STORAGE_VERSION,
          enabled,
          state,
        } satisfies StoredAvailablePluginState));
      } catch (error) {
        input.onPluginError?.(error, "plugin-availability-persistence");
      }
    };

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
      if (ready() && !availabilityWriteSuspended && (event.reason === "load" || event.reason === "remove" || event.reason === "replace")) {
        writeAvailablePluginState();
      }
      if (event.reason === "remove" && event.pluginId?.startsWith("mesurer.")) {
        const id = event.pluginId.slice("mesurer.".length);
        if (isBuiltinPluginId(id)) requireBuiltinController().deactivate(id);
      }
    });

    input.onPluginHost?.(runtimeHost);

    const loadRuntimePlugin = async (plugin: MesurerPlugin, errorId = plugin.id) => {
      if (!active) return false;
      pendingOwnedLoads.add(plugin);
      try {
        await runtimeHost.load(plugin);
      } catch (error) {
        if (active) input.onPluginError?.(error, errorId);
        return false;
      } finally {
        pendingOwnedLoads.delete(plugin);
      }
      if (!active) {
        if (runtimeHost.plugin(plugin.id) === plugin) runtimeHost.remove(plugin.id);
        return false;
      }
      return true;
    };

    const loadPlugin = (plugin: MesurerPlugin) => loadRuntimePlugin(plugin);

    const rememberPluginDefaults = (sectionIds: Set<string>) => {
      for (const section of runtimeHost.settings()) {
        if (!sectionIds.has(section.id) || pluginDefaults.has(section.id)) continue;
        pluginDefaults.set(section.id, new Map(
          (section.controls ?? []).map((control) => [control.id, control.value()] as const),
        ));
      }
    };

    const loadManagedPlugin = async (entry: MesurerAvailablePlugin) => {
      if (!active || runtimeHost.has(entry.id)) return runtimeHost.has(entry.id);
      const beforeSettings = new Set(runtimeHost.settings().map((section) => section.id));
      const beforeState = new Set(runtimeHost.describe().state.map((definition) => definition.id));
      try {
        const plugin = versionPlugin(await entry.create());
        if (!active) return false;
        if (plugin.id !== entry.id) {
          throw new Error(`Available plugin ${entry.id} created mismatched plugin ${plugin.id}.`);
        }
        if (!await loadRuntimePlugin(plugin, entry.id)) return false;
        const settingsIds = new Set(managedSettingsIds.get(entry.id) ?? entry.settingsIds ?? []);
        for (const section of runtimeHost.settings()) {
          if (!beforeSettings.has(section.id)) settingsIds.add(section.id);
        }
        managedSettingsIds.set(entry.id, settingsIds);
        const stateIds = new Set(managedStateIds.get(entry.id) ?? []);
        for (const definition of runtimeHost.describe().state) {
          if (!beforeState.has(definition.id)) stateIds.add(definition.id);
        }
        managedStateIds.set(entry.id, stateIds);
        rememberPluginDefaults(settingsIds);
        const retained = retainedPluginState.get(entry.id);
        if (retained) {
          runtimeHost.state.restore(retained, "persist");
          retainedPluginState.delete(entry.id);
        }
        return true;
      } catch (error) {
        if (active) input.onPluginError?.(error, entry.id);
        return false;
      }
    };

    const captureManagedPluginState = (pluginId: string) => {
      const ids = managedStateIds.get(pluginId);
      if (!ids?.size) return;
      const current = runtimeHost.state.serialize("persist");
      const snapshot: PluginStateSnapshot = {};
      for (const id of ids) {
        if (Object.prototype.hasOwnProperty.call(current, id)) snapshot[id] = current[id]!;
      }
      if (Object.keys(snapshot).length) retainedPluginState.set(pluginId, snapshot);
    };

    const changeManagedPlugin = async (
      pluginId: string,
      enabled: boolean,
      retainState = true,
    ) => {
      const entry = availablePlugins.get(pluginId);
      if (!entry || busyPluginIds.has(pluginId) || runtimeHost.has(pluginId) === enabled) return;
      busyPluginIds.add(pluginId);
      setRevision((value) => value + 1);
      try {
        if (enabled) {
          await loadManagedPlugin(entry);
        } else {
          if (retainState) captureManagedPluginState(pluginId);
          else retainedPluginState.delete(pluginId);
          runtimeHost.remove(pluginId);
        }
        if (!availabilityWriteSuspended) writeAvailablePluginState();
      } finally {
        busyPluginIds.delete(pluginId);
        setRevision((value) => value + 1);
      }
    };

    const enqueueLifecycle = (operation: () => Promise<void>) => {
      const next = lifecycleQueue.then(operation, operation);
      lifecycleQueue = next.catch(() => undefined);
      return next;
    };

    setManagedPluginEnabled = (pluginId, enabled) => {
      void enqueueLifecycle(async () => {
        await changeManagedPlugin(pluginId, enabled);
      });
    };
    resetManagedPluginAvailability = () => enqueueLifecycle(async () => {
      availabilityWriteSuspended = true;
      try {
        await resetPluginSectionDefaults();
        const entries = [...availablePlugins.values()]
          .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
        for (const entry of entries) {
          if (!runtimeHost.has(entry.id) && !await loadManagedPlugin(entry)) continue;
          await resetPluginSectionDefaults(managedSettingsIds.get(entry.id));
          if (initialEnabledPluginIds.has(entry.id)) {
            retainedPluginState.delete(entry.id);
          } else {
            captureManagedPluginState(entry.id);
            runtimeHost.remove(entry.id);
          }
        }
      } finally {
        availabilityWriteSuspended = false;
      }
      if (persistTimer) ownerWindow.clearTimeout(persistTimer);
      writePluginState();
      writeAvailablePluginState();
    });

    const runBuiltinSlot = async (id: Exclude<MesurerBuiltinPluginId, "distance">) => {
      if (builtinActionDisabled(id)) return;
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
          const runtimeService: MesurerSolidRuntimeService = {
            ownerDocument,
            ownerWindow,
            portalTarget: target,
            pageTarget,
            currentToolMode: () => requireModel().current.toolMode,
            createWorkspaceRuntime,
            createInspectorMount,
          };
          ctx.service.provide<MesurerSolidRuntimeService>("runtime:solid", runtimeService);
          installArrangeSelectGuard(ctx, runtimeService);
          installTextEditing(ctx, runtimeService);
          for (const id of BUILTIN_TOOL_IDS) {
            ctx.command.register(builtinCommand(id), () => runBuiltinSlot(id));
          }
        },
      });
      if (!active) return;

      for (const entry of [...availablePlugins.values()].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))) {
        const enabled = storedEnabled.has(entry.id)
          ? storedEnabled.get(entry.id) === true
          : initialEnabledPluginIds.has(entry.id);
        if (runtimeHost.has(entry.id)) {
          if (!enabled) runtimeHost.remove(entry.id);
          continue;
        }
        if (enabled) await loadManagedPlugin(entry);
        if (!active) return;
      }

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

    const builtinShortcut = (event: KeyboardEvent): Exclude<MesurerBuiltinPluginId, "distance"> | null => {
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && key === ",") return "settings";
      if (mod || event.shiftKey || event.altKey) return null;
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
      if (slot && builtinActionDisabled(slot)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const replacement = slot ? replacementBuiltinTool(slot) : undefined;
      if (slot && replacement) {
        event.preventDefault();
        event.stopImmediatePropagation();
        runTool(replacement, { source: "builtin-shortcut", builtin: slot });
        return;
      }

      const key = event.key.toLowerCase();
      if ((key === "h" || key === "v") && builtinActionDisabled("guides")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
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
      for (const plugin of pendingOwnedLoads) runtimeHost.cancelLoad(plugin);
      pendingOwnedLoads.clear();
      if (persistTimer) {
        ownerWindow.clearTimeout(persistTimer);
        writePluginState();
      }
      ownerWindow.removeEventListener("keydown", captureShortcut, true);
      unsubscribe();
      visibilityStyle.remove();
      rendererModel = null;
      builtinController = null;
      setManagedPluginEnabled = () => undefined;
      resetManagedPluginAvailability = async () => undefined;
      if (ownsHost) runtimeHost.dispose();
    };
  });

  return (
    <MesurerPluginSettingsProvider runtime={{ plugins: managedPluginSettings, version: () => version, setEnabled: (pluginId, enabled) => setManagedPluginEnabled(pluginId, enabled), update: updatePluginSetting, reset: resetPluginSettings }}>
      <MesurerModelRegistrationContext value={(model: MesurerModel) => { rendererModel = model; }}>
        <Mesurer
          {...props}
          pluginTools={customTools()}
          onPluginTool={(tool) => runTool(tool)}
          onPluginToolMenuItem={runToolMenuItem}
          isBuiltinActionDisabled={builtinActionDisabled}
          onBuiltinController={(controller) => { builtinController = controller; }}
        />
      </MesurerModelRegistrationContext>
    </MesurerPluginSettingsProvider>
  );
}
