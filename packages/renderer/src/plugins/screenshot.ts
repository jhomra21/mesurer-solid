import {
  defineMesurerPlugin,
  type MesurerPlugin,
  type PluginValue,
} from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMeasurer";
import {
  MIN_SCREENSHOT_SELECTION,
  captureVisibleTabPng,
  copyPngToClipboard,
  createScreenshotFilename,
  cropPngToViewportRect,
  downloadPng,
  normalizeScreenshotRect,
  prepareScreenshotCapture,
  releaseScreenshotCapture,
  waitForNextPaint,
  type ScreenshotCaptureContext,
  type ScreenshotCaptureProvider,
  type ScreenshotRect,
} from "../core/screenshot";
import { createScreenshotPreviewController } from "./screenshot-preview";

export const MESURER_SCREENSHOT_PLUGIN_ID = "mesurer.screenshot";
export const MESURER_SCREENSHOT_SERVICE_ID = "screenshot";
export const MESURER_SCREENSHOT_SETTINGS_STATE_ID = "mesurer.screenshot.settings";
export const MESURER_SCREENSHOT_ACTIVE_STATE_ID = "mesurer.screenshot.active";

const RUNTIME_SERVICE_ID = "runtime:solid";
const SCREENSHOT_COMMAND = "screenshot.toggle";
const ERROR_DURATION_MS = 2500;
const DEFAULT_PREVIEW_DURATION_MS = 0;

export type MesurerScreenshotSettings = {
  copy: boolean;
  download: boolean;
};

export type MesurerScreenshotResult = {
  blob: Blob;
  rect: ScreenshotRect;
  copied: boolean;
  downloaded: boolean;
};

export type MesurerScreenshotPluginOptions = Partial<MesurerScreenshotSettings> & {
  captureVisibleTab?: ScreenshotCaptureProvider;
  previewDurationMs?: number;
};

export type MesurerScreenshotService = {
  active(): boolean;
  settings(): MesurerScreenshotSettings;
  setSettings(patch: Partial<MesurerScreenshotSettings>): void;
  start(): Promise<void>;
  cancel(): void;
  capture(rect: ScreenshotRect): Promise<MesurerScreenshotResult>;
};

type ScreenshotStateValue = {
  [key: string]: PluginValue;
  copy: boolean;
  download: boolean;
};

type InlineStyleSnapshot = {
  value: string;
  priority: string;
};

type ToolbarVisibility = {
  element: HTMLElement;
  visibility: InlineStyleSnapshot;
};

const cameraIcon = {
  viewBox: "0 0 256 256",
  paths: [
    "M208,56H180.28L166.66,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.66,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.66-3.56L100.28,48h55.44l13.62,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8ZM128,88a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,88Zm0,72a28,28,0,1,1,28-28A28,28,0,0,1,128,160Z",
  ],
};

const setStyle = (
  element: HTMLElement,
  styles: Record<string, string>,
) => {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value);
  }
};

const setRectStyle = (
  element: HTMLElement,
  rect: Partial<Record<"left" | "top" | "right" | "bottom" | "width" | "height", number>>,
) => {
  for (const property of ["left", "top", "right", "bottom", "width", "height"] as const) {
    const value = rect[property];
    if (value === undefined) element.style.removeProperty(property);
    else element.style.setProperty(property, `${value}px`);
  }
};

const readSettings = (
  get: <T extends PluginValue>(id: string) => T | undefined,
): MesurerScreenshotSettings => {
  const stored = get<ScreenshotStateValue>(MESURER_SCREENSHOT_SETTINGS_STATE_ID);
  return {
    copy: stored?.copy ?? true,
    download: stored?.download ?? false,
  };
};

