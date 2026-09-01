import type { ToolMode } from "@jhomra21/mesurer-solid-core";
import { formatColor, parseCssColor, type ColorSample } from "../core/colors";
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
  model.current.colorPickerActive ? "color-picker" as const
    : model.current.rulersVisible ? "rulers" as const
      : model.current.toolMode === "guides" ? "guides" as const
        : model.current.toolMode === "select" || model.current.toolMode === "text-inspector" ? "select" as const
          : "general" as const;

const visibleColor = (value: string): ColorSample | null => {
  const sample = parseCssColor(value);
  return sample && sample.alpha > 0 ? sample : null;
};

const sampleDomColor = (element: Element, ownerWindow: Window): ColorSample | null => {
  // SAFETY: elements sampled here come from ownerWindow.document, so its realm constructors are the matching instanceof checks.
  const realm = ownerWindow as Window & typeof globalThis;
  const style = ownerWindow.getComputedStyle(element);
  const background = visibleColor(style.backgroundColor);
  if (background) return background;

  if (element instanceof realm.SVGElement) {
    const fill = visibleColor(style.getPropertyValue("fill"));
    if (fill) return fill;
    const stroke = visibleColor(style.getPropertyValue("stroke"));
    if (stroke) return stroke;
  }

  if ((element.textContent?.trim().length ?? 0) > 0) {
    const foreground = visibleColor(style.color);
    if (foreground) return foreground;
  }

  let parent = element.parentElement;
  while (parent) {
    const parentBackground = visibleColor(ownerWindow.getComputedStyle(parent).backgroundColor);
    if (parentBackground) return parentBackground;
    parent = parent.parentElement;
  }

  return visibleColor(style.color);
};

const commitColorSample = (
  model: MesurerModel,
  ownerWindow: Window,
  sample: ColorSample,
) => {
  model.setTransient({ colorPickerSample: sample });
  void ownerWindow.navigator.clipboard?.writeText(
    formatColor(sample, model.current.settings.colorPickerClickFormat),
  ).catch(() => undefined);
};

const MESURER_UI_SELECTOR = "[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']";

const installDomColorPickerFallback = (
  model: MesurerModel,
  ownerWindow: Window,
): (() => void) => {
  const ownerDocument = ownerWindow.document;
  // colorPickerUnsupported tracks native EyeDropper support. A true value while
  // active means Mesurer is using its best-effort DOM/CSS page-color fallback.
  model.setTransient({ colorPickerUnsupported: true });
  // SAFETY: composedPath entries are checked against the Element constructor belonging to this document's window realm.
  const realm = ownerWindow as Window & typeof globalThis;
  const overlay = ownerDocument.createElement("div");
  overlay.dataset.mesurerColorPickerFallback = "true";
  overlay.dataset.mesurerColorPickerMode = "dom-fallback";
  overlay.dataset.mesurerInspectorUi = "true";
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "89",
    cursor: "crosshair",
    background: "transparent",
    pointerEvents: "auto",
  });
  (ownerDocument.body ?? ownerDocument.documentElement).append(overlay);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    ownerDocument.removeEventListener("pointerdown", onDocumentPointerDown, true);
    ownerDocument.removeEventListener("keydown", onKeyDown, true);
    overlay.removeEventListener("pointerdown", onOverlayPointerDown);
    overlay.removeEventListener("click", onOverlayClick);
    overlay.remove();
  };

  const isMesurerUi = (element: Element) => Boolean(element.closest(MESURER_UI_SELECTOR));

  const sampleAtPoint = (clientX: number, clientY: number) => {
    // Let the browser hit-test through the transparent capture surface so the
    // fallback samples the real page element rather than its own overlay.
    overlay.style.pointerEvents = "none";
    const candidates = ownerDocument.elementsFromPoint(clientX, clientY);
    overlay.style.pointerEvents = "auto";
    const target = candidates.find((candidate) => !isMesurerUi(candidate));
    return target ? sampleDomColor(target, ownerWindow) : null;
  };

  const onOverlayPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onOverlayClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const sample = sampleAtPoint(event.clientX, event.clientY);
    if (!sample) return;
    cleanup();
    commitColorSample(model, ownerWindow, sample);
  };

  // Keep a document-level path as a defensive fallback for pages whose own
  // stacking contexts sit above the capture surface. The normal browser path
  // is the overlay, which visibly supplies the crosshair and consumes the click.
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || event.target === overlay) return;
    const path = event.composedPath().filter((entry): entry is Element => entry instanceof realm.Element);
    if (path.some(isMesurerUi)) return;
    const target = path[0];
    if (!target) return;
    const sample = sampleDomColor(target, ownerWindow);
    if (!sample) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cleanup();
    commitColorSample(model, ownerWindow, sample);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cleanup();
    dismissColorPicker(model);
  };

  overlay.addEventListener("pointerdown", onOverlayPointerDown);
  overlay.addEventListener("click", onOverlayClick);
  ownerDocument.addEventListener("pointerdown", onDocumentPointerDown, true);
  ownerDocument.addEventListener("keydown", onKeyDown, true);
  return cleanup;
};

export function createMesurerBuiltinController(options: {
  model: MesurerModel;
  ownerWindow: Window;
}): MesurerBuiltinController {
  const { model, ownerWindow } = options;
  let colorPickerFallbackCleanup: (() => void) | null = null;

  const clearColorPickerFallback = () => {
    colorPickerFallbackCleanup?.();
    colorPickerFallbackCleanup = null;
  };

  const openColorPicker = async () => {
    clearColorPickerFallback();
    model.setEnabled(true, !model.current.enabled);
    model.setToolMode("none", model.current.toolMode !== "none");
    // SAFETY: EyeDropper is an optional browser Window extension and is existence-checked before construction.
    const EyeDropper = (ownerWindow as WindowWithEyeDropper).EyeDropper;
    model.setTransient({
      colorPickerActive: true,
      colorPickerSample: null,
      colorPickerUnsupported: !EyeDropper,
    });
    if (!EyeDropper) {
      colorPickerFallbackCleanup = installDomColorPickerFallback(model, ownerWindow);
      return;
    }
    try {
      const result = await new EyeDropper().open();
      const sample = parseCssColor(result.sRGBHex);
      if (!sample) {
        colorPickerFallbackCleanup = installDomColorPickerFallback(model, ownerWindow);
        return;
      }
      commitColorSample(model, ownerWindow, sample);
    } catch (cause) {
      // SAFETY: ownerWindow is the realm that owns EyeDropper and therefore its DOMException constructor.
      const DOMExceptionCtor = (ownerWindow as Window & typeof globalThis).DOMException;
      if (cause instanceof DOMExceptionCtor && cause.name === "AbortError") {
        dismissColorPicker(model);
        return;
      }
      colorPickerFallbackCleanup = installDomColorPickerFallback(model, ownerWindow);
    }
  };

  return {
    async run(id) {
      switch (id) {
        case "select":
          clearColorPickerFallback();
          activateMode(model, "select");
          return;
        case "xray":
          clearColorPickerFallback();
          model.setEnabled(true);
          dismissColorPicker(model);
          model.toggleXray();
          return;
        case "color-picker":
          await openColorPicker();
          return;
        case "rulers":
          clearColorPickerFallback();
          model.setEnabled(true);
          dismissColorPicker(model);
          model.toggleRulers();
          return;
        case "text-inspector":
          clearColorPickerFallback();
          activateMode(model, "text-inspector");
          return;
        case "guides":
          clearColorPickerFallback();
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
          clearColorPickerFallback();
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
