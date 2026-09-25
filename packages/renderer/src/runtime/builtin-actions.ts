import type { ToolMode } from "@jhomra21/mesurer-solid-core";
import { formatColor, parseCssColor, type ColorSample } from "../core/colors";
import {
  captureHostScreenshotPng,
  hasHostScreenshotCapture,
  waitForNextPaint,
} from "../core/screenshot";
import type { MesurerModel } from "../model/create-mesurer-model";
import type { MesurerBuiltinPluginId } from "../plugins/builtins";
import {
  markNativeColorPickerOperationallyUnavailable,
  supportsNativeColorPicker,
} from "./color-picker-support";

type EyeDropperResult = { sRGBHex: string };

type EyeDropperLike = {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>;
};

type WindowWithEyeDropper = Window & { EyeDropper?: new () => EyeDropperLike };

type ColorPickerPoint = { x: number; y: number };

type InlineDisplayState = {
  value: string;
  priority: string;
};

const COLOR_PICKER_USABLE_OPEN_MS = 200;

export type MesurerBuiltinController = {
  run(id: Exclude<MesurerBuiltinPluginId, "distance">): Promise<void>;
  deactivate(id: MesurerBuiltinPluginId): void;
  pickColorAt(point: ColorPickerPoint): Promise<void>;
  dispose(): void;
};

const dismissColorPicker = (model: MesurerModel) => {
  model.setTransient({
    colorPickerActive: false,
    colorPickerSample: null,
    colorPickerUnsupported: false,
  });
};