export const screenshotPlugin = (
  options: MesurerScreenshotPluginOptions = {},
): MesurerPlugin => defineMesurerPlugin({
  id: MESURER_SCREENSHOT_PLUGIN_ID,
  version: "0.1.0",
  requires: [RUNTIME_SERVICE_ID],
  provides: ["tool:screenshot", "capture:screenshot", "settings:screenshot"],
  setup(ctx) {
    const runtime = ctx.service.get<MesurerSolidRuntimeService>(RUNTIME_SERVICE_ID);
    if (!runtime) throw new Error("Screenshot plugin requires the Solid renderer runtime.");

    const { ownerDocument, ownerWindow } = runtime;
    const workspace = runtime.createWorkspaceRuntime();
    const inspectorMount = runtime.createInspectorMount();
    const captureVisibleTab = options.captureVisibleTab ?? captureVisibleTabPng;
    const previewDurationMs = options.previewDurationMs ?? DEFAULT_PREVIEW_DURATION_MS;

    ctx.state.register<ScreenshotStateValue>({
      id: MESURER_SCREENSHOT_SETTINGS_STATE_ID,
      initial: {
        copy: options.copy ?? true,
        download: options.download ?? false,
      },
      persist: true,
    });
    ctx.state.register({
      id: MESURER_SCREENSHOT_ACTIVE_STATE_ID,
      initial: false,
    });

    const root = inspectorMount.element;
    root.dataset.mesurerScreenshot = "true";
    setStyle(root, {
      position: "fixed",
      inset: "0",
      "z-index": "85",
      "pointer-events": "none",
      "font-family": "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    });

    const overlay = ownerDocument.createElement("div");
    overlay.dataset.mesurerScreenshotSelect = "true";
    overlay.setAttribute("role", "application");
    overlay.setAttribute("aria-label", "Screenshot selection");
    setStyle(overlay, {
      position: "fixed",
      inset: "0",
      display: "none",
      "z-index": "85",
      cursor: "crosshair",
      "pointer-events": "auto",
      "user-select": "none",
      "touch-action": "none",
    });
    root.append(overlay);

    const shade = Array.from({ length: 4 }, () => {
      const element = ownerDocument.createElement("div");
      setStyle(element, {
        position: "fixed",
        "background-color": "rgb(0 0 0 / 40%)",
        "pointer-events": "none",
      });
      overlay.append(element);
      return element;
    });

    const outline = ownerDocument.createElement("div");
    setStyle(outline, {
      position: "fixed",
      display: "none",
      border: "1px solid #0d99ff",
      "box-sizing": "border-box",
      "pointer-events": "none",
    });
    overlay.append(outline);

    const sizeTag = ownerDocument.createElement("div");
    setStyle(sizeTag, {
      position: "fixed",
      display: "none",
      "z-index": "86",
      transform: "translateX(-50%)",
      "border-radius": "4px",
      padding: "2px 4px",
      "background-color": "#0d99ff",
      color: "white",
      "font-size": "10px",
      "font-variant-numeric": "tabular-nums",
      "pointer-events": "none",
    });
    overlay.append(sizeTag);

    const hint = ownerDocument.createElement("div");
    hint.textContent = "Drag to select · Esc to cancel";
    setStyle(hint, {
      position: "fixed",
      left: "50%",
      bottom: "16px",
      transform: "translateX(-50%)",
      "border-radius": "4px",
      padding: "4px 8px",
      "background-color": "black",
      color: "white",
      "font-size": "11px",
      "pointer-events": "none",
    });
    overlay.append(hint);

    const errorToast = ownerDocument.createElement("div");
    errorToast.dataset.mesurerScreenshotError = "true";
    errorToast.setAttribute("role", "status");
    errorToast.textContent = "Could not save screenshot";
    setStyle(errorToast, {
      position: "fixed",
      display: "none",
      "z-index": "97",
      "border-radius": "6px",
      padding: "6px 8px",
      "background-color": "#b42318",
      color: "white",
      "font-size": "11px",
      "pointer-events": "none",
    });
    root.append(errorToast);

    let origin: { x: number; y: number } | null = null;
    let toolbarVisibility: ToolbarVisibility | null = null;
    let errorTimer = 0;
    let operation = 0;
    let capturing = false;
    let preparing = false;
    let disposed = false;

    const active = () => ctx.state.get<boolean>(MESURER_SCREENSHOT_ACTIVE_STATE_ID) ?? false;
    const settings = () => readSettings(ctx.state.get);

    const updateSettings = (patch: Partial<MesurerScreenshotSettings>) => {
      ctx.state.update<ScreenshotStateValue>(MESURER_SCREENSHOT_SETTINGS_STATE_ID, (current) => {
        const next = { ...current };
        if (patch.copy !== undefined) next.copy = patch.copy;
        if (patch.download !== undefined) next.download = patch.download;
        return next;
      });
    };

    const setActive = (value: boolean) => {
      if (active() === value) return;
      ctx.state.update<boolean>(MESURER_SCREENSHOT_ACTIVE_STATE_ID, () => value);
    };

    const hideToolbar = () => {
      if (toolbarVisibility) return;
      const toolbar = runtime.portalTarget.querySelector<HTMLElement>("[data-mesurer-toolbar='true']");
      if (!toolbar) return;
      toolbarVisibility = {
        element: toolbar,
        visibility: {
          value: toolbar.style.getPropertyValue("visibility"),
          priority: toolbar.style.getPropertyPriority("visibility"),
        },
      };
      toolbar.style.setProperty("visibility", "hidden", "important");
    };

    const restoreToolbar = () => {
      if (!toolbarVisibility) return;
      const { element, visibility } = toolbarVisibility;
      toolbarVisibility = null;
      if (visibility.value || visibility.priority) {
        element.style.setProperty("visibility", visibility.value, visibility.priority);
      } else {
        element.style.removeProperty("visibility");
      }
    };

    const renderSelection = (rect: ScreenshotRect | null) => {
      const viewportWidth = ownerWindow.innerWidth;
      const viewportHeight = ownerWindow.innerHeight;
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        setRectStyle(shade[0], { left: 0, top: 0, width: viewportWidth, height: viewportHeight });
        for (const element of shade.slice(1)) setRectStyle(element, { left: 0, top: 0, width: 0, height: 0 });
        outline.style.display = "none";
        sizeTag.style.display = "none";
        return;
      }
      setRectStyle(shade[0], { left: 0, top: 0, width: viewportWidth, height: rect.top });
      setRectStyle(shade[1], { left: 0, top: rect.top, width: rect.left, height: rect.height });
      setRectStyle(shade[2], {
        left: rect.left + rect.width,
        top: rect.top,
        width: Math.max(0, viewportWidth - rect.left - rect.width),
        height: rect.height,
      });
      setRectStyle(shade[3], {
        left: 0,
        top: rect.top + rect.height,
        width: viewportWidth,
        height: Math.max(0, viewportHeight - rect.top - rect.height),
      });
      outline.style.display = "block";
      setRectStyle(outline, rect);
      sizeTag.style.display = "block";
      sizeTag.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
      setRectStyle(sizeTag, {
        left: rect.left + rect.width / 2,
        top: Math.min(viewportHeight - 22, rect.top + rect.height + 6),
      });
    };

    const toolbarAnchorRect = () =>
      runtime.portalTarget.querySelector<HTMLElement>("[data-mesurer-tool-id='screenshot']")
        ?.getBoundingClientRect() ?? null;

    const previewController = createScreenshotPreviewController({
      ownerDocument,
      ownerWindow,
      root,
      anchorRect: toolbarAnchorRect,
      previewDurationMs,
    });

    const placeFloatingStatus = (element: HTMLElement) => {
      const anchor = toolbarAnchorRect();
      const width = Math.max(140, element.offsetWidth || 140);
      const height = Math.max(26, element.offsetHeight || 26);
      const padding = 8;
      const left = anchor
        ? Math.min(ownerWindow.innerWidth - width - padding, Math.max(padding, anchor.left + anchor.width / 2 - width / 2))
        : padding;
      const below = anchor ? anchor.bottom + 8 : padding;
      const top = below + height <= ownerWindow.innerHeight - padding
        ? below
        : Math.max(padding, (anchor?.top ?? ownerWindow.innerHeight) - height - 8);
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    };

    const flashError = () => {
      if (errorTimer) ownerWindow.clearTimeout(errorTimer);
      errorToast.style.display = "block";
      placeFloatingStatus(errorToast);
      errorTimer = ownerWindow.setTimeout(() => {
        errorTimer = 0;
        errorToast.style.display = "none";
      }, ERROR_DURATION_MS);
    };

    const finishSelection = () => {
      origin = null;
      renderSelection(null);
      overlay.style.display = "none";
      root.style.pointerEvents = "none";
      setActive(false);
      restoreToolbar();
    };

    const cancel = () => {
      operation += 1;
      finishSelection();
      releaseScreenshotCapture(ownerWindow);
    };

    const capture = async (rect: ScreenshotRect): Promise<MesurerScreenshotResult> => {
      if (capturing) throw new Error("A screenshot capture is already running.");
      if (rect.width < MIN_SCREENSHOT_SELECTION || rect.height < MIN_SCREENSHOT_SELECTION) {
        throw new Error(`Screenshot selection must be at least ${MIN_SCREENSHOT_SELECTION}px by ${MIN_SCREENSHOT_SELECTION}px.`);
      }
      capturing = true;
      const operationId = ++operation;
      workspace.prepareCapture();
      try {
        await waitForNextPaint(ownerWindow);
        const full = await captureVisibleTab({ ownerDocument, ownerWindow } satisfies ScreenshotCaptureContext);
        const cropped = await cropPngToViewportRect(
          full,
          rect,
          { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
          ownerDocument,
        );
        if (operation !== operationId) throw new Error("Screenshot capture was cancelled.");

        const currentSettings = settings();
        let copied = false;
        let downloaded = false;
        const copyResult = currentSettings.copy
          ? copyPngToClipboard(Promise.resolve(cropped), ownerWindow).then(() => { copied = true; })
          : Promise.resolve();
        const downloadResult = currentSettings.download
          ? Promise.resolve().then(() => {
              downloadPng(cropped, createScreenshotFilename(), ownerDocument, ownerWindow);
              downloaded = true;
            })
          : Promise.resolve();
        const results = await Promise.allSettled([copyResult, downloadResult]);
        const copyFailed = currentSettings.copy && results[0]?.status === "rejected";
        const downloadFailed = currentSettings.download && results[1]?.status === "rejected";
        if (operation !== operationId) throw new Error("Screenshot capture was cancelled.");

        previewController.show(cropped, {
          copied,
          downloaded,
          copyFailed,
          downloadFailed,
        });
        await ctx.hook.emit("screenshot:capture", {
          rect: { ...rect },
          copied,
          downloaded,
        });
        return { blob: cropped, rect: { ...rect }, copied, downloaded };
      } catch (cause) {
        if (operation === operationId) flashError();
        throw cause;
      } finally {
        workspace.finishCapture();
        capturing = false;
      }
    };

    const start = async () => {
      if (active()) {
        cancel();
        return;
      }
      if (preparing) return;
      preparing = true;
      previewController.dismiss();
      try {
        if (options.captureVisibleTab === undefined) {
          await prepareScreenshotCapture(ownerDocument, ownerWindow);
        }
        if (disposed) return;
        hideToolbar();
        renderSelection(null);
        root.style.pointerEvents = "auto";
        overlay.style.display = "block";
        setActive(true);
      } catch (cause) {
        const aborted = cause instanceof Error && cause.name === "AbortError";
        if (!aborted) flashError();
        throw cause;
      } finally {
        preparing = false;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!active() || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      origin = { x: event.clientX, y: event.clientY };
      renderSelection(normalizeScreenshotRect(
        origin,
        origin,
        { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
      ));
      overlay.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!active() || !origin) return;
      renderSelection(normalizeScreenshotRect(
        origin,
        { x: event.clientX, y: event.clientY },
        { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
      ));
    };

    const onPointerUp = (event: PointerEvent) => {
      const startPoint = origin;
      origin = null;
      if (!active() || !startPoint) return;
      if (overlay.hasPointerCapture?.(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
      const rect = normalizeScreenshotRect(
        startPoint,
        { x: event.clientX, y: event.clientY },
        { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
      );
      renderSelection(rect);
      if (rect.width < MIN_SCREENSHOT_SELECTION || rect.height < MIN_SCREENSHOT_SELECTION) {
        renderSelection(null);
        return;
      }
      void capture(rect)
        .catch(() => undefined)
        .finally(() => {
          if (active()) finishSelection();
        });
    };

    const onPointerCancel = (event: PointerEvent) => {
      origin = null;
      if (overlay.hasPointerCapture?.(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
      renderSelection(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };

    overlay.addEventListener("pointerdown", onPointerDown);
    overlay.addEventListener("pointermove", onPointerMove);
    overlay.addEventListener("pointerup", onPointerUp);
    overlay.addEventListener("pointercancel", onPointerCancel);
    ownerWindow.addEventListener("keydown", onKeyDown, true);

    const service: MesurerScreenshotService = {
      active,
      settings,
      setSettings: updateSettings,
      start,
      cancel,
      capture,
    };

    ctx.tool.register({
      id: "screenshot",
      label: "Screenshot",
      order: 70,
      command: SCREENSHOT_COMMAND,
      icon: cameraIcon,
      active,
    });
    ctx.settings.register({
      id: "screenshot",
      label: "Screenshot",
      order: 40,
    });
    ctx.command.register(SCREENSHOT_COMMAND, start);
    ctx.service.provide(MESURER_SCREENSHOT_SERVICE_ID, service);
    ctx.lifecycle.onDispose(() => {
      disposed = true;
      operation += 1;
      overlay.removeEventListener("pointerdown", onPointerDown);
      overlay.removeEventListener("pointermove", onPointerMove);
      overlay.removeEventListener("pointerup", onPointerUp);
      overlay.removeEventListener("pointercancel", onPointerCancel);
      ownerWindow.removeEventListener("keydown", onKeyDown, true);
      if (errorTimer) ownerWindow.clearTimeout(errorTimer);
      previewController.dispose();
      restoreToolbar();
      releaseScreenshotCapture(ownerWindow);
      workspace.finishCapture();
      workspace.dispose();
      inspectorMount.dispose();
    });
  },
});

export type {
  ScreenshotCaptureContext,
  ScreenshotCaptureProvider,
  ScreenshotRect,
} from "../core/screenshot";
