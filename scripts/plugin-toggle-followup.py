from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one replacement, found {count}\n--- needle ---\n{old}")
    target.write_text(text.replace(old, new, 1))


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content)


write(
    "packages/renderer/src/plugins/settings-runtime.tsx",
    '''import { createContext, useContext, type Accessor, type ParentComponent } from "solid-js";
import type {
  SettingsContribution,
  SettingsToggleContribution,
} from "@jhomra21/mesurer-solid-core";

export type MesurerPluginSettingsEntry = {
  id: string;
  label: string;
  enabled: boolean;
  busy: boolean;
  sections: SettingsContribution[];
};

export type MesurerPluginSettingsRuntime = {
  plugins: Accessor<MesurerPluginSettingsEntry[]>;
  version: Accessor<string>;
  setEnabled(pluginId: string, enabled: boolean): void;
  update(sectionId: string, control: SettingsToggleContribution, value: boolean): void;
  reset(): void;
};

const PluginSettingsContext = createContext<MesurerPluginSettingsRuntime | null>(null);

export const MesurerPluginSettingsProvider: ParentComponent<{
  runtime: MesurerPluginSettingsRuntime;
}> = (props) => (
  <PluginSettingsContext value={props.runtime}>
    {props.children}
  </PluginSettingsContext>
);

export const useMesurerPluginSettings = () => useContext(PluginSettingsContext);
''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''import { composeMesurerPlugins, type MesurerBuiltinPluginId } from "./plugins/builtins";
import { MesurerPluginSettingsProvider } from "./plugins/settings-runtime";''',
    '''import {
  MESURER_ARRANGE_PLUGIN_ID,
  arrangePlugin,
} from "./plugins/arrange";
import { composeMesurerPlugins, type MesurerBuiltinPluginId } from "./plugins/builtins";
import {
  MESURER_SCREENSHOT_PLUGIN_ID,
  screenshotPlugin,
} from "./plugins/screenshot";
import { MesurerPluginSettingsProvider } from "./plugins/settings-runtime";''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''export type MesurerSolidRuntimeService = {
  ownerDocument: Document;
  ownerWindow: Window;
  portalTarget: HTMLElement | ShadowRoot;
  pageTarget: HTMLElement | ShadowRoot;
  createWorkspaceRuntime(): MesurerWorkspaceRuntime;
  /** Create Mesurer-owned DOM that is automatically excluded from inspection/X-ray. */
  createInspectorMount(): { element: HTMLDivElement; dispose(): void };
};

export type MesurerProps = Omit<''',
    '''export type MesurerSolidRuntimeService = {
  ownerDocument: Document;
  ownerWindow: Window;
  portalTarget: HTMLElement | ShadowRoot;
  pageTarget: HTMLElement | ShadowRoot;
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

export type MesurerProps = Omit<''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''  /** Additional plugins loaded after built-ins and the renderer bridge are available. */
  plugins?: MesurerPlugin[];
  /** Remove built-in features without forking the renderer. */''',
    '''  /** Additional plugins enabled on first mount after built-ins and the renderer bridge are available. */
  plugins?: MesurerPlugin[];
  /** Plugins Settings may load later even when they were not supplied in `plugins`. */
  availablePlugins?: MesurerAvailablePlugin[];
  /** Remove built-in features without forking the renderer. */''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''const DEFAULT_PLUGIN_STORAGE_KEY = "mesurer-plugin-settings";

const isBuiltinPluginId =''',
    '''const DEFAULT_PLUGIN_STORAGE_KEY = "mesurer-plugin-settings";
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

const isBuiltinPluginId =''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''  const initialBuiltinPlugins = untrack(() => composeMesurerPlugins([], props.excludePlugins ?? []).map(versionPlugin));
  const initialExternalPlugins = untrack(() => [...(props.plugins ?? [])].map(versionPlugin));
  const pluginDefaults = new Map<string, Map<string, boolean>>();
  let rendererModel: MesurerModel | null = null;
  let builtinController: MesurerBuiltinController | null = null;
  const [revision, setRevision] = createSignal(0);
  const [ready, setReady] = createSignal(false);''',
    '''  const initialBuiltinPlugins = untrack(() => composeMesurerPlugins([], props.excludePlugins ?? []).map(versionPlugin));
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
  let resetManagedPluginAvailability = () => undefined;
  const [revision, setRevision] = createSignal(0);
  const [ready, setReady] = createSignal(false);''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''  const customSettings = createMemo(() => {
    revision();
    return host.settings().filter((section) => (section.controls?.length ?? 0) > 0);
  });

  const visibilityCss = () => {''',
    '''  const managedPluginSettings = createMemo(() => {
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

  const visibilityCss = () => {''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''  const resetPluginSettings = () => {
    for (const section of host.settings()) {
      const defaults = pluginDefaults.get(section.id);
      if (!defaults) continue;
      for (const control of section.controls ?? []) {
        const value = defaults.get(control.id);
        if (value !== undefined) updatePluginSetting(section.id, control, value);
      }
    }
  };''',
    '''  const resetPluginSettings = () => {
    for (const section of host.settings()) {
      const defaults = pluginDefaults.get(section.id);
      if (!defaults) continue;
      for (const control of section.controls ?? []) {
        const value = defaults.get(control.id);
        if (value !== undefined) updatePluginSetting(section.id, control, value);
      }
    }
    resetManagedPluginAvailability();
  };''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''    const pluginStorageKey = input.persistKey ? `${input.persistKey}:plugins` : DEFAULT_PLUGIN_STORAGE_KEY;
    const writePluginState = () => {''',
    '''    const pluginStorageKey = input.persistKey ? `${input.persistKey}:plugins` : DEFAULT_PLUGIN_STORAGE_KEY;
    const availablePluginStorageKey = `${pluginStorageKey}:availability`;
    const storedEnabled = new Map<string, boolean>();
    try {
      const stored = ownerWindow.localStorage.getItem(availablePluginStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredAvailablePluginState;
        if (parsed?.version === AVAILABLE_PLUGIN_STORAGE_VERSION) {
          for (const [id, enabled] of Object.entries(parsed.enabled ?? {})) {
            if (typeof enabled === "boolean") storedEnabled.set(id, enabled);
          }
          for (const [id, snapshot] of Object.entries(parsed.state ?? {})) {
            if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
              retainedPluginState.set(id, snapshot);
            }
          }
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

    const writePluginState = () => {''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''    const unsubscribe = runtimeHost.subscribe((event) => {
      setRevision((value) => value + 1);
      visibilityStyle.textContent = visibilityCss();
      if (event.reason === "state" || event.reason === "history" || event.reason === "remove" || event.reason === "replace") {
        persistPluginState();
      }
      if (event.reason === "remove" && event.pluginId?.startsWith("mesurer.")) {
        const id = event.pluginId.slice("mesurer.".length);
        if (isBuiltinPluginId(id)) requireBuiltinController().deactivate(id);
      }
    });''',
    '''    const unsubscribe = runtimeHost.subscribe((event) => {
      setRevision((value) => value + 1);
      visibilityStyle.textContent = visibilityCss();
      if (event.reason === "state" || event.reason === "history" || event.reason === "remove" || event.reason === "replace") {
        persistPluginState();
      }
      if (ready() && (event.reason === "load" || event.reason === "remove" || event.reason === "replace")) {
        writeAvailablePluginState();
      }
      if (event.reason === "remove" && event.pluginId?.startsWith("mesurer.")) {
        const id = event.pluginId.slice("mesurer.".length);
        if (isBuiltinPluginId(id)) requireBuiltinController().deactivate(id);
      }
    });''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''    const loadPlugin = async (plugin: MesurerPlugin) => {
      if (!active) return;
      try {
        await runtimeHost.load(plugin);
      } catch (error) {
        input.onPluginError?.(error, plugin.id);
      }
    };

    const runBuiltinSlot = async''',
    '''    const loadPlugin = async (plugin: MesurerPlugin) => {
      if (!active) return;
      try {
        await runtimeHost.load(plugin);
      } catch (error) {
        input.onPluginError?.(error, plugin.id);
      }
    };

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
        if (plugin.id !== entry.id) {
          throw new Error(`Available plugin ${entry.id} created mismatched plugin ${plugin.id}.`);
        }
        await runtimeHost.load(plugin);
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
        if (retained) runtimeHost.state.restore(retained, "persist");
        return true;
      } catch (error) {
        input.onPluginError?.(error, entry.id);
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
        writeAvailablePluginState();
      } finally {
        busyPluginIds.delete(pluginId);
        setRevision((value) => value + 1);
      }
    };

    setManagedPluginEnabled = (pluginId, enabled) => {
      void changeManagedPlugin(pluginId, enabled);
    };
    resetManagedPluginAvailability = () => {
      retainedPluginState.clear();
      try {
        ownerWindow.localStorage.removeItem(availablePluginStorageKey);
      } catch (error) {
        input.onPluginError?.(error, "plugin-availability-persistence");
      }
      for (const entry of availablePlugins.values()) {
        void changeManagedPlugin(entry.id, initialEnabledPluginIds.has(entry.id), false);
      }
    };

    const runBuiltinSlot = async''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''      for (const plugin of initialExternalPlugins) await loadPlugin(plugin);
      if (!active) return;

      pluginDefaults.clear();''',
    '''      for (const entry of [...availablePlugins.values()].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))) {
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

      pluginDefaults.clear();''',
)

