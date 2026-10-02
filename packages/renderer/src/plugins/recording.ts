import {
  defineMesurerPlugin,
  type MesurerPlugin,
  type PluginValue,
} from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import {
  MIN_SCREENSHOT_SELECTION,
  normalizeScreenshotRect,
  type ScreenshotRect,
} from "../core/screenshot";
import {
  closeRecordingCapture,
  openRecordingCapture,
  paintRecordingFrame,
  recordingViewportMetrics,
  type RecordingCapture,
} from "../core/recording-capture";
import {
  createMediaBunnyCanvasRecorder,
  createRecordingFilename,
  exportMediaBunnyRecording,
  inspectMediaBunnyRecording,
  supportedRecordingFormats,
  type MediaBunnyCanvasRecorder,
  type RecordingExportFormat,
  type RecordingExportOptions,
  type RecordingQuality,
  type RecordingScale,
} from "../core/recording";
import {
  createRecordingPreviewController,
  type RecordingPreviewAsset,
  type RecordingPreviewController,
  type RecordingPreviewExportResult,
} from "./recording-preview";

export const MESURER_RECORDING_PLUGIN_ID = "mesurer.recording";

export const MESURER_RECORDING_SERVICE_ID = "recording:v1";

export const MESURER_RECORDING_SETTINGS_STATE_ID = "mesurer.recording.settings";

const RUNTIME_SERVICE_ID = "runtime:solid";

const TOGGLE_COMMAND = "recording.toggle";

const STOP_COMMAND = "recording.stop";

const DISCARD_COMMAND = "recording.discard";

const EXPORT_COMMAND = "recording.export";

const DEFAULT_FRAME_RATE = 30;

const DEFAULT_MAX_DURATION_SECONDS = 60;

const RECORDING_ERROR_DURATION_MS = 3000;

const recordingIcon = {
  viewBox: "0 0 24 24",
  paths: [
    "M7 5.75A3.25 3.25 0 0 0 3.75 9v6A3.25 3.25 0 0 0 7 18.25h7A3.25 3.25 0 0 0 17.25 15v-1.03l2.13 1.42a.75.75 0 0 0 1.17-.624V9.234a.75.75 0 0 0-1.17-.624l-2.13 1.42V9A3.25 3.25 0 0 0 14 5.75H7Zm10.25 6.082 1.8-1.2v2.736l-1.8-1.2v-.336Z",
    "M10.5 9.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Z",
  ],
};

export type MesurerRecordingStatus =
  | "idle"
  | "selecting"
  | "recording"
  | "ready"
  | "exporting"
  | "error";

export type MesurerRecordingSettings = {
  toolEnabled: boolean;
};

export type MesurerRecordingSnapshot = {
  status: MesurerRecordingStatus;
  elapsed: number;
  rect: ScreenshotRect | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  error: string | null;
};

export type MesurerRecordingAsset = RecordingPreviewAsset & {
  createdAt: number;
  format: "webm";
};

export type MesurerRecordingExportResult = RecordingPreviewExportResult;

export type MesurerRecordingPluginOptions = {
  toolEnabled?: boolean;
  frameRate?: number;
  maxDurationSeconds?: number;
  quality?: RecordingQuality;
};

export type MesurerRecordingService = {
  snapshot(): MesurerRecordingSnapshot;
  subscribe(listener: (snapshot: MesurerRecordingSnapshot) => void): () => void;
  formats(): Promise<RecordingExportFormat[]>;
  start(rect?: ScreenshotRect): Promise<void>;
  stop(): Promise<MesurerRecordingAsset>;
  cancel(): Promise<void>;
  discard(): void;
  export(options?: RecordingExportOptions): Promise<MesurerRecordingExportResult>;
};

type RecordingSettingsValue = {
  [key: string]: PluginValue;
  toolEnabled: boolean;
};

type ToolbarVisibility = {
  element: HTMLElement;
  value: string;
  priority: string;
};

type ExportCommandOptions = {
  format?: RecordingExportFormat;
  startTime?: number;
  endTime?: number;
  scale?: RecordingScale;
};

const cloneRect = (rect: ScreenshotRect | null): ScreenshotRect | null =>
  rect ? { ...rect } : null;

const snapshotValue = (
  snapshot: MesurerRecordingSnapshot,
): MesurerRecordingSnapshot => ({
  ...snapshot,
  rect: cloneRect(snapshot.rect),
});

const setStyle = (
  element: HTMLElement,
  styles: Record<string, string>,
) => {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value);
  }
};

const isPluginObject = (
  value: PluginValue | undefined,
): value is { [key: string]: PluginValue } =>
  value !== null
  && value !== undefined
  && !Array.isArray(value)
  && typeof value === "object";

const isFinitePluginNumber = (
  value: PluginValue | undefined,
): value is number =>
  typeof value === "number" && Number.isFinite(value);

const parseExportCommandOptions = (
  value: PluginValue | undefined,
): ExportCommandOptions => {
  if (!isPluginObject(value)) return {};

  const next: ExportCommandOptions = {};

  if (value.format === "webm" || value.format === "mp4") next.format = value.format;

  if (isFinitePluginNumber(value.startTime)) next.startTime = value.startTime;

  if (isFinitePluginNumber(value.endTime)) next.endTime = value.endTime;

  if (value.scale === 1 || value.scale === 2 || value.scale === 3) next.scale = value.scale;

  return next;
};

const snapshotDescriptor = (
  snapshot: MesurerRecordingSnapshot,
): PluginValue => ({
  status: snapshot.status,
  elapsed: snapshot.elapsed,
  rect: snapshot.rect ? { ...snapshot.rect } : null,
  duration: snapshot.duration,
  width: snapshot.width,
  height: snapshot.height,
  error: snapshot.error,
});

const exportDescriptor = (
  result: MesurerRecordingExportResult,
): PluginValue => ({
  filename: result.filename,
  format: result.format,
  duration: result.duration,
  width: result.width,
  height: result.height,
  bytes: result.blob.size,
});

