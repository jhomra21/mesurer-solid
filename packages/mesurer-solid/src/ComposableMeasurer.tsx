import { For, Show, createMemo, createSignal, onSettled, untrack } from "solid-js";
import { Portal } from "@solidjs/web";
import {
  createMesurerPluginHost,
  type MesurerPlugin,
  type MesurerPluginHost,
  type ToolContribution,
} from "@jhomra21/mesurer-core";
import LegacyMeasurer, { type MeasurerProps as LegacyMeasurerProps } from "./Measurer";
import { composeMesurerPlugins, type MesurerBuiltinPluginId } from "./plugins/builtins";

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
  const [revision, setRevision] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  const [extensionMount, setExtensionMount] = createSignal<HTMLDivElement | null>(null);

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
    return host.tools().filter((tool) => !tool.builtin);
  });

  const visibilityCss = () => {
    revision();
    const rules: string[] = [];
    for (const [id, label] of Object.entries(LABELS) as Array<[MesurerBuiltinPluginId, string]>) {
      if (!builtinEnabled(id)) rules.push(`${toolSelector(label)}{display:none!important}`);
    }
    if (!builtinEnabled("guides")) {
      rules.push("[data-mesurer-toolbar='true'] div:has(>button[aria-label='Guide orientation menu']){display:none!important}");
      rules.push("[data-mesurer-guide='true']{display:none!important}");
    }
    if (!builtinEnabled("distance")) rules.push("[data-mesurer-distance='true']{display:none!important}");
    if (!builtinEnabled("rulers")) rules.push("[data-mesurer-rulers='true']{display:none!important}");
    if (!builtinEnabled("color-picker")) rules.push(".mesurer-color-picker{display:none!important}");
    return rules.join("\n");
  };

  const runTool = (tool: ToolContribution) => {
    if (tool.disabled?.()) return;
    void host.command.execute(tool.command, undefined, { source: "toolbar", toolId: tool.id })
      .catch((error) => props.onPluginError?.(error, tool.id));
  };

  onSettled(() => {
    let active = true;
    let persistTimer = 0;
    const runtimeHost: MesurerPluginHost = host;
    const input: MeasurerProps = props;
    const target = input.portalTarget ?? document.body;
    const ownerDocument = target.ownerDocument ?? document;
    const ownerWindow = ownerDocument.defaultView ?? window;
    const queryRoot: ParentNode = target;

    const visibilityStyle = ownerDocument.createElement("style");
    visibilityStyle.dataset.mesurerPluginVisibility = "true";
    visibilityStyle.textContent = visibilityCss();
    target.append(visibilityStyle);

    const extensionHost = ownerDocument.createElement("div");
    extensionHost.dataset.mesurerExtensionHost = "true";
    extensionHost.dataset.mesurerInspectorUi = "true";
    const inspectorRoot = queryRoot.querySelector<HTMLElement>("[data-mesurer-root='true']");
    (inspectorRoot ?? target).append(extensionHost);
    setExtensionMount(extensionHost);

    const dispatchBuiltin = (id: MesurerBuiltinPluginId) => {
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

    const setupPlugins = async () => {
      for (const plugin of initialBuiltinPlugins) await loadPlugin(plugin);
      if (!active) return;

      await loadPlugin({
        id: "mesurer.runtime-bridge",
        version: "0.1.0",
        provides: ["runtime:solid"],
        setup(ctx) {
          for (const id of Object.keys(BUILTIN_KEYS) as MesurerBuiltinPluginId[]) {
            ctx.command.register(`builtin.${id}`, () => {
              if (builtinEnabled(id)) dispatchBuiltin(id);
            });
          }
          ctx.command.register("builtin.settings", () => {
            if (builtinEnabled("settings")) dispatchBuiltin("settings");
          });
        },
      });
      if (!active) return;

      // External plugins load after the renderer capability exists, so they may
      // safely declare requires: ["runtime:solid"] and/or built-in capabilities.
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
      const realm = ownerWindow as Window & typeof globalThis;
      return eventTarget instanceof realm.HTMLElement && (
        eventTarget.isContentEditable ||
        eventTarget instanceof realm.HTMLInputElement ||
        eventTarget instanceof realm.HTMLTextAreaElement ||
        eventTarget instanceof realm.HTMLSelectElement
      );
    };

    const captureShortcut = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return;
      const custom = customTools().find((tool) => tool.shortcut && matchesShortcut(event, tool.shortcut));
      if (custom) {
        event.preventDefault();
        event.stopImmediatePropagation();
        runTool(custom);
        return;
      }

      const key = event.key.toLowerCase();
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
      ownerWindow.removeEventListener("keydown", captureShortcut, true);
      unsubscribe();
      ownerDocument.body.classList.remove("mesurer-solid-xray");
      setExtensionMount(null);
      extensionHost.remove();
      visibilityStyle.remove();
      if (ownsHost) runtimeHost.dispose();
    };
  });

  return (
    <>
      <LegacyMeasurer {...props} />
      <Show when={extensionMount()}>{(mount) => (
        <Portal mount={mount()}>
          <Show when={customTools().length > 0}>
            <div
              data-mesurer-extension-toolbar="true"
              data-mesurer-inspector-ui="true"
              style={{
                position: "fixed",
                top: "16px",
                right: "16px",
                display: "flex",
                gap: "4px",
                padding: "4px",
                "z-index": 2147483000,
                "border-radius": "12px",
                background: "white",
                "box-shadow": "0 4px 14px rgb(0 0 0 / 14%)",
              }}
            >
              <For each={customTools()}>{(tool) => (
                <button
                  type="button"
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
                    background: tool.active?.() ? "#0d99ff" : "transparent",
                    color: tool.active?.() ? "white" : "black",
                    cursor: tool.disabled?.() ? "not-allowed" : "pointer",
                    "font-family": "ui-sans-serif, system-ui, sans-serif",
                    "font-size": "12px",
                    "font-weight": 600,
                  }}
                >
                  <Show when={tool.icon} fallback={tool.label.slice(0, 1).toUpperCase()}>{(icon) => (
                    <svg width="18" height="18" viewBox={icon().viewBox ?? "0 0 24 24"} aria-hidden="true">
                      <For each={icon().paths}>{(path) => <path d={path} fill="currentColor" />}</For>
                    </svg>
                  )}</Show>
                </button>
              )}</For>
            </div>
          </Show>
        </Portal>
      )}</Show>
    </>
  );
}