replace_once(
    "packages/renderer/src/ComposableMesurer.tsx",
    '''      if (ownsHost) runtimeHost.dispose();
    };
  });

  return (
    <MesurerPluginSettingsProvider runtime={{ sections: customSettings, version: () => version, update: updatePluginSetting, reset: resetPluginSettings }}>''',
    '''      setManagedPluginEnabled = () => undefined;
      resetManagedPluginAvailability = () => undefined;
      if (ownsHost) runtimeHost.dispose();
    };
  });

  return (
    <MesurerPluginSettingsProvider runtime={{ plugins: managedPluginSettings, version: () => version, setEnabled: setManagedPluginEnabled, update: updatePluginSetting, reset: resetPluginSettings }}>''',
)

replace_once(
    "packages/renderer/src/index.ts",
    '''export type { MesurerProps, MesurerSolidRuntimeService } from "./ComposableMesurer";''',
    '''export type { MesurerAvailablePlugin, MesurerProps, MesurerSolidRuntimeService } from "./ComposableMesurer";''',
)

replace_once(
    "packages/renderer/src/components/SettingsPanel.tsx",
    '''  const pluginSettings = useMesurerPluginSettings();
  const pluginSections = () => pluginSettings?.sections() ?? [];
  const version = () => pluginSettings?.version() ?? "0.1.0";''',
    '''  const pluginSettings = useMesurerPluginSettings();
  const pluginEntries = () => pluginSettings?.plugins() ?? [];
  const version = () => pluginSettings?.version() ?? "0.1.0";''',
)