const clearSelection = (model: MesurerModel) => {
  model.setSelectedMeasurements([], null);
  model.setSelectedGuideIds([]);
  model.setTransient({
    start: null,
    end: null,
    isDragging: false,
    selectionOriginRect: null,
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

const retireNativeColorPicker = (model: MesurerModel, ownerWindow: Window) => {
  markNativeColorPickerOperationallyUnavailable(ownerWindow);
  dismissColorPicker(model);
  // Toolbar capability refresh is wired to focus. Reuse that path so a native
  // implementation that aborts before becoming usable disappears immediately.
  // SAFETY: ownerWindow is the DOM realm receiving the event, so its Event constructor is the matching realm constructor.
  const EventCtor = (ownerWindow as Window & typeof globalThis).Event;
  ownerWindow.dispatchEvent(new EventCtor("focus"));
};

const hideMesurerForHostColorCapture = (
  ownerDocument: Document,
  uiRoot: HTMLElement | null,
) => {
  const hidden = new Map<HTMLElement, InlineDisplayState>();

  const hide = (element: HTMLElement | null) => {
    if (!element || hidden.has(element)) return;
    hidden.set(element, {
      value: element.style.getPropertyValue("display"),
      priority: element.style.getPropertyPriority("display"),
    });
    element.style.setProperty("display", "none", "important");
  };

  hide(uiRoot);

  for (const element of ownerDocument.querySelectorAll<HTMLElement>([
    "[data-mesurer-layer]",
    "[data-mesurer-extension-toolbar='true']",
    "[data-mesurer-inspector-ui='true']",
    ".mesurer-color-picker",
  ].join(","))) {
    hide(element);
  }

  return () => {
    for (const [element, display] of hidden) {
      if (display.value || display.priority) {
        element.style.setProperty("display", display.value, display.priority);
      } else {
        element.style.removeProperty("display");
      }
    }

    hidden.clear();
  };
};

const sampleHostScreenshotPixel = async (
  ownerDocument: Document,
  ownerWindow: Window,
  png: Blob,
  point: ColorPickerPoint,
): Promise<ColorSample> => {
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument and owns createImageBitmap.
  const realm = ownerWindow as Window & typeof globalThis;
  const bitmap = await realm.createImageBitmap(png);

  try {
    const viewportWidth = Math.max(1, ownerWindow.innerWidth);
    const viewportHeight = Math.max(1, ownerWindow.innerHeight);
    const scaleX = bitmap.width / viewportWidth;
    const scaleY = bitmap.height / viewportHeight;
    const x = Math.min(bitmap.width - 1, Math.max(0, Math.floor(point.x * scaleX)));
    const y = Math.min(bitmap.height - 1, Math.max(0, Math.floor(point.y * scaleY)));
    const canvas = ownerDocument.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) throw new Error("Color Picker could not read the captured application window.");
    context.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;

    return {
      red: pixel[0] ?? 0,
      green: pixel[1] ?? 0,
      blue: pixel[2] ?? 0,
      alpha: (pixel[3] ?? 255) / 255,
    };
  } finally {
    bitmap.close();
  }
};

export function createMesurerBuiltinController(options: {
  model: MesurerModel;
  ownerWindow: Window;
  ownerDocument?: Document;
  uiRoot?: () => HTMLElement | null;
}): MesurerBuiltinController {
  const { model, ownerWindow } = options;
  const ownerDocument = options.ownerDocument ?? ownerWindow.document;
  let nativeAbortController: AbortController | null = null;
  let activationTimer = 0;
  let localPickActive = false;
  let captureRevision = 0;
  let disposed = false;

  const clearActivationTimer = () => {
    if (!activationTimer) return;
    ownerWindow.clearTimeout(activationTimer);
    activationTimer = 0;
  };

  const removeLocalCancellationListeners = () => {
    ownerWindow.removeEventListener("blur", cancelLocalColorPicker);
    ownerDocument.removeEventListener("visibilitychange", handleVisibilityChange);
  };

  const stopColorPickerSession = () => {
    captureRevision += 1;
    clearActivationTimer();
    localPickActive = false;
    removeLocalCancellationListeners();
    const abortController = nativeAbortController;
    nativeAbortController = null;
    abortController?.abort();
  };

  const closeColorPicker = () => {
    stopColorPickerSession();
    dismissColorPicker(model);
  };

  function cancelLocalColorPicker() {
    if (!localPickActive) return;
    closeColorPicker();
  }

  function handleVisibilityChange() {
    if (ownerDocument.visibilityState === "hidden") cancelLocalColorPicker();
  }

  const beginLocalColorPicker = () => {
    stopColorPickerSession();
    model.setEnabled(true, !model.current.enabled);
    model.setToolMode("none", model.current.toolMode !== "none");
    model.setTransient({
      colorPickerActive: true,
      colorPickerSample: null,
      colorPickerUnsupported: false,
    });
    localPickActive = true;
    ownerWindow.addEventListener("blur", cancelLocalColorPicker);
    ownerDocument.addEventListener("visibilitychange", handleVisibilityChange);
  };

  const openNativeColorPicker = async () => {
    if (!supportsNativeColorPicker(ownerWindow)) {
      closeColorPicker();

      return;
    }

    stopColorPickerSession();
    model.setEnabled(true, !model.current.enabled);
    model.setToolMode("none", model.current.toolMode !== "none");
    // SAFETY: supportsNativeColorPicker checked this optional browser extension before construction.
    const EyeDropper = (ownerWindow as WindowWithEyeDropper).EyeDropper!;

    // SAFETY: ownerWindow is the browsing-context global that owns the EyeDropper invocation.
    const AbortControllerCtor = (ownerWindow as Window & typeof globalThis).AbortController;
    const abortController = new AbortControllerCtor();
    nativeAbortController = abortController;
    model.setTransient({
      colorPickerActive: false,
      colorPickerSample: null,
      colorPickerUnsupported: false,
    });

    const openedAt = ownerWindow.performance.now();

    activationTimer = ownerWindow.setTimeout(() => {
      activationTimer = 0;

      if (nativeAbortController === abortController && !abortController.signal.aborted) {
        model.setTransient({ colorPickerActive: true });
      }
    }, COLOR_PICKER_USABLE_OPEN_MS);

    try {
      const result = await new EyeDropper().open({ signal: abortController.signal });
      clearActivationTimer();

      if (abortController.signal.aborted || disposed) return;
      const sample = parseCssColor(result.sRGBHex);

      if (!sample) {
        dismissColorPicker(model);

        return;
      }

      commitColorSample(model, ownerWindow, sample);
    } catch (cause) {
      clearActivationTimer();

      if (abortController.signal.aborted || disposed) {
        dismissColorPicker(model);

        return;
      }

      const elapsed = ownerWindow.performance.now() - openedAt;
      // SAFETY: ownerWindow is the realm that owns EyeDropper and therefore its DOMException constructor.
      const DOMExceptionCtor = (ownerWindow as Window & typeof globalThis).DOMException;

      if (cause instanceof DOMExceptionCtor && cause.name === "AbortError") {
        if (elapsed < COLOR_PICKER_USABLE_OPEN_MS) {
          retireNativeColorPicker(model, ownerWindow);

          return;
        }

        dismissColorPicker(model);

        return;
      }

      retireNativeColorPicker(model, ownerWindow);
    } finally {
      if (nativeAbortController === abortController) nativeAbortController = null;
    }
  };

  const openColorPicker = async () => {
    if (hasHostScreenshotCapture(ownerWindow)) {
      beginLocalColorPicker();

      return;
    }

    await openNativeColorPicker();
  };

  const pickColorAt = async (point: ColorPickerPoint) => {
    if (disposed || !localPickActive || !hasHostScreenshotCapture(ownerWindow)) return;
    const revision = ++captureRevision;
    localPickActive = false;
    removeLocalCancellationListeners();

    const restorePresentation = hideMesurerForHostColorCapture(
      ownerDocument,
      options.uiRoot?.() ?? model.rendererRoot,
    );

    try {
      await waitForNextPaint(ownerWindow);
      const png = await captureHostScreenshotPng(ownerWindow);

      if (!png) throw new Error("Color Picker host capture is unavailable.");
      const sample = await sampleHostScreenshotPixel(ownerDocument, ownerWindow, png, point);

      if (disposed || revision !== captureRevision) return;
      commitColorSample(model, ownerWindow, sample);
    } catch {
      if (!disposed && revision === captureRevision) dismissColorPicker(model);
    } finally {
      restorePresentation();
    }
  };

  return {
    async run(id) {
      switch (id) {
        case "select":
          stopColorPickerSession();
          clearSelection(model);
          activateMode(model, "select");

          return;
        case "xray":
          stopColorPickerSession();
          model.setEnabled(true);
          dismissColorPicker(model);
          model.toggleXray();

          return;
        case "color-picker":
          if (model.current.colorPickerActive || localPickActive || nativeAbortController) {
            closeColorPicker();

            return;
          }

          await openColorPicker();

          return;
        case "rulers":
          stopColorPickerSession();
          model.setEnabled(true);
          dismissColorPicker(model);
          model.toggleRulers();

          return;
        case "text-inspector":
          stopColorPickerSession();
          activateMode(model, "text-inspector");

          return;
        case "guides":
          stopColorPickerSession();
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
          clearSelection(model);

          if (model.current.toolMode === id) model.setToolMode("none");

          return;
        case "text-inspector":
        case "guides":
          if (model.current.toolMode === id) model.setToolMode("none");

          return;
        case "xray":
          model.setXrayVisible(false);

          return;
        case "color-picker":
          closeColorPicker();

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
    pickColorAt,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopColorPickerSession();
    },
  };
}
