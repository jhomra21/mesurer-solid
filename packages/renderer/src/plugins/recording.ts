import {
  defineMesurerPlugin,
  type MesurerPlugin,
  type PluginValue,
} from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import {
  MIN_SCREENSHOT_SELECTION,
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
import {
  createRecordingSelectionController,
  type RecordingSelectionController,
} from "./recording-selection";
import { createRecordingInteractionController } from "./recording-interaction";

export const MESURER_RECORDING_PLUGIN_ID = "mesurer.recording";

export const MESURER_RECORDING_SERVICE_ID = "recording:v1";

export const MESURER_RECORDING_SETTINGS_STATE_ID = "mesurer.recording.settings";

const RUNTIME_SERVICE_ID = "runtime:solid";

const TOGGLE_COMMAND = "recording.toggle";

const STOP_COMMAND = "recording.stop";

const DISCARD_COMMAND = "recording.discard";

const EXPORT_COMMAND = "recording.export";

const DEFAULT_FRAME_RATE = 60;

const DEFAULT_MAX_DURATION_SECONDS = 60;

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

export type MesurerRecordingFrameRate = 60 | 120;

export type MesurerRecordingSettings = {
  toolEnabled: boolean;
  frameRate: MesurerRecordingFrameRate;
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
  frameRate?: MesurerRecordingFrameRate;
  maxDurationSeconds?: number;
  quality?: RecordingQuality;
};

export type MesurerRecordingService = {
  snapshot(): MesurerRecordingSnapshot;
  subscribe(listener: (snapshot: MesurerRecordingSnapshot) => void): () => void;
  settings(): MesurerRecordingSettings;
  setSettings(patch: Partial<MesurerRecordingSettings>): void;
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
  frameRate: MesurerRecordingFrameRate;
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
    const statusMount = runtime.createInspectorMount();
    const statusRoot = statusMount.element;

    const rendererRoot = runtime.rendererRoot
      ?? runtime.portalTarget.querySelector<HTMLDivElement>("[data-mesurer-root='true']");

    const recordingInteraction = createRecordingInteractionController(rendererRoot);

    root.dataset.mesurerRecording = "true";
    statusRoot.dataset.mesurerRecordingStatusRoot = "true";

    setStyle(root, {
      position: "fixed",
      inset: "0",
      "z-index": "86",
      "pointer-events": "none",
      "font-family": "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    });

    setStyle(statusRoot, {
      position: "fixed",
      inset: "0",
      "z-index": "96",
      "pointer-events": "none",
      "font-family": "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    });

    const maxDurationSeconds = Math.max(
      1,
      Math.min(600, options.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS),
    );

    const recordingQuality = options.quality ?? "medium";

    ctx.state.register<RecordingSettingsValue>({
      id: MESURER_RECORDING_SETTINGS_STATE_ID,
      initial: {
        toolEnabled: options.toolEnabled ?? true,
        frameRate: options.frameRate ?? DEFAULT_FRAME_RATE,
      },
      persist: true,
    });

    const readSettings = (): MesurerRecordingSettings => {
      const stored = ctx.state.get<RecordingSettingsValue>(MESURER_RECORDING_SETTINGS_STATE_ID);

      return {
        toolEnabled: stored?.toolEnabled ?? true,
        frameRate: stored?.frameRate === 120 ? 120 : 60,
      };
    };

    const setSettings = (patch: Partial<MesurerRecordingSettings>) => {
      ctx.state.update<RecordingSettingsValue>(MESURER_RECORDING_SETTINGS_STATE_ID, (current) => {
        const next = { ...current };

        if (patch.toolEnabled !== undefined) next.toolEnabled = patch.toolEnabled;

        if (patch.frameRate === 60 || patch.frameRate === 120) {
          next.frameRate = patch.frameRate;
        }

        return next;
      });
    };



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
    let selectionController: RecordingSelectionController;

    let toolbarVisibility: ToolbarVisibility | null = null;
    let frameHandle = 0;
    let maxDurationTimer = 0;
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
      selectionController.hideRecordingMask();
      selectionController.hideRecordingStatus();
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

      return supportedRecordingFormats(width, height, readSettings().frameRate);
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
        selectionController.hideRecordingMask();
        selectionController.hideRecordingStatus();
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
          selectionController.flashError(cause);
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
      frameRate: MesurerRecordingFrameRate,
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
        selectionController.setRecordingTime(`${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`);

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
                  selectionController.flashError(cause);
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
      const frameRate = readSettings().frameRate;
      preview.dismiss();
      asset = null;
      selectionController.showRecordingMask(rect);
      root.style.pointerEvents = "none";
      recordingInteraction.setActive(true);
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
      selectionController.setRecordingTime("00:00");
      selectionController.placeRecordingStatus(rect);

      try {
        const nextCapture = await openRecordingCapture(ownerDocument, ownerWindow, rect, frameRate);

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
        recordingInteraction.setActive(true);
        selectionController.showRecordingMask(rect);
        selectionController.setRecordingTime("00:00");
        selectionController.placeRecordingStatus(rect);
        startFramePump(nextCapture, nextRecorder, operationId, frameRate);
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

        if (!aborted) selectionController.flashError(cause);

        throw cause;
      }
    };

    const startSelection = () => {
      if (currentSnapshot.status === "selecting") return;
      ++operation;
      preview.dismiss();
      asset = null;
      hideToolbar();
      selectionController.startSelection();
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
      selectionController.finishSelection();
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


    selectionController = createRecordingSelectionController({
      ownerDocument,
      ownerWindow,
      root,
      statusRoot,
      rendererRoot,
      isSelecting: () => currentSnapshot.status === "selecting",
      isRecording: () => currentSnapshot.status === "recording",
      onRectChange: (rect) => updateSnapshot({ rect }),
      onConfirm: beginRecording,
      onCancel: cancel,
      onStop: async () => {
        await finishRecording();
      },
      setRecordingInteractionActive,
    });

    const service: MesurerRecordingService = {
      snapshot: () => snapshotValue(currentSnapshot),
      subscribe(listener) {
        subscribers.add(listener);

        return () => subscribers.delete(listener);
      },
      settings: readSettings,
      setSettings,
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
      compactPinned: true,
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
        {
          type: "toggle",
          id: "120-fps",
          label: "120 fps",
          description: "Record at 120 fps when the capture source supports it. Off records at 60 fps.",
          value: () => readSettings().frameRate === 120,
          disabled: active,
          set: (enabled) => {
            setSettings({ frameRate: enabled ? 120 : 60 });
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
      preview.dispose();
      selectionController.dispose();
      restoreToolbar();
      void releaseCapture(true);
      statusMount.dispose();
      inspectorMount.dispose();
    });
  },
});