old_plugin_block = '''          <Show when={pluginSections().length > 0}>
            <div
              class="msr:col-span-2 msr:mt-1 msr:overflow-hidden msr:rounded-[6px] msr:bg-ink-50/40"
              data-mesurer-plugin-settings="true"
            >
              <button
                type="button"
                data-mesurer-plugin-settings-disclosure="plugins"
                aria-expanded={pluginsExpanded() ? "true" : "false"}
                class="msr:flex msr:h-7 msr:w-full msr:items-center msr:gap-2 msr:px-2 msr:text-left msr:text-[11px] msr:font-medium msr:text-ink-700 msr:hover:bg-ink-50"
                onClick={() => setPluginsExpanded((value) => !value)}
              >
                <span class="msr:flex-1">Plugins</span>
                <span class="msr:text-[10px] msr:font-normal msr:text-ink-400">{pluginSections().length}</span>
                <CaretDownIcon size={10} class={pluginsExpanded() ? "msr:rotate-180" : ""} />
              </button>
              <Show when={pluginsExpanded()}>
                <div class="msr:flex msr:flex-col" data-mesurer-plugin-settings-list="true">
                  <For each={pluginSections()}>{(section) => {
                    const expanded = () => expandedPluginSections().includes(section.id);
                    const toggleExpanded = () => setExpandedPluginSections((current) =>
                      current.includes(section.id)
                        ? current.filter((id) => id !== section.id)
                        : [...current, section.id]);
                    return (
                      <div data-mesurer-plugin-settings-section={section.id} class="msr:relative">
                        <button
                          type="button"
                          data-mesurer-plugin-settings-disclosure={section.id}
                          aria-expanded={expanded() ? "true" : "false"}
                          class="msr:flex msr:h-7 msr:w-full msr:items-center msr:gap-2 msr:px-2 msr:text-left msr:text-[11px] msr:text-ink-600 msr:hover:bg-ink-50"
                          onClick={toggleExpanded}
                        >
                          <span class="msr:min-w-0 msr:flex-1 msr:truncate">{section.label}</span>
                          <CaretDownIcon size={9} class={expanded() ? "msr:rotate-180" : ""} />
                        </button>
                        <Show when={expanded()}>
                          <div class="msr:flex msr:flex-col msr:gap-0.5 msr:bg-white/60 msr:px-2 msr:py-1" data-mesurer-plugin-settings-controls={section.id}>
                            <For each={section.controls ?? []}>{(control) => (
                              <PluginSettingsSwitch
                                label={control.label}
                                checked={control.value()}
                                disabled={control.disabled?.() ?? false}
                                onChange={(value) => pluginSettings?.update(section.id, control, value)}
                              />
                            )}</For>
                          </div>
                        </Show>
                      </div>
                    );
                  }}</For>
                </div>
              </Show>
            </div>
          </Show>'''

