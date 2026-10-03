import type {
  RecordingExportFormat,
  RecordingExportOptions,
  RecordingScale,
} from "../core/recording";
import {
  RECORDING_PREVIEW_PANEL_EXPANDED_WIDTH as PANEL_EXPANDED_WIDTH,
  RECORDING_PREVIEW_PANEL_WIDTH as PANEL_WIDTH,
  createRecordingPreviewUi,
  makeRecordingMenuRow,
} from "./recording-preview-ui";

export type RecordingPreviewAsset = {
  blob: Blob;
  duration: number;
  width: number;
  height: number;
};

export type RecordingPreviewExportResult = RecordingPreviewAsset & {
  filename: string;
  format: RecordingExportFormat;
};

export type RecordingPreviewController = {
  show(asset: RecordingPreviewAsset): void;
  dismiss(): void;
  dispose(): void;
};

type RecordingPreviewControllerOptions = {
  ownerDocument: Document;
  ownerWindow: Window;
  root: HTMLElement;
  formats(asset: RecordingPreviewAsset): Promise<RecordingExportFormat[]>;
  onDiscard(): void;
  onExport(
    options: RecordingExportOptions,
  ): Promise<RecordingPreviewExportResult>;
};

type DragKind = "start" | "end" | "playhead";

const VIEWPORT_PADDING = 8;

const TOOLBAR_GAP = 8;

const MIN_TRIM_SECONDS = 0.05;

const PREVIEW_MOTION_MS = 200;


const timestamp = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;

  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
};


const downloadBlob = (
  blob: Blob,
  filename: string,
  ownerDocument: Document,
  ownerWindow: Window,
) => {
  const url = globalThis.URL.createObjectURL(blob);
  const link = ownerDocument.createElement("a");

  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  ownerDocument.documentElement.append(link);
  link.click();
  link.remove();
  ownerWindow.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
};