const assetDescriptor = (
  asset: MesurerRecordingAsset,
): PluginValue => ({
  format: asset.format,
  duration: asset.duration,
  width: asset.width,
  height: asset.height,
  bytes: asset.blob.size,
  createdAt: asset.createdAt,
});

const downloadRecording = (
  result: MesurerRecordingExportResult,
  ownerDocument: Document,
  ownerWindow: Window,
) => {
  const url = globalThis.URL.createObjectURL(result.blob);
  const link = ownerDocument.createElement("a");
  link.href = url;
  link.download = result.filename;
  link.rel = "noopener";
  ownerDocument.documentElement.append(link);
  link.click();
  link.remove();
  ownerWindow.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
};

export const recordingPlugin = (
  options: MesurerRecordingPluginOptions = {},
): MesurerPlugin => defineMesurerPlugin({
  id: MESURER_RECORDING_PLUGIN_ID,
  version: "0.1.0",
  requires: [RUNTIME_SERVICE_ID],
  provides: ["tool:recording", MESURER_RECORDING_SERVICE_ID],
  setup(ctx) {
    const runtime = ctx.service.get<MesurerSolidRuntimeService>(RUNTIME_SERVICE_ID);

    if (!runtime) throw new Error("Recording plugin requires the Solid renderer runtime.");

    const { ownerDocument, ownerWindow } = runtime;
    const inspectorMount = runtime.createInspectorMount();
    const root = inspectorMount.element;

    root.dataset.mesurerRecording = "true";

    setStyle(root, {
      position: "fixed",
      inset: "0",
      "z-index": "86",
      "pointer-events": "none",
      "font-family": "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    });

    const frameRate = Math.max(
      1,
      Math.min(60, Math.round(options.frameRate ?? DEFAULT_FRAME_RATE)),
    );

    const maxDurationSeconds = Math.max(
      1,
      Math.min(600, options.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS),
    );

    const recordingQuality = options.quality ?? "medium";

    ctx.state.register<RecordingSettingsValue>({
      id: MESURER_RECORDING_SETTINGS_STATE_ID,
      initial: {
        toolEnabled: options.toolEnabled ?? true,
      },
      persist: true,
    });

    const readSettings = (): MesurerRecordingSettings => {
      const stored = ctx.state.get<RecordingSettingsValue>(MESURER_RECORDING_SETTINGS_STATE_ID);

      return {
        toolEnabled: stored?.toolEnabled ?? true,
      };
    };

    const setSettings = (patch: Partial<MesurerRecordingSettings>) => {
      ctx.state.update<RecordingSettingsValue>(MESURER_RECORDING_SETTINGS_STATE_ID, (current) => {
        const next = { ...current };

        if (patch.toolEnabled !== undefined) next.toolEnabled = patch.toolEnabled;

        return next;
      });
    };

    const overlay = ownerDocument.createElement("div");
    overlay.dataset.mesurerRecordingSelect = "true";
    overlay.dataset.mesurerInspectorUi = "true";
    overlay.setAttribute("role", "application");
    overlay.setAttribute("aria-label", "Recording selection");
    setStyle(overlay, {
      position: "fixed",
      inset: "0",
      display: "none",
      "z-index": "86",
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
        background: "rgb(0 0 0 / 40%)",
        "pointer-events": "none",
      });
      overlay.append(element);

      return element;
    });

    const outline = ownerDocument.createElement("div");
    outline.dataset.mesurerRecordingSelection = "true";
    setStyle(outline, {
      position: "fixed",
      display: "none",
      border: "1px solid var(--msr-accent, #0d99ff)",
      "box-sizing": "border-box",
      "pointer-events": "none",
    });
    overlay.append(outline);

    const sizeTag = ownerDocument.createElement("div");
    setStyle(sizeTag, {
      position: "fixed",
      display: "none",
      transform: "translateX(-50%)",
      padding: "2px 5px",
      "border-radius": "4px",
      background: "var(--msr-accent, #0d99ff)",
      color: "#fff",
      "font-size": "10px",
      "font-variant-numeric": "tabular-nums",
      "pointer-events": "none",
    });
    overlay.append(sizeTag);

    const hint = ownerDocument.createElement("div");
    hint.textContent = "Drag a region to record · Esc to cancel";
    setStyle(hint, {
      position: "fixed",
      left: "50%",
      bottom: "16px",
      transform: "translateX(-50%)",
      padding: "5px 8px",
      "border-radius": "6px",
      background: "var(--msr-content, #18181b)",
      color: "var(--msr-surface, #fff)",
      "font-size": "11px",
      "pointer-events": "none",
    });
    overlay.append(hint);

    const selectionPanel = ownerDocument.createElement("div");
    selectionPanel.dataset.mesurerRecordingRegion = "true";
    selectionPanel.dataset.mesurerInspectorUi = "true";
    selectionPanel.setAttribute("role", "dialog");
    selectionPanel.setAttribute("aria-label", "Recording region");
    setStyle(selectionPanel, {
      position: "fixed",
      display: "none",
      width: "220px",
      padding: "8px",
      "z-index": "90",
      "box-sizing": "border-box",
      overflow: "hidden",
      "border-radius": "10px",
      background: "var(--msr-surface-raised, #fff)",
      color: "var(--msr-content, #18181b)",
      "box-shadow": "var(--msr-shadow-floating, 0 10px 30px rgba(0,0,0,.12))",
      "font-size": "11px",
      "pointer-events": "auto",
      transform: "translateX(-50%)",
    });
    overlay.append(selectionPanel);

    const makeFieldRow = (label: string) => {
      const row = ownerDocument.createElement("label");
      setStyle(row, {
        display: "grid",
        "grid-template-columns": "44px minmax(0,1fr)",
        "align-items": "center",
        gap: "8px",
      });
      const text = ownerDocument.createElement("span");
      text.textContent = label;
      text.style.color = "var(--msr-color-ink-500, #64748b)";
      row.append(text);
      const fields = ownerDocument.createElement("div");
      setStyle(fields, {
        display: "flex",
        "align-items": "center",
        gap: "4px",
        "min-width": "0",
      });
      row.append(fields);
      selectionPanel.append(row);

      return fields;
    };

    const makeNumberInput = (label: string) => {
      const input = ownerDocument.createElement("input");
      input.type = "number";
      input.setAttribute("aria-label", label);
      input.step = "1";
      setStyle(input, {
        width: "0",
        "min-width": "0",
        "flex": "1 1 0",
        height: "26px",
        padding: "0 6px",
        border: "1px solid var(--msr-color-ink-200, #e2e8f0)",
        "border-radius": "6px",
        background: "var(--msr-surface, #fff)",
        color: "var(--msr-content, #18181b)",
        "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
        "font-size": "10px",
        "font-variant-numeric": "tabular-nums",
      });

      return input;
    };

    const sizeFields = makeFieldRow("Size");
    const widthInput = makeNumberInput("Width");
    const heightInput = makeNumberInput("Height");
    sizeFields.append(widthInput);
    const sizeTimes = ownerDocument.createElement("span");
    sizeTimes.textContent = "×";
    sizeTimes.style.color = "var(--msr-color-ink-500, #64748b)";
    sizeFields.append(sizeTimes, heightInput);
    const sizeUnit = ownerDocument.createElement("span");
    sizeUnit.textContent = "px";
    sizeUnit.style.color = "var(--msr-color-ink-500, #64748b)";
    sizeFields.append(sizeUnit);

    const positionFields = makeFieldRow("Position");
    positionFields.style.marginTop = "8px";
    const leftInput = makeNumberInput("Left");
    const topInput = makeNumberInput("Top");
    positionFields.append(leftInput, topInput);
    const positionUnit = ownerDocument.createElement("span");
    positionUnit.textContent = "px";
    positionUnit.style.color = "var(--msr-color-ink-500, #64748b)";
    positionFields.append(positionUnit);

    const startRecordingButton = ownerDocument.createElement("button");
    startRecordingButton.type = "button";
    startRecordingButton.dataset.mesurerRecordingStart = "true";
    startRecordingButton.textContent = "●  Start recording";
    setStyle(startRecordingButton, {
      width: "100%",
      height: "28px",
      "margin-top": "8px",
      border: "1px solid var(--msr-color-ink-200, #e2e8f0)",
      "border-radius": "7px",
      background: "var(--msr-surface-raised, #fff)",
      color: "var(--msr-content, #18181b)",
      "font-family": "inherit",
      "font-size": "11px",
      "font-weight": "500",
      cursor: "pointer",
    });
    selectionPanel.append(startRecordingButton);

    const selectionGrid = ownerDocument.createElement("div");
    selectionGrid.dataset.mesurerRecordingGrid = "true";
    setStyle(selectionGrid, {
      position: "absolute",
      inset: "0",
      display: "none",
      "pointer-events": "none",
    });
    outline.append(selectionGrid);

    const addGridLine = (styles: Record<string, string>) => {
      const line = ownerDocument.createElement("div");
      setStyle(line, {
        position: "absolute",
        opacity: "0.3",
        ...styles,
      });
      selectionGrid.append(line);
    };

    addGridLine({ left: "33.333%", top: "0", bottom: "0", borderLeft: "1px dashed var(--msr-color-ink-500, #64748b)" });
    addGridLine({ left: "66.666%", top: "0", bottom: "0", borderLeft: "1px dashed var(--msr-color-ink-500, #64748b)" });
    addGridLine({ top: "33.333%", left: "0", right: "0", borderTop: "1px dashed var(--msr-color-ink-500, #64748b)" });
    addGridLine({ top: "66.666%", left: "0", right: "0", borderTop: "1px dashed var(--msr-color-ink-500, #64748b)" });

    const resizeHandlePositions = {
      nw: { left: "0", top: "0" },
      n: { left: "50%", top: "0" },
      ne: { left: "100%", top: "0" },
      e: { left: "100%", top: "50%" },
      se: { left: "100%", top: "100%" },
      s: { left: "50%", top: "100%" },
      sw: { left: "0", top: "100%" },
      w: { left: "0", top: "50%" },
    } as const;

    const resizeHandles = Object.entries(resizeHandlePositions).map(([handle, position]) => {
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.dataset.mesurerRecordingResize = handle;
      button.setAttribute("aria-label", `Resize ${handle}`);
      setStyle(button, {
        position: "absolute",
        display: "none",
        left: position.left,
        top: position.top,
        width: "8px",
        height: "8px",
        padding: "0",
        border: "1px solid var(--msr-color-white, #fff)",
        "border-radius": "999px",
        background: "var(--msr-color-ink-900, #18181b)",
        "box-shadow": "0 0 0 1px rgb(0 0 0 / 25%)",
        transform: "translate(-50%, -50%)",
        cursor: handle === "n" || handle === "s"
          ? "ns-resize"
          : handle === "e" || handle === "w"
            ? "ew-resize"
            : handle === "nw" || handle === "se"
              ? "nwse-resize"
              : "nesw-resize",
        "pointer-events": "auto",
      });
      outline.append(button);

      return button;
    });

    const recordingStatus = ownerDocument.createElement("section");
    recordingStatus.dataset.mesurerRecordingStatus = "true";
    recordingStatus.dataset.mesurerInspectorUi = "true";
    recordingStatus.setAttribute("aria-label", "Screen recording");
    setStyle(recordingStatus, {
      position: "fixed",
      display: "none",
      height: "34px",
      padding: "0 8px",
      "align-items": "center",
      gap: "8px",
      border: "0",
      "border-radius": "9px",
      background: "var(--msr-surface-raised, #fff)",
      color: "var(--msr-content, #18181b)",
      "box-shadow": "var(--msr-shadow-floating, 0 8px 24px rgba(0,0,0,.14))",
      "font-family": "inherit",
      "font-size": "11px",
      "pointer-events": "auto",
    });

    const recordingDot = ownerDocument.createElement("span");
    recordingDot.setAttribute("aria-hidden", "true");
    setStyle(recordingDot, {
      width: "6px",
      height: "6px",
      "border-radius": "999px",
      background: "var(--msr-danger-solid-bg, #dc2626)",
      "flex-shrink": "0",
    });
    recordingStatus.append(recordingDot);

    const recordingTime = ownerDocument.createElement("span");
    recordingTime.dataset.mesurerRecordingTime = "true";
    recordingTime.textContent = "00:00";
    setStyle(recordingTime, {
      color: "var(--msr-content, #18181b)",
      "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
      "font-size": "11px",
      "font-variant-numeric": "tabular-nums",
    });
    recordingStatus.append(recordingTime);

    const recordingStop = ownerDocument.createElement("button");
    recordingStop.type = "button";
    recordingStop.dataset.mesurerRecordingStop = "true";
    recordingStop.textContent = "Stop";
    recordingStop.setAttribute("aria-label", "Stop recording");
    setStyle(recordingStop, {
      height: "24px",
      padding: "0 8px",
      border: "0",
      "border-radius": "6px",
      background: "var(--msr-danger-solid-bg, #dc2626)",
      color: "var(--msr-danger-solid-text, #fff)",
      "font-family": "inherit",
      "font-size": "11px",
      "font-weight": "500",
      cursor: "pointer",
    });
    recordingStatus.append(recordingStop);
    root.append(recordingStatus);

    const errorToast = ownerDocument.createElement("div");
    errorToast.dataset.mesurerRecordingError = "true";
    errorToast.dataset.mesurerInspectorUi = "true";
    errorToast.setAttribute("role", "status");
    setStyle(errorToast, {
      position: "fixed",
      display: "none",
      left: "8px",
      top: "8px",
      "z-index": "99",
      padding: "6px 8px",
      "border-radius": "6px",
      background: "var(--msr-danger, #b42318)",
      color: "#fff",
      "font-size": "11px",
      "pointer-events": "none",
    });

    root.append(errorToast);

    let currentSnapshot: MesurerRecordingSnapshot = {
      status: "idle",
      elapsed: 0,
      rect: null,
      duration: null,
      width: null,
      height: null,
      error: null,
    };

    const subscribers = new Set<(snapshot: MesurerRecordingSnapshot) => void>();
    let asset: MesurerRecordingAsset | null = null;
    let capture: RecordingCapture | null = null;
    let recorder: MediaBunnyCanvasRecorder | null = null;
    let pendingFrame: Promise<void> | null = null;
    let selectingOrigin: { x: number; y: number } | null = null;

    let selectionRect: ScreenshotRect | null = null;
    let selectionAdjusting = false;
    let selectionDrag: {
      kind: "move" | "resize";
      handle?: string;
      pointerId: number;
      startX: number;
      startY: number;
      rect: ScreenshotRect;
    } | null = null;

    let toolbarVisibility: ToolbarVisibility | null = null;
    let frameHandle = 0;
    let maxDurationTimer = 0;
    let errorTimer = 0;
    let operation = 0;
    let startedAt = 0;
    let lastFrameTimestamp = -1;
    let disposed = false;
    let stopPromise: Promise<MesurerRecordingAsset> | null = null;

    const notify = () => {
      const value = snapshotValue(currentSnapshot);

      for (const subscriber of subscribers) subscriber(value);
    };

    const updateSnapshot = (
      patch: Partial<MesurerRecordingSnapshot>,
    ) => {
      currentSnapshot = {
        ...currentSnapshot,
        ...patch,
        rect: patch.rect === undefined ? currentSnapshot.rect : cloneRect(patch.rect),
      };
      notify();
    };

    const active = () =>
      currentSnapshot.status === "selecting"
      || currentSnapshot.status === "recording"
      || currentSnapshot.status === "exporting";

    const hideToolbar = () => {
      if (toolbarVisibility) return;
      const toolbar = runtime.portalTarget.querySelector<HTMLElement>("[data-mesurer-toolbar='true']");

      if (!toolbar) return;
      toolbarVisibility = {
        element: toolbar,
        value: toolbar.style.getPropertyValue("visibility"),
        priority: toolbar.style.getPropertyPriority("visibility"),
      };
      toolbar.style.setProperty("visibility", "hidden", "important");
    };

    const restoreToolbar = () => {
      if (!toolbarVisibility) return;
      const previous = toolbarVisibility;
      toolbarVisibility = null;

      if (previous.value || previous.priority) {
        previous.element.style.setProperty("visibility", previous.value, previous.priority);
      } else {
        previous.element.style.removeProperty("visibility");
      }
    };

    const setRectStyle = (
      element: HTMLElement,
      rect: Partial<Record<"left" | "top" | "width" | "height", number>>,
    ) => {
      for (const property of ["left", "top", "width", "height"] as const) {
        const value = rect[property];

        if (value === undefined) element.style.removeProperty(property);
        else element.style.setProperty(property, `${value}px`);
      }
    };

    const clampSelectionRect = (rect: ScreenshotRect): ScreenshotRect => {
      const viewportWidth = ownerWindow.innerWidth;
      const viewportHeight = ownerWindow.innerHeight;
      const width = Math.min(viewportWidth, Math.max(MIN_SCREENSHOT_SELECTION, Math.round(rect.width)));
      const height = Math.min(viewportHeight, Math.max(MIN_SCREENSHOT_SELECTION, Math.round(rect.height)));

      return {
        left: Math.min(Math.max(0, Math.round(rect.left)), Math.max(0, viewportWidth - width)),
        top: Math.min(Math.max(0, Math.round(rect.top)), Math.max(0, viewportHeight - height)),
        width,
        height,
      };
    };

    const pointInsideRect = (
      rect: ScreenshotRect,
      point: { x: number; y: number },
    ) =>
      point.x >= rect.left
      && point.x <= rect.left + rect.width
      && point.y >= rect.top
      && point.y <= rect.top + rect.height;

    const renderSelection = (rect: ScreenshotRect | null) => {
      const viewportWidth = ownerWindow.innerWidth;
      const viewportHeight = ownerWindow.innerHeight;

      if (!rect || rect.width <= 0 || rect.height <= 0) {
        setRectStyle(shade[0], { left: 0, top: 0, width: viewportWidth, height: viewportHeight });

        for (const element of shade.slice(1)) {
          setRectStyle(element, { left: 0, top: 0, width: 0, height: 0 });
        }

        outline.style.display = "none";
        outline.style.pointerEvents = "none";
        selectionGrid.style.display = "none";

        for (const handle of resizeHandles) handle.style.display = "none";

        sizeTag.style.display = "none";
        selectionPanel.style.display = "none";
        hint.textContent = "Drag to select a region · Esc to cancel";

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

      if (selectionAdjusting) {
        outline.style.pointerEvents = "auto";
        outline.style.cursor = "move";
        selectionGrid.style.display = "block";

        for (const handle of resizeHandles) handle.style.display = "block";

        sizeTag.style.display = "none";
        widthInput.value = String(Math.round(rect.width));
        heightInput.value = String(Math.round(rect.height));
        leftInput.value = String(Math.round(rect.left));
        topInput.value = String(Math.round(rect.top));
        widthInput.max = String(viewportWidth);
        heightInput.max = String(viewportHeight);
        leftInput.max = String(Math.max(0, viewportWidth - rect.width));
        topInput.max = String(Math.max(0, viewportHeight - rect.height));

        const panelHalfWidth = 110;

        const panelLeft = Math.min(
          Math.max(panelHalfWidth + 8, rect.left + rect.width / 2),
          Math.max(panelHalfWidth + 8, viewportWidth - panelHalfWidth - 8),
        );

        const preferredTop = rect.top + rect.height + 12;

        const panelTop = preferredTop + 112 <= viewportHeight
          ? preferredTop
          : Math.max(8, rect.top - 112);

        selectionPanel.style.left = `${panelLeft}px`;
        selectionPanel.style.top = `${panelTop}px`;
        selectionPanel.style.display = "block";
        hint.textContent = "Adjust region · Enter to start · Esc to cancel";
      } else {
        outline.style.pointerEvents = "none";
        outline.style.cursor = "";
        selectionGrid.style.display = "none";

        for (const handle of resizeHandles) handle.style.display = "none";

        selectionPanel.style.display = "none";
        sizeTag.style.display = "block";
        sizeTag.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
        setRectStyle(sizeTag, {
          left: rect.left + rect.width / 2,
          top: Math.min(viewportHeight - 22, rect.top + rect.height + 6),
        });
        hint.textContent = "Drag to select a region · Esc to cancel";
      }
    };

    const updateSelectionRect = (next: ScreenshotRect) => {
      const clamped = clampSelectionRect(next);

      selectionRect = clamped;
      updateSnapshot({ rect: clamped });
      renderSelection(clamped);
    };

    const finishSelection = () => {
      selectingOrigin = null;
      selectionRect = null;
      selectionAdjusting = false;
      selectionDrag = null;
      renderSelection(null);
      overlay.style.display = "none";
      overlay.style.cursor = "crosshair";
      root.style.pointerEvents = "none";
    };

    const placeRecordingStatus = (rect: ScreenshotRect) => {
      const height = 30;
      const gap = 8;
      const viewportHeight = ownerWindow.innerHeight;
      const viewportWidth = ownerWindow.innerWidth;
      const width = Math.max(112, recordingStatus.offsetWidth || 112);
      let top: number | null = null;

      if (rect.top >= height + gap + 8) {
        top = rect.top - height - gap;
      } else if (viewportHeight - (rect.top + rect.height) >= height + gap + 8) {
        top = rect.top + rect.height + gap;
      }

      if (top === null) {
        recordingStatus.style.display = "none";

        return;
      }

      const left = Math.min(
        viewportWidth - width - 8,
        Math.max(8, rect.left + rect.width / 2 - width / 2),
      );

      recordingStatus.style.left = `${left}px`;
      recordingStatus.style.top = `${top}px`;
      recordingStatus.style.display = "flex";
    };

    const hideRecordingStatus = () => {
      recordingStatus.style.display = "none";
    };

    const flashError = (cause: unknown) => {
      if (errorTimer) ownerWindow.clearTimeout(errorTimer);
      const message = cause instanceof Error ? cause.message : "Could not record this region.";
      errorToast.textContent = message;
      errorToast.style.display = "block";
      errorTimer = ownerWindow.setTimeout(() => {
        errorTimer = 0;
        errorToast.style.display = "none";
      }, RECORDING_ERROR_DURATION_MS);
    };

    const releaseCapture = async (
      cancelRecorder: boolean,
    ) => {
      if (frameHandle) ownerWindow.cancelAnimationFrame(frameHandle);
      frameHandle = 0;

      if (maxDurationTimer) ownerWindow.clearTimeout(maxDurationTimer);
      maxDurationTimer = 0;

      const pending = pendingFrame;
      pendingFrame = null;

      if (pending) {
        try {
          await pending;
        } catch {
          // The caller owns the primary recording error. Cleanup still must continue.
        }
      }

      const currentRecorder = recorder;
      recorder = null;

      if (cancelRecorder) await currentRecorder?.cancel();

      const currentCapture = capture;
      capture = null;

      if (currentCapture) closeRecordingCapture(currentCapture);
      hideRecordingStatus();
    };

    const discard = () => {
      asset = null;
      preview.dismiss();
      updateSnapshot({
        status: "idle",
        elapsed: 0,
        rect: null,
        duration: null,
        width: null,
        height: null,
        error: null,
      });
      void ctx.hook.emit("recording:discard", {});
    };

    const formats = async () => {
      const current = asset;
      const width = current?.width ?? Math.max(2, Math.round(ownerWindow.innerWidth));
      const height = current?.height ?? Math.max(2, Math.round(ownerWindow.innerHeight));

      return supportedRecordingFormats(width, height, frameRate);
    };

    const exportClip = async (
      exportOptions: RecordingExportOptions = {},
    ): Promise<MesurerRecordingExportResult> => {
      const current = asset;

      if (!current) throw new Error("No recording is ready to export.");
      const previousStatus = currentSnapshot.status;

      updateSnapshot({ status: "exporting", error: null });

      try {
        const exported = await exportMediaBunnyRecording(current.blob, exportOptions);

        const result: MesurerRecordingExportResult = {
          ...exported,
          filename: createRecordingFilename(exported.format),
        };

        updateSnapshot({
          status: "ready",
          duration: current.duration,
          width: current.width,
          height: current.height,
          error: null,
        });
        await ctx.hook.emit("recording:export", {
          filename: result.filename,
          format: result.format,
          duration: result.duration,
          width: result.width,
          height: result.height,
          bytes: result.blob.size,
        });

        return result;
      } catch (cause) {
        updateSnapshot({
          status: previousStatus === "ready" ? "ready" : "error",
          error: cause instanceof Error ? cause.message : "Could not export the recording.",
        });
        throw cause;
      }
    };

    const preview: RecordingPreviewController = createRecordingPreviewController({
      ownerDocument,
      ownerWindow,
      root,
      formats: async () => formats(),
      onDiscard: discard,
      onExport: exportClip,
    });

    const finishRecording = async (): Promise<MesurerRecordingAsset> => {
      if (stopPromise) return stopPromise;

      if (currentSnapshot.status !== "recording" || !recorder || !capture) {
        throw new Error("No recording is active.");
      }

      const operationId = operation;
      const currentRecorder = recorder;
      const currentCapture = capture;
      const rect = cloneRect(currentSnapshot.rect);

      if (!rect) throw new Error("Recording region is unavailable.");

      stopPromise = (async () => {
        if (frameHandle) ownerWindow.cancelAnimationFrame(frameHandle);
        frameHandle = 0;

        if (maxDurationTimer) ownerWindow.clearTimeout(maxDurationTimer);
        maxDurationTimer = 0;

        const pending = pendingFrame;
        pendingFrame = null;

        if (pending) await pending;

        const blob = await currentRecorder.finalize();

        recorder = null;
        capture = null;
        closeRecordingCapture(currentCapture);

        if (operation !== operationId || disposed) {
          throw new Error("Recording was cancelled.");
        }

        const info = await inspectMediaBunnyRecording(blob);

        const nextAsset: MesurerRecordingAsset = {
          blob,
          format: "webm",
          duration: info.duration,
          width: info.width,
          height: info.height,
          createdAt: Date.now(),
        };

        asset = nextAsset;
        hideRecordingStatus();
        restoreToolbar();
        root.style.pointerEvents = "none";
        updateSnapshot({
          status: "ready",
          elapsed: info.duration,
          duration: info.duration,
          width: info.width,
          height: info.height,
          error: null,
        });
        preview.show(nextAsset);
        await ctx.hook.emit("recording:ready", {
          rect,
          duration: info.duration,
          width: info.width,
          height: info.height,
          bytes: blob.size,
        });

        return nextAsset;
      })().catch(async (cause) => {
        await releaseCapture(true);
        restoreToolbar();

        if (operation === operationId && !disposed) {
          const message = cause instanceof Error ? cause.message : "Could not finish the recording.";
          updateSnapshot({ status: "error", error: message });
          flashError(cause);
        }

        throw cause;
      }).finally(() => {
        stopPromise = null;
      });

      return stopPromise;
    };

    const startFramePump = (
      nextCapture: RecordingCapture,
      nextRecorder: MediaBunnyCanvasRecorder,
      operationId: number,
    ) => {
      const frameInterval = 1 / frameRate;

      const tick = (now: number) => {
        if (
          disposed
          || operation !== operationId
          || currentSnapshot.status !== "recording"
          || recorder !== nextRecorder
          || capture !== nextCapture
        ) {
          return;
        }

        const elapsed = Math.max(0, (now - startedAt) / 1000);

        updateSnapshot({ elapsed });
        recordingTime.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;

        const timestamp = elapsed;

        if (!pendingFrame && timestamp - lastFrameTimestamp >= frameInterval * 0.8) {
          paintRecordingFrame(
            nextCapture,
            currentSnapshot.rect ?? {
              left: 0,
              top: 0,
              width: ownerWindow.innerWidth,
              height: ownerWindow.innerHeight,
            },
            recordingViewportMetrics(ownerWindow),
          );
          lastFrameTimestamp = timestamp;
          pendingFrame = nextRecorder.addFrame(timestamp, frameInterval)
            .catch((cause) => {
              if (operation === operationId && !disposed) {
                void releaseCapture(true).then(() => {
                  restoreToolbar();
                  const message = cause instanceof Error ? cause.message : "MediaBunny could not encode the recording.";
                  updateSnapshot({ status: "error", error: message });
                  flashError(cause);
                });
              }

              throw cause;
            })
            .finally(() => {
              pendingFrame = null;
            });
        }

        frameHandle = ownerWindow.requestAnimationFrame(tick);
      };

      frameHandle = ownerWindow.requestAnimationFrame(tick);
    };

    const beginRecording = async (
      rect: ScreenshotRect,
    ) => {
      const operationId = ++operation;
      preview.dismiss();
      asset = null;
      finishSelection();
      restoreToolbar();
      updateSnapshot({
        status: "selecting",
        elapsed: 0,
        rect,
        duration: null,
        width: null,
        height: null,
        error: null,
      });

      try {
        const nextCapture = await openRecordingCapture(ownerDocument, ownerWindow, rect);

        if (disposed || operation !== operationId) {
          closeRecordingCapture(nextCapture);

          return;
        }

        const nextRecorder = await createMediaBunnyCanvasRecorder(nextCapture.canvas, {
          format: "webm",
          frameRate,
          quality: recordingQuality,
        });

        if (disposed || operation !== operationId) {
          await nextRecorder.cancel();
          closeRecordingCapture(nextCapture);

          return;
        }

        capture = nextCapture;
        recorder = nextRecorder;
        startedAt = ownerWindow.performance.now();
        lastFrameTimestamp = 0;
        paintRecordingFrame(
          nextCapture,
          rect,
          recordingViewportMetrics(ownerWindow),
        );
        await nextRecorder.addFrame(0, 1 / frameRate);

        if (disposed || operation !== operationId) {
          await releaseCapture(true);

          return;
        }

        updateSnapshot({ status: "recording", elapsed: 0 });
        root.style.pointerEvents = "none";
        recordingTime.textContent = "00:00";
        placeRecordingStatus(rect);
        startFramePump(nextCapture, nextRecorder, operationId);
        nextCapture.track.addEventListener("ended", () => {
          if (operation === operationId && currentSnapshot.status === "recording") {
            void finishRecording().catch(() => undefined);
          }
        }, { once: true });
        maxDurationTimer = ownerWindow.setTimeout(() => {
          if (operation === operationId && currentSnapshot.status === "recording") {
            void finishRecording().catch(() => undefined);
          }
        }, maxDurationSeconds * 1000);

        await ctx.hook.emit("recording:start", {
          rect: { ...rect },
          frameRate,
          maxDurationSeconds,
        });
      } catch (cause) {
        await releaseCapture(true);
        restoreToolbar();

        if (operation !== operationId || disposed) return;

        const aborted = cause instanceof DOMException && cause.name === "AbortError";

        const message = aborted
          ? null
          : cause instanceof Error
            ? cause.message
            : "Could not start the recording.";

        updateSnapshot({
          status: aborted ? "idle" : "error",
          rect: aborted ? null : rect,
          error: message,
        });

        if (!aborted) flashError(cause);

        throw cause;
      }
    };

    const startSelection = () => {
      if (currentSnapshot.status === "selecting") return;
      ++operation;
      preview.dismiss();
      asset = null;
      selectionRect = null;
      selectionAdjusting = false;
      selectionDrag = null;
      hideToolbar();
      renderSelection(null);
      overlay.style.display = "block";
      root.style.pointerEvents = "auto";
      updateSnapshot({
        status: "selecting",
        elapsed: 0,
        rect: null,
        duration: null,
        width: null,
        height: null,
        error: null,
      });
    };

    const start = async (
      rect?: ScreenshotRect,
    ) => {
      if (currentSnapshot.status === "recording") {
        await finishRecording();

        return;
      }

      if (currentSnapshot.status === "selecting") {
        await cancel();

        return;
      }

      if (!rect) {
        startSelection();

        return;
      }

      if (rect.width < MIN_SCREENSHOT_SELECTION || rect.height < MIN_SCREENSHOT_SELECTION) {
        throw new Error(
          `Recording selection must be at least ${MIN_SCREENSHOT_SELECTION}px by ${MIN_SCREENSHOT_SELECTION}px.`,
        );
      }

      await beginRecording(rect);
    };

    const cancel = async () => {
      ++operation;
      finishSelection();
      await releaseCapture(true);
      restoreToolbar();

      if (currentSnapshot.status === "ready") return;
      updateSnapshot({
        status: "idle",
        elapsed: 0,
        rect: null,
        duration: null,
        width: null,
        height: null,
        error: null,
      });
    };

    const beginSelectionDrag = (
      event: PointerEvent,
      kind: "move" | "resize",
      handle?: string,
    ) => {
      const rect = selectionRect;

      if (!selectionAdjusting || !rect || event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();
      selectionDrag = {
        kind,
        handle,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        rect: { ...rect },
      };
      overlay.setPointerCapture?.(event.pointerId);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (currentSnapshot.status !== "selecting" || event.button !== 0) return;

      if (
        selectionAdjusting
        && selectionRect
        && pointInsideRect(selectionRect, { x: event.clientX, y: event.clientY })
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      selectionAdjusting = false;
      selectionRect = null;
      updateSnapshot({ rect: null });
      overlay.style.cursor = "crosshair";
      selectingOrigin = { x: event.clientX, y: event.clientY };
      renderSelection(normalizeScreenshotRect(
        selectingOrigin,
        selectingOrigin,
        { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
      ));
      overlay.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (currentSnapshot.status !== "selecting") return;

      if (selectionDrag) {
        const drag = selectionDrag;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        const viewportWidth = ownerWindow.innerWidth;
        const viewportHeight = ownerWindow.innerHeight;

        if (drag.kind === "move") {
          updateSelectionRect({
            ...drag.rect,
            left: drag.rect.left + dx,
            top: drag.rect.top + dy,
          });

          return;
        }

        const handle = drag.handle ?? "";
        let left = drag.rect.left;
        let top = drag.rect.top;
        let right = drag.rect.left + drag.rect.width;
        let bottom = drag.rect.top + drag.rect.height;

        if (handle.includes("w")) {
          left = Math.min(
            right - MIN_SCREENSHOT_SELECTION,
            Math.max(0, drag.rect.left + dx),
          );
        }

        if (handle.includes("e")) {
          right = Math.max(
            left + MIN_SCREENSHOT_SELECTION,
            Math.min(viewportWidth, drag.rect.left + drag.rect.width + dx),
          );
        }

        if (handle.includes("n")) {
          top = Math.min(
            bottom - MIN_SCREENSHOT_SELECTION,
            Math.max(0, drag.rect.top + dy),
          );
        }

        if (handle.includes("s")) {
          bottom = Math.max(
            top + MIN_SCREENSHOT_SELECTION,
            Math.min(viewportHeight, drag.rect.top + drag.rect.height + dy),
          );
        }

        updateSelectionRect({
          left,
          top,
          width: right - left,
          height: bottom - top,
        });

        return;
      }

      if (!selectingOrigin) return;
      renderSelection(normalizeScreenshotRect(
        selectingOrigin,
        { x: event.clientX, y: event.clientY },
        { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
      ));
    };

    const onPointerUp = (event: PointerEvent) => {
      if (selectionDrag) {
        selectionDrag = null;

        if (overlay.hasPointerCapture?.(event.pointerId)) overlay.releasePointerCapture(event.pointerId);

        if (selectionRect) renderSelection(selectionRect);

        return;
      }

      const origin = selectingOrigin;
      selectingOrigin = null;

      if (currentSnapshot.status !== "selecting" || !origin) return;

      if (overlay.hasPointerCapture?.(event.pointerId)) overlay.releasePointerCapture(event.pointerId);

      const rect = normalizeScreenshotRect(
        origin,
        { x: event.clientX, y: event.clientY },
        { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
      );

      if (rect.width < MIN_SCREENSHOT_SELECTION || rect.height < MIN_SCREENSHOT_SELECTION) {
        selectionRect = null;
        selectionAdjusting = false;
        updateSnapshot({ rect: null });
        renderSelection(null);

        return;
      }

      selectionRect = clampSelectionRect(rect);
      selectionAdjusting = true;
      overlay.style.cursor = "default";
      updateSnapshot({ rect: selectionRect });
      renderSelection(selectionRect);
    };

    const onPointerCancel = (event: PointerEvent) => {
      selectingOrigin = null;
      selectionDrag = null;

      if (overlay.hasPointerCapture?.(event.pointerId)) overlay.releasePointerCapture(event.pointerId);

      if (selectionRect && selectionAdjusting) renderSelection(selectionRect);
      else renderSelection(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Enter"
        && currentSnapshot.status === "selecting"
        && selectionAdjusting
        && selectionRect
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void beginRecording(selectionRect).catch(() => undefined);

        return;
      }

      if (event.key !== "Escape") return;

      if (currentSnapshot.status === "selecting") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void cancel();

        return;
      }

      if (currentSnapshot.status === "recording") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void finishRecording().catch(() => undefined);
      }
    };

    overlay.addEventListener("pointerdown", onPointerDown);
    overlay.addEventListener("pointermove", onPointerMove);
    overlay.addEventListener("pointerup", onPointerUp);
    overlay.addEventListener("pointercancel", onPointerCancel);
    ownerWindow.addEventListener("keydown", onKeyDown, true);

    outline.addEventListener("pointerdown", (event) => {
      const target = event.target;

      if (
        target instanceof ownerWindow.Element
        && target.closest("[data-mesurer-recording-resize]")
      ) {
        return;
      }

      beginSelectionDrag(event, "move");
    });

    for (const handle of resizeHandles) {
      handle.addEventListener("pointerdown", (event) => {
        beginSelectionDrag(event, "resize", handle.dataset.mesurerRecordingResize);
      });
    }

    selectionPanel.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    selectionPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const updateSelectionNumber = (
      input: HTMLInputElement,
      property: "left" | "top" | "width" | "height",
    ) => {
      const rect = selectionRect;
      const value = Number(input.value);

      if (!rect || !Number.isFinite(value)) return;
      updateSelectionRect({ ...rect, [property]: value });
    };

    widthInput.addEventListener("change", () => updateSelectionNumber(widthInput, "width"));
    heightInput.addEventListener("change", () => updateSelectionNumber(heightInput, "height"));
    leftInput.addEventListener("change", () => updateSelectionNumber(leftInput, "left"));
    topInput.addEventListener("change", () => updateSelectionNumber(topInput, "top"));

    startRecordingButton.addEventListener("click", () => {
      if (
        currentSnapshot.status === "selecting"
        && selectionAdjusting
        && selectionRect
      ) {
        void beginRecording(selectionRect).catch(() => undefined);
      }
    });

    recordingStop.addEventListener("click", () => {
      if (currentSnapshot.status === "recording") {
        void finishRecording().catch(() => undefined);
      }
    });

    const service: MesurerRecordingService = {
      snapshot: () => snapshotValue(currentSnapshot),
      subscribe(listener) {
        subscribers.add(listener);

        return () => subscribers.delete(listener);
      },
      formats,
      start,
      stop: finishRecording,
      cancel,
      discard,
      export: exportClip,
    };

    ctx.tool.register({
      id: "recording",
      label: "Record",
      shortcut: "Shift+R",
      order: 72,
      command: TOGGLE_COMMAND,
      toolbarMode: "select",
      icon: recordingIcon,
      active,
      hidden: () => !readSettings().toolEnabled,
      menu: {
        label: "Recording options",
        items: [
          {
            id: "new",
            label: "New recording",
            disabled: () => currentSnapshot.status === "recording" || currentSnapshot.status === "exporting",
            run: () => start(),
          },
          {
            id: "stop",
            label: "Stop recording",
            disabled: () => currentSnapshot.status !== "recording",
            run: () => finishRecording().then(() => undefined),
          },
          {
            id: "discard",
            label: "Discard clip",
            disabled: () => asset === null,
            run: discard,
          },
        ],
      },
    });

    ctx.settings.register({
      id: "recording",
      label: "Recording",
      order: 42,
      controls: [
        {
          type: "toggle",
          id: "tool",
          label: "Recording tool",
          description: "Show selected-region video recording in the Select toolbar.",
          value: () => readSettings().toolEnabled,
          set: async (toolEnabled) => {
            setSettings({ toolEnabled });

            if (!toolEnabled && active()) await cancel();
          },
        },
      ],
    });

    ctx.command.register(TOGGLE_COMMAND, async () => {
      await start();

      return snapshotDescriptor(currentSnapshot);
    });
    ctx.command.register(STOP_COMMAND, async () => assetDescriptor(await finishRecording()));
    ctx.command.register(DISCARD_COMMAND, () => {
      discard();

      return snapshotDescriptor(currentSnapshot);
    });
    ctx.command.register(EXPORT_COMMAND, async (args) => {
      const result = await exportClip(parseExportCommandOptions(args));

      downloadRecording(result, ownerDocument, ownerWindow);

      return exportDescriptor(result);
    });
    ctx.service.provide(MESURER_RECORDING_SERVICE_ID, service);

    ctx.lifecycle.onDispose(() => {
      disposed = true;
      ++operation;
      subscribers.clear();
      overlay.removeEventListener("pointerdown", onPointerDown);
      overlay.removeEventListener("pointermove", onPointerMove);
      overlay.removeEventListener("pointerup", onPointerUp);
      overlay.removeEventListener("pointercancel", onPointerCancel);
      ownerWindow.removeEventListener("keydown", onKeyDown, true);

      if (errorTimer) ownerWindow.clearTimeout(errorTimer);
      preview.dispose();
      finishSelection();
      restoreToolbar();
      void releaseCapture(true);
      inspectorMount.dispose();
    });
  },
});
