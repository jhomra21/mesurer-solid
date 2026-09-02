import type { ToolMode } from "@jhomra21/mesurer-solid-core";
import { formatColor, parseCssColor, type ColorSample } from "../core/colors";
import type { MesurerModel } from "../model/create-mesurer-model";
import type { MesurerBuiltinPluginId } from "../plugins/builtins";
import {
  markNativeColorPickerOperationallyUnavailable,
  supportsNativeColorPicker,
} from "./color-picker-support";

type EyeDropperResult = { sRGBHex: string };
type EyeDropperLike = { open: () => Promise<EyeDropperResult> };
type WindowWithEyeDropper = Window & { EyeDropper?: new () => EyeDropperLike };

const COLOR_PICKER_USABLE_OPEN_MS = 200;

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
  model.current.colorPickerActive ? "color-picker" as const
    : model.current.rulersVisible ? "rulers" as const
      : model.current.toolMode === "guides" ? "guides" as const
        : model.current.toolMode === "select" || model.current.toolMode === "text-inspector" ? "select" as const
          : "general" as const;

const commitColorSample = (
  model: MesurerModel,
  ownerWindow: Window,
  sample: ColorSample,
) => {
  model.setTransient({
    colorPickerActive: true,
    colorPickerSample: sample,
    colorPickerUnsupported: false,
  });
  void ownerWindow.navigator.clipboard?.writeText(
    formatColor(sample, model.current.settings.colorPickerClickFormat),
  ).catch(() => undefined);
};

const retireColorPicker = (model: MesurerModel, ownerWindow: Window) => {
  markNativeColorPickerOperationallyUnavailable(ownerWindow);
  dismissColorPicker(model);
  // Toolbar capability refresh is already wired to focus. Reuse that path so
  // the failed native action disappears immediately without adding a second
  // renderer-specific coordination channel.
  // SAFETY: ownerWindow is the DOM realm receiving the event, so its Event constructor is the matching realm constructor.
  const EventCtor = (ownerWindow as Window & typeof globalThis).Event;
  ownerWindow.dispatchEvent(new EventCtor("focus"));
};

export function createMesurerBuiltinController(options: {
  model: MesurerModel;
  ownerWindow: Window;
}): MesurerBuiltinController {
  const { model, ownerWindow } = options;

  const openColorPicker = async () => {
    if (!supportsNativeColorPicker(ownerWindow)) {
      dismissColorPicker(model);
      return;
    }

    model.setEnabled(true, !model.current.enabled);
    model.setToolMode("none", model.current.toolMode !== "none");
    // SAFETY: supportsNativeColorPicker checked this optional browser extension before construction.
    const EyeDropper = (ownerWindow as WindowWithEyeDropper).EyeDropper!;
    model.setTransient({
      colorPickerActive: false,
      colorPickerSample: null,
      colorPickerUnsupported: false,
    });

    const openedAt = ownerWindow.performance.now();
    let activationTimer = ownerWindow.setTimeout(() => {
      activationTimer = 0;
      model.setTransient({ colorPickerActive: true });
    }, COLOR_PICKER_USABLE_OPEN_MS);
    const clearActivationTimer = () => {
      if (!activationTimer) return;
      ownerWindow.clearTimeout(activationTimer);
      activationTimer = 0;
    };

    try {
      const result = await new EyeDropper().open();
      clearActivationTimer();
      const sample = parseCssColor(result.sRGBHex);
      if (!sample) {
        dismissColorPicker(model);
        return;
      }
      commitColorSample(model, ownerWindow, sample);
    } catch (cause) {
      clearActivationTimer();
      const elapsed = ownerWindow.performance.now() - openedAt;
      // SAFETY: ownerWindow is the realm that owns EyeDropper and therefore its DOMException constructor.
      const DOMExceptionCtor = (ownerWindow as Window & typeof globalThis).DOMException;
      if (cause instanceof DOMExceptionCtor && cause.name === "AbortError") {
        if (elapsed < COLOR_PICKER_USABLE_OPEN_MS) {
          retireColorPicker(model, ownerWindow);
          return;
        }
        dismissColorPicker(model);
        return;
      }
      retireColorPicker(model, ownerWindow);
    }
  };

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
            dismissColorPicker(model);
            return;
          }
          await openColorPicker();
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
