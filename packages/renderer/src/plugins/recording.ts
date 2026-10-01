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

    const recordingStatus = ownerDocument.createElement("button");
    recordingStatus.type = "button";
    recordingStatus.dataset.mesurerRecordingStatus = "true";
    recordingStatus.dataset.mesurerInspectorUi = "true";
    recordingStatus.setAttribute("aria-label", "Stop recording");
    setStyle(recordingStatus, {
      position: "fixed",
      display: "none",
      height: "30px",
      padding: "0 10px",
      border: "0",
      "border-radius": "999px",
      background: "var(--msr-surface-raised, #fff)",
      color: "var(--msr-content, #18181b)",
      "box-shadow": "var(--msr-shadow-floating, 0 8px 24px rgba(0,0,0,.14))",
      "font-family": "inherit",
      "font-size": "11px",
      "font-variant-numeric": "tabular-nums",
      cursor: "pointer",
      "pointer-events": "auto",
    });
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

    const renderSelection = (rect: ScreenshotRect | null) => {
      const viewportWidth = ownerWindow.innerWidth;
      const viewportHeight = ownerWindow.innerHeight;

      if (!rect || rect.width <= 0 || rect.height <= 0) {
        setRectStyle(shade[0], { left: 0, top: 0, width: viewportWidth, height: viewportHeight });

        for (const element of shade.slice(1)) {
          setRectStyle(element, { left: 0, top: 0, width: 0, height: 0 });
        }

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

    const finishSelection = () => {
      selectingOrigin = null;
      renderSelection(null);
      overlay.style.display = "none";
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
      recordingStatus.style.display = "block";
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
        recordingStatus.textContent = `● ${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}  Stop`;

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
      hideToolbar();
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
        root.style.pointerEvents = "auto";
        recordingStatus.textContent = "● 0:00  Stop";
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

    const onPointerDown = (event: PointerEvent) => {
      if (currentSnapshot.status !== "selecting" || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      selectingOrigin = { x: event.clientX, y: event.clientY };
      renderSelection(normalizeScreenshotRect(
        selectingOrigin,
        selectingOrigin,
        { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
      ));
      overlay.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (currentSnapshot.status !== "selecting" || !selectingOrigin) return;
      renderSelection(normalizeScreenshotRect(
        selectingOrigin,
        { x: event.clientX, y: event.clientY },
        { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
      ));
    };

    const onPointerUp = (event: PointerEvent) => {
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
        renderSelection(null);

        return;
      }

      void beginRecording(rect).catch(() => undefined);
    };

    const onPointerCancel = (event: PointerEvent) => {
      selectingOrigin = null;

      if (overlay.hasPointerCapture?.(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
      renderSelection(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
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
    recordingStatus.addEventListener("click", () => {
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