new_plugin_block = '''          <Show when={pluginEntries().length > 0}>
            <div
              class="msr:col-span-2 msr:mt-1 msr:overflow-hidden msr:rounded-[6px] msr:bg-ink-50/40"
              data-mesurer-plugin-settings="true"
            >
              <button
                type="button"
                data-mesurer-plugin-settings-disclosure="plugins"
                aria-expanded={pluginsExpanded() ? "true" : "false"}
                class="msr:flex msr:h-7 msr:w-full msr:items-center msr:gap-2 msr:px-2 msr:text-left msr:text-[11px] msr:font-medium msr:text-ink-700 msr:hover:bg-ink-50"
                onClick={() => setPluginsExpanded((value) => !value)}
              >
                <span class="msr:flex-1">Plugins</span>
                <span class="msr:text-[10px] msr:font-normal msr:text-ink-400">{pluginEntries().length}</span>
                <CaretDownIcon size={10} class={pluginsExpanded() ? "msr:rotate-180" : ""} />
              </button>
              <Show when={pluginsExpanded()}>
                <div class="msr:flex msr:flex-col" data-mesurer-plugin-settings-list="true">
                  <For each={pluginEntries()}>{(plugin) => {
                    const expanded = () => expandedPluginSections().includes(plugin.id);
                    const canExpand = () => plugin.enabled && plugin.sections.length > 0;
                    const toggleExpanded = () => {
                      if (!canExpand()) return;
                      setExpandedPluginSections((current) =>
                        current.includes(plugin.id)
                          ? current.filter((id) => id !== plugin.id)
                          : [...current, plugin.id]);
                    };
                    const setEnabled = (enabled: boolean) => {
                      if (!enabled) {
                        setExpandedPluginSections((current) => current.filter((id) => id !== plugin.id));
                      }
                      pluginSettings?.setEnabled(plugin.id, enabled);
                    };
                    return (
                      <div data-mesurer-plugin-settings-section={plugin.id} class="msr:relative">
                        <div class="msr:flex msr:h-7 msr:w-full msr:items-center msr:hover:bg-ink-50">
                          <button
                            type="button"
                            role="switch"
                            aria-label={plugin.label}
                            aria-checked={plugin.enabled ? "true" : "false"}
                            disabled={plugin.busy}
                            data-mesurer-plugin-toggle={plugin.id}
                            class="msr:flex msr:h-full msr:min-w-0 msr:flex-1 msr:items-center msr:gap-2 msr:px-2 msr:text-left msr:text-[11px] msr:text-ink-600 msr:disabled:opacity-45"
                            onClick={() => setEnabled(!plugin.enabled)}
                          >
                            <span class="msr:min-w-0 msr:flex-1 msr:truncate msr:whitespace-nowrap">{plugin.label}</span>
                            <span
                              aria-hidden="true"
                              data-checked={plugin.enabled ? "true" : undefined}
                              class={`mesurer-switch-track msr:flex msr:h-[14px] msr:w-[26px] msr:shrink-0 msr:items-center msr:rounded-full msr:border msr:p-px msr:transition-colors ${plugin.enabled ? "msr:border-[#0d99ff] msr:bg-[#0d99ff]" : "msr:border-ink-200 msr:bg-ink-50"}`}
                            >
                              <span class="msr:block msr:size-[10px] msr:shrink-0 msr:rounded-full msr:bg-white msr:shadow-sm msr:transition-transform" style={{ transform: `translateX(${plugin.enabled ? 12 : 0}px)` }} />
                            </span>
                          </button>
                          <Show when={canExpand()}>
                            <button
                              type="button"
                              aria-label={`${plugin.label} settings`}
                              data-mesurer-plugin-settings-disclosure={plugin.id}
                              aria-expanded={expanded() ? "true" : "false"}
                              class="msr:flex msr:size-7 msr:shrink-0 msr:items-center msr:justify-center msr:text-ink-500 msr:hover:text-ink-700 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_#0d99ff]"
                              onClick={toggleExpanded}
                            >
                              <CaretDownIcon size={9} class={expanded() ? "msr:rotate-180" : ""} />
                            </button>
                          </Show>
                        </div>
                        <Show when={canExpand() && expanded()}>
                          <div class="msr:flex msr:flex-col msr:gap-0.5 msr:bg-white/60 msr:px-2 msr:py-1" data-mesurer-plugin-settings-controls={plugin.id}>
                            <For each={plugin.sections}>{(section) => (
                              <For each={section.controls ?? []}>{(control) => (
                                <PluginSettingsSwitch
                                  label={control.label}
                                  checked={control.value()}
                                  disabled={control.disabled?.() ?? false}
                                  onChange={(value) => pluginSettings?.update(section.id, control, value)}
                                />
                              )}</For>
                            )}</For>
                          </div>
                        </Show>
                      </div>
                    );
                  }}</For>
                </div>
              </Show>
            </div>
          </Show>'''

