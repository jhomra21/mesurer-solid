import type { ToolMode } from "@jhomra21/mesurer-solid-core";
import type { MeasurerModel } from "../model/create-measurer-model";
import type { MesurerBuiltinPluginId } from "../plugins/builtins";

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

export function createMeasurerBuiltinController(options: {
  model: MeasurerModel;
  openColorPicker(): void | Promise<void>;
}): MeasurerBuiltinController {
  const { model } = options;

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
          await options.openColorPicker();
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