export const createRecordingPreviewController = ({
  ownerDocument,
  ownerWindow,
  root,
  formats,
  onDiscard,
  onExport,
}: RecordingPreviewControllerOptions): RecordingPreviewController => {
  const {
    panel,
    previewShell,
    video,
    exportingOverlay,
    close,
    play,
    currentTime,
    timeline,
    track,
    clip,
    hoverMarker,
    playhead,
    trimStart,
    trimEnd,
    durationLabel,
    exportAnchor,
    exportOptions,
    exportMenu,
    formatRows,
    scaleRows,
    download,
    expand,
    status,
  } = createRecordingPreviewUi({ ownerDocument, root });


  let asset: RecordingPreviewAsset | null = null;
  let objectUrl: string | null = null;
  let expanded = false;
  let exporting = false;
  let revision = 0;
  let supportedFormats: RecordingExportFormat[] = ["webm"];
  let selectedFormat: RecordingExportFormat = "webm";
  let selectedScale: RecordingScale = 1;
  let trimStartValue = 0;
  let trimEndValue = 0;
  let dragKind: DragKind | null = null;
  let dragPointerId: number | null = null;
  let dismissAnimation: Animation | null = null;

  const ratio = (value: number) => {
    const duration = asset?.duration ?? 0;

    return duration <= 0
      ? 0
      : Math.min(1, Math.max(0, value / duration));
  };

  const trimRange = () => ({
    start: trimStartValue,
    end: trimEndValue,
  });

  const timeAtClientX = (clientX: number) => {
    const duration = asset?.duration ?? 0;
    const bounds = track.getBoundingClientRect();

    if (duration <= 0 || bounds.width <= 0) return 0;

    return Math.min(
      duration,
      Math.max(0, ((clientX - bounds.left) / bounds.width) * duration),
    );
  };

  const syncTimeline = () => {
    const duration = asset?.duration ?? 0;
    const current = Math.min(duration, Math.max(0, video.currentTime || 0));
    const startPercent = ratio(trimStartValue) * 100;
    const endPercent = ratio(trimEndValue) * 100;

    trimStart.style.left = `${startPercent}%`;
    trimEnd.style.left = `${endPercent}%`;
    clip.style.left = `${startPercent}%`;
    clip.style.width = `${Math.max(0, endPercent - startPercent)}%`;
    playhead.style.left = `${ratio(current) * 100}%`;

    trimStart.setAttribute("aria-valuemax", String(Math.max(0, trimEndValue - MIN_TRIM_SECONDS)));
    trimStart.setAttribute("aria-valuenow", String(trimStartValue));
    trimStart.setAttribute("aria-valuetext", timestamp(trimStartValue));
    trimEnd.setAttribute("aria-valuemin", String(Math.min(duration, trimStartValue + MIN_TRIM_SECONDS)));
    trimEnd.setAttribute("aria-valuemax", String(duration));
    trimEnd.setAttribute("aria-valuenow", String(trimEndValue));
    trimEnd.setAttribute("aria-valuetext", timestamp(trimEndValue));

    currentTime.textContent = timestamp(current);
    durationLabel.textContent = timestamp(duration);
  };

  const seekTo = (time: number, pause = true) => {
    if (!asset) return;
    const next = Math.min(trimEndValue, Math.max(trimStartValue, time));

    if (pause && !video.paused) video.pause();

    video.currentTime = next;
    syncTimeline();
  };

  const updateTrimStart = (
    value: number,
    previewEdge = false,
  ) => {
    if (!asset) return;

    trimStartValue = Math.min(
      Math.max(0, value),
      Math.max(0, trimEndValue - MIN_TRIM_SECONDS),
    );

    if (previewEdge) seekTo(trimStartValue);
    else if (video.currentTime < trimStartValue) seekTo(trimStartValue);

    syncTimeline();
  };

  const updateTrimEnd = (
    value: number,
    previewEdge = false,
  ) => {
    if (!asset) return;

    trimEndValue = Math.max(
      Math.min(asset.duration, value),
      Math.min(asset.duration, trimStartValue + MIN_TRIM_SECONDS),
    );

    if (previewEdge) seekTo(trimEndValue);
    else if (video.currentTime > trimEndValue) seekTo(trimStartValue);

    syncTimeline();
  };

  const updateScaleRows = () => {
    exportOptions.textContent = `${selectedScale}×`;

    for (const row of scaleRows) {
      const selected = row.scale === selectedScale;

      row.button.setAttribute("aria-checked", selected ? "true" : "false");
      row.check.style.opacity = selected ? "1" : "0";
      row.text.textContent = asset
        ? `${row.scale}×  ${Math.round(asset.width * row.scale)} × ${Math.round(asset.height * row.scale)}`
        : `${row.scale}×`;
    }
  };

  const updateFormatRows = () => {
    formatRows.replaceChildren();

    for (const format of supportedFormats) {
      const row = makeRecordingMenuRow(
        ownerDocument,
        format === "mp4" ? "MP4" : "WebM",
      );

      const selected = format === selectedFormat;

      row.button.dataset.mesurerRecordingFormat = format;
      row.button.setAttribute("aria-checked", selected ? "true" : "false");
      row.check.style.opacity = selected ? "1" : "0";

      row.button.addEventListener("click", () => {
        selectedFormat = format;
        updateFormatRows();
      });

      formatRows.append(row.button);
    }
  };

  const placeExportMenu = () => {
    if (exportMenu.style.display === "none") return;

    const anchorRect = exportAnchor.getBoundingClientRect();
    const menuHeight = Math.max(1, exportMenu.offsetHeight);
    const spaceAbove = anchorRect.top - VIEWPORT_PADDING;
    const spaceBelow = ownerWindow.innerHeight - anchorRect.bottom - VIEWPORT_PADDING;
    const openAbove = spaceAbove >= menuHeight || spaceAbove >= spaceBelow;

    if (openAbove) {
      exportMenu.style.top = "auto";
      exportMenu.style.bottom = "24px";
    } else {
      exportMenu.style.top = "24px";
      exportMenu.style.bottom = "auto";
    }
  };

  const setExportMenuOpen = (open: boolean) => {
    exportMenu.style.display = open ? "block" : "none";
    exportOptions.setAttribute("aria-expanded", open ? "true" : "false");

    if (open) placeExportMenu();
  };

  const setBusy = (value: boolean) => {
    exporting = value;
    exportingOverlay.style.display = value ? "flex" : "none";

    for (const control of [
      play,
      close,
      trimStart,
      trimEnd,
      exportOptions,
      download,
      expand,
      ...scaleRows.map((row) => row.button),
    ]) {
      control.toggleAttribute("disabled", value);
    }
  };

  const recordingToolAnchor = () =>
    root
      .closest<HTMLElement>("[data-mesurer-root='true']")
      ?.querySelector<HTMLElement>("[data-mesurer-tool-id='recording']")
    ?? ownerDocument.querySelector<HTMLElement>("[data-mesurer-tool-id='recording']");

  const place = () => {
    if (panel.style.display === "none") return;

    const width = Math.min(
      expanded ? PANEL_EXPANDED_WIDTH : PANEL_WIDTH,
      Math.max(1, ownerWindow.innerWidth - VIEWPORT_PADDING * 2),
    );

    const panelHeight = Math.max(180, panel.offsetHeight);

    const anchor = recordingToolAnchor();
    const anchorRect = anchor?.getBoundingClientRect();

    const idealCenter = anchorRect
      ? anchorRect.left + anchorRect.width / 2
      : ownerWindow.innerWidth - VIEWPORT_PADDING - width / 2;

    const minCenter = VIEWPORT_PADDING + width / 2;

    const maxCenter = Math.max(
      minCenter,
      ownerWindow.innerWidth - VIEWPORT_PADDING - width / 2,
    );

    const center = Math.min(Math.max(minCenter, idealCenter), maxCenter);

    let top = anchorRect
      ? anchorRect.bottom + TOOLBAR_GAP
      : VIEWPORT_PADDING;

    if (top + panelHeight > ownerWindow.innerHeight - VIEWPORT_PADDING) {
      top = anchorRect
        ? anchorRect.top - panelHeight - TOOLBAR_GAP
        : ownerWindow.innerHeight - panelHeight - VIEWPORT_PADDING;
    }

    panel.style.left = `${center}px`;
    panel.style.top = `${Math.max(VIEWPORT_PADDING, top)}px`;

    if (exportMenu.style.display !== "none") placeExportMenu();
  };

  const clearUrl = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();

    if (!objectUrl) return;

    globalThis.URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };

  const dismiss = () => {
    revision += 1;

    if (dismissAnimation) {
      dismissAnimation.cancel();
      dismissAnimation = null;
    }

    clearUrl();
    asset = null;
    dragKind = null;
    dragPointerId = null;
    setExportMenuOpen(false);
    panel.style.display = "none";
    panel.style.pointerEvents = "auto";
    panel.style.opacity = "1";
    panel.style.transform = "translateX(-50%)";
    panel.style.removeProperty("transform-origin");
    panel.style.removeProperty("will-change");
    status.style.display = "none";
    setBusy(false);
  };

  const discardWithAnimation = () => {
    if (!asset || panel.style.display === "none" || dismissAnimation) return;

    const panelRect = panel.getBoundingClientRect();

    const anchorRect = recordingToolAnchor()?.getBoundingClientRect();

    const targetCenterX = anchorRect
      ? anchorRect.left + anchorRect.width / 2
      : panelRect.left + panelRect.width / 2;

    const targetCenterY = anchorRect
      ? anchorRect.top + anchorRect.height / 2
      : panelRect.top + panelRect.height / 2;

    video.pause();
    setExportMenuOpen(false);
    panel.style.pointerEvents = "none";
    panel.style.left = `${panelRect.left}px`;
    panel.style.top = `${panelRect.top}px`;
    panel.style.transform = "none";
    panel.style.transformOrigin = `${targetCenterX - panelRect.left}px ${targetCenterY - panelRect.top}px`;
    panel.style.willChange = "transform, opacity";

    const animation = panel.animate([
      {
        transform: "scale(1)",
        opacity: 1,
      },
      {
        transform: "scale(0.08)",
        opacity: 0,
      },
    ], {
      duration: PREVIEW_MOTION_MS,
      easing: "ease",
      fill: "forwards",
    });

    dismissAnimation = animation;

    void animation.finished.catch(() => undefined).then(() => {
      if (dismissAnimation !== animation) return;

      animation.cancel();
      dismissAnimation = null;
      panel.style.removeProperty("will-change");
      onDiscard();
    });
  };

  const togglePlayback = () => {
    if (!asset || exporting) return;

    if (!video.paused) {
      video.pause();

      return;
    }

    if (video.currentTime < trimStartValue || video.currentTime >= trimEndValue) {
      video.currentTime = trimStartValue;
    }

    void video.play();
  };

  const finishDrag = () => {
    dragKind = null;
    dragPointerId = null;
    playhead.style.height = "8px";
  };

  const applyDrag = (clientX: number) => {
    if (!dragKind) return;
    const time = timeAtClientX(clientX);

    if (dragKind === "start") {
      updateTrimStart(time, true);
    } else if (dragKind === "end") {
      updateTrimEnd(time, true);
    } else {
      seekTo(time);
    }
  };

  const beginDrag = (
    kind: DragKind,
    event: PointerEvent,
  ) => {
    if (!asset || exporting || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    dragKind = kind;
    dragPointerId = event.pointerId;
    playhead.style.height = "10px";
    applyDrag(event.clientX);
  };

  const onWindowPointerMove = (event: PointerEvent) => {
    if (dragPointerId === null || event.pointerId !== dragPointerId) return;

    applyDrag(event.clientX);
  };

  const onWindowPointerEnd = (event: PointerEvent) => {
    if (dragPointerId === null || event.pointerId !== dragPointerId) return;

    finishDrag();
  };

  trimStart.addEventListener("pointerdown", (event) => beginDrag("start", event));
  trimEnd.addEventListener("pointerdown", (event) => beginDrag("end", event));

  timeline.addEventListener("pointerdown", (event) => {
    const target = event.target;

    if (
      target instanceof Element
      && target.closest("[data-mesurer-recording-trim-handle]")
    ) {
      return;
    }

    beginDrag("playhead", event);
  });

  timeline.addEventListener("pointermove", (event) => {
    if (dragPointerId !== null) return;

    hoverMarker.style.display = "block";
    hoverMarker.style.left = `${ratio(timeAtClientX(event.clientX)) * 100}%`;
  });

  timeline.addEventListener("pointerleave", () => {
    hoverMarker.style.display = "none";
  });

  for (const [kind, handle] of [
    ["start", trimStart],
    ["end", trimEnd],
  ] as const) {
    handle.addEventListener("keydown", (event) => {
      if (!asset || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;

      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const next = (kind === "start" ? trimStartValue : trimEndValue) + direction * 0.05;

      if (kind === "start") updateTrimStart(next, true);
      else updateTrimEnd(next, true);
    });
  }

  ownerWindow.addEventListener("pointermove", onWindowPointerMove, true);
  ownerWindow.addEventListener("pointerup", onWindowPointerEnd, true);
  ownerWindow.addEventListener("pointercancel", onWindowPointerEnd, true);

  close.addEventListener("click", (event) => {
    event.stopPropagation();
    discardWithAnimation();
  });

  previewShell.addEventListener("click", (event) => {
    const target = event.target;

    if (target instanceof Element && target.closest("button")) return;

    togglePlayback();
  });

  play.addEventListener("click", togglePlayback);

  video.addEventListener("play", () => {
    play.textContent = "Ⅱ";
    play.setAttribute("aria-label", "Pause");
    play.title = "Pause";
  });

  video.addEventListener("pause", () => {
    play.textContent = "▶";
    play.setAttribute("aria-label", "Play");
    play.title = "Play";
  });

  video.addEventListener("timeupdate", () => {
    if (!asset) return;

    if (video.currentTime >= trimEndValue - 0.01) {
      video.pause();
      video.currentTime = trimStartValue;
    } else if (video.currentTime < trimStartValue) {
      video.currentTime = trimStartValue;
    }

    syncTimeline();
  });

  video.addEventListener("loadedmetadata", () => {
    syncTimeline();
  });

  exportOptions.addEventListener("click", () => {
    if (exporting) return;

    setExportMenuOpen(exportMenu.style.display === "none");
  });

  for (const row of scaleRows) {
    row.button.addEventListener("click", () => {
      selectedScale = row.scale;
      updateScaleRows();
    });
  }

  const onDocumentPointerDown = (event: PointerEvent) => {
    if (exportMenu.style.display === "none") return;
    const path = event.composedPath();

    if (path.includes(exportAnchor)) return;

    setExportMenuOpen(false);
  };

  ownerDocument.addEventListener("pointerdown", onDocumentPointerDown, true);

  expand.addEventListener("click", () => {
    expanded = !expanded;
    panel.style.width = `${expanded ? PANEL_EXPANDED_WIDTH : PANEL_WIDTH}px`;
    previewShell.style.maxHeight = expanded ? "448px" : "144px";
    video.style.maxHeight = expanded ? "448px" : "144px";
    expand.textContent = expanded ? "↙" : "↗";
    expand.setAttribute("aria-label", expanded ? "Shrink preview" : "Grow preview");
    expand.title = expanded ? "Shrink preview" : "Grow preview";
    ownerWindow.requestAnimationFrame(place);
  });

  const exportRecording = () => {
    if (!asset || exporting || supportedFormats.length === 0) return;

    const operation = ++revision;
    const { start, end } = trimRange();

    setBusy(true);
    setExportMenuOpen(false);
    status.style.display = "none";

    void onExport({
      format: selectedFormat,
      startTime: start,
      endTime: end,
      scale: selectedScale,
    }).then((result) => {
      if (operation !== revision) return;

      downloadBlob(result.blob, result.filename, ownerDocument, ownerWindow);
    }).catch((cause: unknown) => {
      if (operation !== revision) return;

      status.style.display = "block";
      status.style.color = "var(--msr-danger-text, #dc2626)";
      status.textContent = cause instanceof Error
        ? cause.message
        : "Could not export the recording.";
    }).finally(() => {
      if (operation === revision) setBusy(false);
    });
  };

  download.addEventListener("click", exportRecording);

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (exportMenu.style.display !== "none") {
        event.preventDefault();
        setExportMenuOpen(false);

        return;
      }

      event.preventDefault();
      discardWithAnimation();

      return;
    }

    if (
      (event.key === " " || event.code === "Space")
      && event.target === panel
    ) {
      event.preventDefault();
      togglePlayback();
    }
  });

  const onResize = () => place();

  ownerWindow.addEventListener("resize", onResize);

  return {
    show(nextAsset) {
      revision += 1;

      if (dismissAnimation) {
        dismissAnimation.cancel();
        dismissAnimation = null;
      }

      panel.style.pointerEvents = "auto";
      panel.style.opacity = "1";
      panel.style.transform = "translateX(-50%)";
      panel.style.removeProperty("transform-origin");
      panel.style.removeProperty("will-change");
      clearUrl();
      asset = nextAsset;
      expanded = false;
      selectedScale = 1;
      selectedFormat = "webm";
      supportedFormats = ["webm"];
      trimStartValue = 0;
      trimEndValue = nextAsset.duration;
      dragKind = null;
      dragPointerId = null;

      const nextUrl = globalThis.URL.createObjectURL(nextAsset.blob);

      objectUrl = nextUrl;
      video.src = nextUrl;
      video.currentTime = 0;
      previewShell.style.aspectRatio = nextAsset.width > 0 && nextAsset.height > 0
        ? `${nextAsset.width} / ${nextAsset.height}`
        : "16 / 9";
      panel.style.width = `${PANEL_WIDTH}px`;
      previewShell.style.maxHeight = "144px";
      video.style.maxHeight = "144px";
      expand.textContent = "↗";
      expand.setAttribute("aria-label", "Grow preview");
      expand.title = "Grow preview";
      currentTime.textContent = "0:00.00";
      durationLabel.textContent = timestamp(nextAsset.duration);
      status.style.display = "none";
      status.style.color = "var(--msr-color-ink-500, #64748b)";
      setExportMenuOpen(false);
      updateFormatRows();
      updateScaleRows();
      syncTimeline();
      setBusy(false);
      panel.style.display = "block";
      place();
      panel.focus({ preventScroll: true });

      const operation = revision;

      void formats(nextAsset).then((supported) => {
        if (operation !== revision || !asset) return;

        supportedFormats = supported;
        selectedFormat = supported.includes(selectedFormat)
          ? selectedFormat
          : supported[0] ?? "webm";
        updateFormatRows();
        download.disabled = supported.length === 0;

        if (supported.length === 0) {
          status.style.display = "block";
          status.style.color = "var(--msr-danger-text, #dc2626)";
          status.textContent = "No MediaBunny video encoder is available in this runtime.";
        }
      }).catch((cause: unknown) => {
        if (operation !== revision) return;

        supportedFormats = [];
        updateFormatRows();
        download.disabled = true;
        status.style.display = "block";
        status.style.color = "var(--msr-danger-text, #dc2626)";
        status.textContent = cause instanceof Error
          ? cause.message
          : "Could not inspect export support.";
      });

      ownerWindow.requestAnimationFrame(place);
    },
    dismiss,
    dispose() {
      dismiss();
      ownerWindow.removeEventListener("resize", onResize);
      ownerWindow.removeEventListener("pointermove", onWindowPointerMove, true);
      ownerWindow.removeEventListener("pointerup", onWindowPointerEnd, true);
      ownerWindow.removeEventListener("pointercancel", onWindowPointerEnd, true);
      ownerDocument.removeEventListener("pointerdown", onDocumentPointerDown, true);
      panel.remove();
    },
  };
};