replace_once(
    "packages/renderer/src/components/SettingsPanel.tsx",
    old_plugin_block,
    new_plugin_block,
)

replace_once(
    "packages/mesurer/src/index.tsx",
    '''  type MesurerProps as RendererMesurerProps,
} from "@jhomra21/mesurer-solid-renderer";''',
    '''  type MesurerAvailablePlugin as RendererMesurerAvailablePlugin,
  type MesurerProps as RendererMesurerProps,
} from "@jhomra21/mesurer-solid-renderer";''',
)

replace_once(
    "packages/mesurer/src/index.tsx",
    '''const ARRANGE_SERVICE_ID = "arrange";

export type ColorPickerFormat''',
    '''const ARRANGE_SERVICE_ID = "arrange";

export type MesurerAvailablePlugin = RendererMesurerAvailablePlugin;

const firstPartyAvailablePlugins = (): MesurerAvailablePlugin[] => [{
  id: MESURER_CONTEXT_PLUGIN_ID,
  label: "Context",
  order: 30,
  create: () => contextPlugin(),
  settingsIds: ["context"],
  hiddenSettingsControlIds: ["ui"],
}];

export type ColorPickerFormat''',
)

replace_once(
    "packages/mesurer/src/index.tsx",
    '''  plugins?: MesurerPlugin[];
  excludePlugins?: MesurerBuiltinPluginId[];''',
    '''  plugins?: MesurerPlugin[];
  /** Additional plugins that Settings may load on demand even when initially disabled. */
  availablePlugins?: MesurerAvailablePlugin[];
  excludePlugins?: MesurerBuiltinPluginId[];''',
)

replace_once(
    "packages/mesurer/src/index.tsx",
    '''    onPluginHost,
    onPluginsReady,
    ...mesurerProps
  } = options;''',
    '''    onPluginHost,
    onPluginsReady,
    availablePlugins = [],
    ...mesurerProps
  } = options;''',
)

replace_once(
    "packages/mesurer/src/index.tsx",
    '''  const rendererProps: RendererMesurerProps = { ...mesurerProps, version: MESURER_VERSION };''',
    '''  const rendererProps: RendererMesurerProps = {
    ...mesurerProps,
    version: MESURER_VERSION,
    availablePlugins: [...firstPartyAvailablePlugins(), ...availablePlugins],
  };''',
)

replace_once(
    "examples/basic/src/plugin-settings.ts",
    '''const pluginStorageKey = "mesurer-plugin-settings";
const url = new URL(window.location.href);
if (url.searchParams.get("reset") === "1") {
  window.localStorage.removeItem(pluginStorageKey);
}''',
    '''const pluginStorageKey = "mesurer-plugin-settings";
const pluginAvailabilityStorageKey = `${pluginStorageKey}:availability`;
const url = new URL(window.location.href);
if (url.searchParams.get("reset") === "1") {
  window.localStorage.removeItem(pluginStorageKey);
  window.localStorage.removeItem(pluginAvailabilityStorageKey);
}''',
)

