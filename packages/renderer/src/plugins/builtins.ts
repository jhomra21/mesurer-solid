import {
  defineMesurerPlugin,
  type MesurerPlugin,
  type ToolContribution,
} from "@jhomra21/mesurer-solid-core";

export type MesurerBuiltinPluginId =
  | "select"
  | "xray"
  | "color-picker"
  | "rulers"
  | "text-inspector"
  | "guides"
  | "distance"
  | "settings";

type WindowWithEyeDropper = Window & { EyeDropper?: unknown };
type BrowserGlobal = typeof globalThis & { window?: WindowWithEyeDropper };

export const supportsNativeColorPicker = (ownerWindow: Window) => {
  // SAFETY: EyeDropper is an optional browser Window extension represented by this named capability type.
  const browserWindow = ownerWindow as WindowWithEyeDropper;
  return Boolean(browserWindow.EyeDropper);
};

const activeWindowSupportsNativeColorPicker = () => {
  // SAFETY: browser runtimes add window to globalThis; non-browser runtimes leave this optional capability absent.
  const browserGlobal = globalThis as BrowserGlobal;
  return Boolean(browserGlobal.window?.EyeDropper);
};

const toolPlugin = (
  id: Exclude<MesurerBuiltinPluginId, "distance">,
  label: string,
  shortcut: string,
  order: number,
  available: () => boolean = () => true,
): MesurerPlugin => defineMesurerPlugin({
  id: `mesurer.${id}`,
  version: "0.1.0",
  provides: [`tool:${id}`],
  setup(ctx) {
    if (!available()) return;
    ctx.tool.register({
      id,
      builtin: id,
      label,
      shortcut,
      order,
      command: `builtin.${id}`,
    } satisfies ToolContribution);
  },
});

export const selectPlugin = () => toolPlugin("select", "Select", "S", 10);
export const xrayPlugin = () => toolPlugin("xray", "X-ray", "X", 20);
export const colorPickerPlugin = () => toolPlugin(
  "color-picker",
  "Color picker",
  "P",
  30,
  activeWindowSupportsNativeColorPicker,
);
export const rulersPlugin = () => toolPlugin("rulers", "Rulers", "R", 40);
export const textInspectorPlugin = () => toolPlugin("text-inspector", "Text inspector", "A", 50);
export const guidesPlugin = () => toolPlugin("guides", "Guides", "G", 60);
export const settingsPlugin = () => toolPlugin("settings", "Settings", "⌘/Ctrl+,", 90);

export const distancePlugin = (): MesurerPlugin => defineMesurerPlugin({
  id: "mesurer.distance",
  version: "0.1.0",
  provides: ["overlay:distance", "settings:selection-spacing"],
  setup(ctx) {
    ctx.overlay.register({ id: "distance", builtin: "distance", order: 30 });
    ctx.settings.register({ id: "selection-spacing", label: "Selection spacing", builtin: "distance", order: 30 });
  },
});

export const defaultMesurerPlugins = (): MesurerPlugin[] => [
  selectPlugin(),
  xrayPlugin(),
  colorPickerPlugin(),
  rulersPlugin(),
  textInspectorPlugin(),
  guidesPlugin(),
  distancePlugin(),
  settingsPlugin(),
];

export function composeMesurerPlugins(
  plugins: MesurerPlugin[] = [],
  exclude: MesurerBuiltinPluginId[] = [],
): MesurerPlugin[] {
  const excluded = new Set(exclude.map((id) => `mesurer.${id}`));
  return [
    ...defaultMesurerPlugins().filter((plugin) => !excluded.has(plugin.id)),
    ...plugins,
  ];
}
