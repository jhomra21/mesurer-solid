import type { ToolMode } from "@jhomra21/mesurer-solid-core";
import { formatColor, parseCssColor } from "../core/colors";
import type { MeasurerModel } from "../model/create-measurer-model";
import type { MesurerBuiltinPluginId } from "../plugins/builtins";

type EyeDropperResult = { sRGBHex: string };
type EyeDropperLike = { open: () => Promise<EyeDropperResult> };
type WindowWithEyeDropper = Window & { EyeDropper?: new () => EyeDropperLike };

export type MeasurerBuiltinController = {
  run(id: Exclude<MesurerBuiltinPluginId, "distance">): Promise<void>;
  deactivate(id: MesurerBuiltinPluginId): void;
};

const activateMode = (model: MeasurerModel, mode: ToolMode) => {
  model.setEnabled(true, !model.current.enabled);
  model.setTransient({ colorPickerActive: false, toolbarActive: true });
  model.toggleToolMode(mode);
};

const settingsTab = (model: MeasurerModel) =>
  model.current.colorPickerActive ? "color-picker" as const
    : model.current.rulersVisible ? "rulers" as const
      : model.current.toolMode === "guides" ? "guides" as const
        : model.current.toolMode === "select" || model.current.toolMode === "text-inspector" ? "select" as const
          : "general" as const;

const openColorPicker = async (model: MeasurerModel, ownerWindow: Window) => {
  model.setEnabled(true, !model.current.enabled);
  model.setToolMode("none", model.current.toolMode !== "none");
  // SAFETY: EyeDropper is an optional browser Window extension and is existence-checked before construction.
  const EyeDropper = (ownerWindow as WindowWithEyeDropper).EyeDropper;
  model.setTransient({ colorPickerActive: true, colorPickerSample: null, colorPickerUnsupported: !EyeDropper });
  if (!EyeDropper) return;
  try {
    const result = await new EyeDropper().open();
    const sample = parseCssColor(result.sRGBHex);
    if (!sample) return;
    model.setTransient({ colorPickerSample: sample, colorPickerUnsupported: false });
    void ownerWindow.navigator.clipboard?.writeText(
      formatColor(sample, model.current.settings.colorPickerClickFormat),
    ).catch(() => undefined);
  } catch (cause) {
    // SAFETY: ownerWindow is the realm that owns EyeDropper and therefore its DOMException constructor.
    const DOMExceptionCtor = (ownerWindow as Window & typeof globalThis).DOMException;
    if (cause instanceof DOMExceptionCtor && cause.name === "AbortError") {
      model.setTransient({ colorPickerActive: false });
    }
  }
};

export function createMeasurerBuiltinController(options: {
  model: MeasurerModel;
  ownerWindow: Window;
}): MeasurerBuiltinController {
  const { model, ownerWindow } = options;

  return {
    async run(id) {
      switch (id) {
        case "select":
          activateMode(model, "select");
          return;
        case "xray":
          model.setEnabled(true);
          model.setTransient({ colorPickerActive: false });
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
          model.setTransient({ colorPickerActive: false });
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
          model.setTransient({ colorPickerActive: false });
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