replace_once(
    "examples/basic/src/plugin-settings.ts",
    '''const screenshot = subject.pluginHost?.service.get<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);
if (!screenshot) throw new Error("Screenshot service did not mount in plugin settings fixture");

type PluginSettingsHarness = {
  subject: MountedMesurer;
  screenshot: MesurerScreenshotService;
  captures: CapturePresentation[];
  version: string;
};''',
    '''const screenshot = () => subject.pluginHost?.service.get<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);
if (!screenshot()) throw new Error("Screenshot service did not mount in plugin settings fixture");

type PluginSettingsHarness = {
  subject: MountedMesurer;
  screenshot(): MesurerScreenshotService | undefined;
  captures: CapturePresentation[];
  version: string;
};''',
)

write(
    "visual-parity/plugin-settings-contract.mjs",
    '''import { chromium } from "playwright";

const baseUrl = process.env.PLUGIN_SETTINGS_URL ?? "http://127.0.0.1:4174/plugin-settings.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const island = () => page.locator("[data-mesurer-island='true']");
const waitForTool = async (id, visible) => {
  await page.waitForFunction(({ id, visible }) => {
    const islandElement = document.querySelector("[data-mesurer-island='true']");
    const root = islandElement?.shadowRoot ?? islandElement;
    const button = root?.querySelector(`[data-mesurer-tool-id='${id}'] button`);
    const isVisible = button instanceof HTMLElement && button.getClientRects().length > 0;
    return isVisible === visible;
  }, { id, visible });
};
const pluginLoaded = async (id) => page.evaluate((pluginId) =>
  window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.plugins.some((plugin) => plugin.id === pluginId) ?? false,
  id,
);
const waitForPlugin = async (id, loaded) => {
  await page.waitForFunction(({ id, loaded }) =>
    (window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.plugins.some((plugin) => plugin.id === id) ?? false) === loaded,
    { id, loaded },
  );
};
const openSettings = async () => {
  const settingsButton = island().locator("[data-mesurer-builtin='settings'] button").first();
  await settingsButton.waitFor({ state: "visible" });
  if (!(await island().getByRole("dialog", { name: "Settings" }).isVisible())) await settingsButton.click();
  const dialog = island().getByRole("dialog", { name: "Settings" });
  await dialog.waitFor({ state: "visible" });
  const generalTab = dialog.getByRole("tab", { name: "General" });
  if ((await generalTab.getAttribute("aria-selected")) !== "true") await generalTab.click();
  const pluginsDisclosure = dialog.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  if ((await pluginsDisclosure.getAttribute("aria-expanded")) !== "true") await pluginsDisclosure.click();
  return dialog;
};
const pluginToggle = (dialog, label) => dialog.getByRole("switch", { name: label, exact: true });
const settingSwitch = (dialog, label) => dialog.getByRole("switch", { name: new RegExp(`^${label}(?:\\s|$)`) });
const checked = async (control) => (await control.getAttribute("aria-checked")) === "true";
const expectChecked = async (control, expected, label) => {
  const actual = await checked(control);
  if (actual !== expected) throw new Error(`${label} expected ${expected ? "on" : "off"}, got ${actual ? "on" : "off"}`);
};
const expectNoDisclosure = async (dialog, id, label) => {
  const disclosure = dialog.locator(`[data-mesurer-plugin-settings-disclosure='${id}']`);
  if ((await disclosure.count()) !== 0) throw new Error(`${label} unexpectedly exposed a settings chevron`);
};
const expandPlugin = async (dialog, id, label) => {
  const disclosure = dialog.locator(`[data-mesurer-plugin-settings-disclosure='${id}']`);
  await disclosure.waitFor({ state: "visible" });
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
  await dialog.locator(`[data-mesurer-plugin-settings-controls='${id}']`).waitFor({ state: "visible" });
  return disclosure;
};
const assertReleaseMetadata = async (dialog) => {
  const metadata = await page.evaluate(() => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    if (!harness) return null;
    return {
      expected: harness.version,
      officialPlugins: harness.subject.describe()?.plugins
        .filter((plugin) => plugin.id.startsWith("mesurer."))
        .map((plugin) => ({ id: plugin.id, version: plugin.version })) ?? [],
    };
  });
  if (!metadata) throw new Error("Plugin settings release metadata unavailable");
  await dialog.getByText(metadata.expected, { exact: true }).waitFor({ state: "visible" });
  const mismatches = metadata.officialPlugins.filter((plugin) => plugin.version !== metadata.expected);
  if (mismatches.length) throw new Error(`Official plugin versions did not match ${metadata.expected}: ${JSON.stringify(mismatches)}`);
  return metadata;
};

try {
  await page.goto(`${baseUrl}?reset=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__));
  await waitForTool("context.copy", true);
  await waitForTool("screenshot", true);
  if (await pluginLoaded("mesurer.arrange")) throw new Error("Arrange should begin unloaded in the fixture");

  let dialog = await openSettings();
  const releaseMetadata = await assertReleaseMetadata(dialog);
  const pluginList = dialog.locator("[data-mesurer-plugin-settings-list='true']");
  for (const id of ["mesurer.context", "mesurer.arrange", "mesurer.screenshot"]) {
    await pluginList.locator(`[data-mesurer-plugin-settings-section='${id}']`).waitFor({ state: "visible" });
  }

  const contextToggle = pluginToggle(dialog, "Context");
  const arrangeToggle = pluginToggle(dialog, "Arrange");
  const screenshotToggle = pluginToggle(dialog, "Screenshot");
  await expectChecked(contextToggle, true, "Context plugin");
  await expectChecked(arrangeToggle, false, "Arrange plugin");
  await expectChecked(screenshotToggle, true, "Screenshot plugin");
  await expectNoDisclosure(dialog, "mesurer.context", "Context");
  await expectNoDisclosure(dialog, "mesurer.arrange", "Disabled Arrange");
  if ((await settingSwitch(dialog, "Context tools").count()) !== 0) throw new Error("Context tools redundant nested toggle is still visible");
  if ((await settingSwitch(dialog, "Screenshot tool").count()) !== 0) throw new Error("Screenshot tool redundant nested toggle is still visible");

  // A first-party plugin that was never supplied to mountMesurer is discoverable and loadable from Settings.
  await arrangeToggle.click();
  await waitForPlugin("mesurer.arrange", true);
  await waitForTool("arrange", true);
  await expectChecked(arrangeToggle, true, "Arrange plugin after Settings enable");
  await expandPlugin(dialog, "mesurer.arrange", "Arrange");
  await settingSwitch(dialog, "Snapping").waitFor({ state: "visible" });

  // Disabling unloads the actual plugin and removes its settings chevron, while the row remains available.
  await arrangeToggle.click();
  await waitForPlugin("mesurer.arrange", false);
  await waitForTool("arrange", false);
  await expectChecked(arrangeToggle, false, "Arrange plugin after disable");
  await expectNoDisclosure(dialog, "mesurer.arrange", "Disabled Arrange");

  await expandPlugin(dialog, "mesurer.screenshot", "Screenshot");
  const autoCopy = settingSwitch(dialog, "Auto-copy");
  const autoDownload = settingSwitch(dialog, "Auto-download");
  const includeMeasurements = settingSwitch(dialog, "Include measurements");
  await expectChecked(autoCopy, false, "Auto-copy default");
  await expectChecked(autoDownload, false, "Auto-download default");
  await expectChecked(includeMeasurements, false, "Include measurements default");

  // Plugin-local persisted settings survive an unload/reload cycle.
  await autoCopy.click();
  await expectChecked(autoCopy, true, "Auto-copy before unload");
  await screenshotToggle.click();
  await waitForPlugin("mesurer.screenshot", false);
  await waitForTool("screenshot", false);
  await expectNoDisclosure(dialog, "mesurer.screenshot", "Disabled Screenshot");
  const screenshotServiceRemoved = await page.evaluate(() =>
    window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.services.includes("screenshot") ?? false,
  );
  if (screenshotServiceRemoved) throw new Error("Disabling Screenshot left its service registered");

  await screenshotToggle.click();
  await waitForPlugin("mesurer.screenshot", true);
  await waitForTool("screenshot", true);
  await expandPlugin(dialog, "mesurer.screenshot", "Screenshot");
  await expectChecked(settingSwitch(dialog, "Auto-copy"), true, "Auto-copy restored after plugin reload");

  // Context uses the same lifecycle toggle: off means its service is actually gone, not merely hidden.
  await contextToggle.click();
  await waitForPlugin("mesurer.context", false);
  await waitForTool("context.copy", false);
  const contextServiceRemoved = await page.evaluate(() =>
    window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.services.includes("context:v1") ?? false,
  );
  if (contextServiceRemoved) throw new Error("Disabling Context left context:v1 registered");
  await contextToggle.click();
  await waitForPlugin("mesurer.context", true);
  await waitForTool("context.copy", true);

  // Keep Arrange enabled and Screenshot disabled, then prove availability itself survives reload.
  await arrangeToggle.click();
  await waitForPlugin("mesurer.arrange", true);
  await screenshotToggle.click();
  await waitForPlugin("mesurer.screenshot", false);
  await page.waitForTimeout(100);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__));
  dialog = await openSettings();
  await expectChecked(pluginToggle(dialog, "Context"), true, "Persisted Context plugin");
  await expectChecked(pluginToggle(dialog, "Arrange"), true, "Persisted Arrange plugin");
  await expectChecked(pluginToggle(dialog, "Screenshot"), false, "Persisted Screenshot plugin");
  await waitForTool("context.copy", true);
  await waitForTool("arrange", true);
  await waitForTool("screenshot", false);

  // Reset returns plugin availability to the fixture's mount defaults: Context + Screenshot on, Arrange off.
  await dialog.getByRole("button", { name: "Reset settings to defaults" }).click();
  await waitForPlugin("mesurer.arrange", false);
  await waitForPlugin("mesurer.screenshot", true);
  await waitForPlugin("mesurer.context", true);
  await expectChecked(pluginToggle(dialog, "Context"), true, "Default Context plugin");
  await expectChecked(pluginToggle(dialog, "Arrange"), false, "Default Arrange plugin");
  await expectChecked(pluginToggle(dialog, "Screenshot"), true, "Default Screenshot plugin");
  await waitForTool("context.copy", true);
  await waitForTool("screenshot", true);
  await waitForTool("arrange", false);
  await expandPlugin(dialog, "mesurer.screenshot", "Screenshot");
  await expectChecked(settingSwitch(dialog, "Auto-copy"), false, "Default Auto-copy");

  // The reloaded Screenshot plugin still uses the caller-provided capture provider.
  await page.evaluate(async () => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    const screenshot = harness?.screenshot();
    if (!harness || !screenshot) throw new Error("Screenshot service unavailable after plugin reload");
    await harness.subject.select("#settings-target");
    screenshot.setSettings({ includeMeasurements: false, copy: false, download: false });
    await screenshot.capture({ left: 80, top: 80, width: 360, height: 220 });
  });
  const cleanCapture = await page.evaluate(() => window.__MESURER_PLUGIN_SETTINGS_TEST__?.captures.at(-1));
  if (cleanCapture?.measurementVisible !== false) throw new Error(`Clean screenshot kept measurements: ${JSON.stringify(cleanCapture)}`);

  await settingSwitch(dialog, "Include measurements").click();
  await page.evaluate(async () => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    const screenshot = harness?.screenshot();
    if (!harness || !screenshot) throw new Error("Screenshot service unavailable for evidence capture");
    await screenshot.capture({ left: 80, top: 80, width: 360, height: 220 });
  });
  const evidenceCapture = await page.evaluate(() => window.__MESURER_PLUGIN_SETTINGS_TEST__?.captures.at(-1));
  if (evidenceCapture?.measurementVisible !== true) throw new Error(`Evidence screenshot hid measurements: ${JSON.stringify(evidenceCapture)}`);

  if (errors.length) throw new Error(`Plugin settings browser errors:\n${errors.join("\n")}`);
  console.log("Plugin settings browser contract: PASS");
  console.log(JSON.stringify({ cleanCapture, evidenceCapture, releaseMetadata }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
''',
)

replace_once(
    "CHANGELOG.md",
    '''- Plugin quick menus now stay single-line, compact plugin Settings are borderless, and Escape closes an open plugin quick menu before Arrange handles its own cancel shortcut.''',
    '''- Plugin quick menus now stay single-line, compact plugin Settings are borderless, and Escape closes an open plugin quick menu before Arrange handles its own cancel shortcut.
- General → Plugins now treats each plugin row as its lifecycle toggle. First-party Context, Arrange, and Screenshot remain discoverable even when initially disabled; enabled plugins show a settings chevron only when they have additional controls, and redundant Context/Screenshot visibility rows are hidden.''',
)

print("Applied plugin lifecycle toggle follow-up.")
