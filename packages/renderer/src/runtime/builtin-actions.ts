import type { ToolMode } from "@jhomra21/mesurer-solid-core";
import { formatColor, parseCssColor } from "../core/colors";
import type { MesurerModel } from "../model/create-mesurer-model";
import type { MesurerBuiltinPluginId } from "../plugins/builtins";

type EyeDropperResult = { sRGBHex: string };
type EyeDropperLike = { open: () => Promise<EyeDropperResult> };
type WindowWithEyeDropper = Window & { EyeDropper?: new () => EyeDropperLike };

export type MesurerBuiltinController = {
  run(id: Exclude<MesurerBuiltinPluginId, "distance">): Promise<void>;
  deactivate(id: MesurerBuiltinPluginId): void;
};

const dismissColorPicker = (model: MesurerModel) => {
  model.setTransient({
    colorPickerActive: false,
    colorPickerSample: null,
    colorPickerUnsupported: false,
  });
};

const activateMode = (model: MesurerModel, mode: ToolMode) => {
  model.setEnabled(true, !model.current.enabled);
  dismissColorPicker(model);
  model.setTransient({ toolbarActive: true });
  model.toggleToolMode(mode);
};

const settingsTab = (model: MesurerModel) =>
  model.current.colorPickerActive || model.current.colorPickerSample || model.current.colorPickerUnsupported ? "color-picker" as const
    : model.current.rulersVisible ? "rulers" as const
      : model.current.toolMode === "guides" ? "guides" as const
        : model.current.toolMode === "select" || model.current.toolMode === "text-inspector" ? "select" as const
          : "general" as const;

const openColorPicker = async (model: MesurerModel, ownerWindow: Window) => {
  model.setEnabled(true, !model.current.enabled);
  model.setToolMode("none", model.current.toolMode !== "none");
  // SAFETY: EyeDropper is an optional browser Window extension and is existence-checked before construction.
  const EyeDropper = (ownerWindow as WindowWithEyeDropper).EyeDropper;
  if (!EyeDropper) {
    model.setTransient({
      colorPickerActive: false,
      colorPickerSample: null,
      colorPickerUnsupported: true,
    });
    return;
  }

  model.setTransient({ colorPickerActive: true, colorPickerUnsupported: false });
  try {
    const result = await new EyeDropper().open();
    const sample = parseCssColor(result.sRGBHex);
    if (!sample) {
      model.setTransient({ colorPickerActive: false });
      return;
    }
    model.setTransient({
      colorPickerActive: false,
      colorPickerSample: sample,
      colorPickerUnsupported: false,
    });
    void ownerWindow.navigator.clipboard?.writeText(
      formatColor(sample, model.current.settings.colorPickerClickFormat),
    ).catch(() => undefined);
  } catch (cause) {
    model.setTransient({ colorPickerActive: false });
    // SAFETY: ownerWindow is the realm that owns EyeDropper and therefore its DOMException constructor.
    const DOMExceptionCtor = (ownerWindow as Window & typeof globalThis).DOMException;
    if (cause instanceof DOMExceptionCtor && cause.name === "AbortError") return;
  }
};

export function createMesurerBuiltinController(options: {
  model: MesurerModel;
  ownerWindow: Window;
}): MesurerBuiltinController {
  const { model, ownerWindow } = options;

  return {
    async run(id) {
      switch (id) {
        case "select":
          activateMode(model, "select");
          return;
        case "xray":
          model.setEnabled(true);
          dismissColorPicker(model);
          model.toggleXray();
          return;
        case "color-picker":
          if (model.current.colorPickerActive) {
            model.setTransient({ colorPickerActive: false });
            return;
          }
          await openColorPicker(model, ownerWindow);
          return;
        case "rulers":
          model.setEnabled(true);
          dismissColorPicker(model);
          model.toggleRulers();
          return;
        case "text-inspector":
          activateMode(model, "text-inspector");
          return;
        case "guides":
          activateMode(model, "guides");
          return;
        case "settings": {
          const open = !model.current.settingsOpen;
          model.setTransient({
            settingsOpen: open,
            settingsTab: open ? settingsTab(model) : model.current.settingsTab,
          });
          return;
        }
      }
    },
    deactivate(id) {
      switch (id) {
        case "select":
        case "text-inspector":
        case "guides":
          if (model.current.toolMode === id) model.setToolMode("none");
          return;
        case "xray":
          model.setXrayVisible(false);
          return;
        case "color-picker":
          dismissColorPicker(model);
          return;
        case "rulers":
          model.setRulersVisible(false);
          return;
        case "settings":
          model.setTransient({ settingsOpen: false });
          return;
        case "distance":
          return;
      }
    },
  };
}
