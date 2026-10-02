import type {
  RecordingExportFormat,
  RecordingExportOptions,
  RecordingScale,
} from "../core/recording";

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

const PANEL_WIDTH = 352;

const PANEL_EXPANDED_WIDTH = 576;

const VIEWPORT_PADDING = 8;

const TOOLBAR_GAP = 8;

const MIN_TRIM_SECONDS = 0.05;

const setStyle = (
  element: HTMLElement,
  styles: Record<string, string>,
) => {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value);
  }
};

const timestamp = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;

  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
};

const makeIconButton = (
  ownerDocument: Document,
  label: string,
  glyph: string,
) => {
  const button = ownerDocument.createElement("button");

  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.textContent = glyph;

  setStyle(button, {
    display: "inline-flex",
    width: "20px",
    height: "20px",
    padding: "0",
    border: "0",
    "border-radius": "5px",
    background: "transparent",
    color: "var(--msr-content, #18181b)",
    "align-items": "center",
    "justify-content": "center",
    "font-family": "inherit",
    "font-size": "11px",
    "line-height": "1",
    cursor: "pointer",
  });

  return button;
};

const makeMenuRow = (
  ownerDocument: Document,
  label: string,
) => {
  const button = ownerDocument.createElement("button");

  button.type = "button";
  button.setAttribute("role", "menuitemradio");

  setStyle(button, {
    display: "grid",
    width: "100%",
    height: "28px",
    padding: "0 8px",
    border: "0",
    "border-radius": "6px",
    background: "transparent",
    color: "var(--msr-content, #18181b)",
    "grid-template-columns": "14px minmax(0, 1fr)",
    gap: "6px",
    "align-items": "center",
    "text-align": "left",
    "font-family": "inherit",
    "font-size": "11px",
    cursor: "pointer",
  });

  const check = ownerDocument.createElement("span");

  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";
  check.style.opacity = "0";

  const text = ownerDocument.createElement("span");

  text.textContent = label;
  button.append(check, text);

  return { button, check, text };
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
  const panel = ownerDocument.createElement("section");

  panel.dataset.mesurerRecordingPreview = "true";
  panel.dataset.mesurerInspectorUi = "true";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Screen recording editor");
  panel.tabIndex = 0;

  setStyle(panel, {
    position: "fixed",
    display: "none",
    width: `${PANEL_WIDTH}px`,
    "max-width": "calc(100vw - 16px)",
    padding: "8px",
    "z-index": "98",
    "box-sizing": "border-box",
    overflow: "visible",
    "border-radius": "13px",
    background: "var(--msr-surface-raised, #fff)",
    color: "var(--msr-content, #18181b)",
    "box-shadow": "var(--msr-shadow-floating, 0 10px 30px rgba(0, 0, 0, 0.12))",
    "font-family": "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    "font-size": "11px",
    "pointer-events": "auto",
    outline: "none",
    transition: "width 200ms ease",
  });

  root.append(panel);

  const previewShell = ownerDocument.createElement("div");

  setStyle(previewShell, {
    position: "relative",
    display: "flex",
    width: "100%",
    "min-height": "72px",
    "max-height": "144px",
    overflow: "hidden",
    "border-radius": "8px",
    background: "var(--msr-surface-muted, #f8fafc)",
    "align-items": "center",
    "justify-content": "center",
    transition: "max-height 200ms ease",
    cursor: "default",
  });

  panel.append(previewShell);

  const video = ownerDocument.createElement("video");

  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  setStyle(video, {
    display: "block",
    width: "100%",
    height: "100%",
    "max-width": "100%",
    "max-height": "144px",
    "object-fit": "contain",
    transition: "max-height 200ms ease",
  });

  previewShell.append(video);

  const exportingOverlay = ownerDocument.createElement("div");

  exportingOverlay.dataset.mesurerRecordingExporting = "true";
  exportingOverlay.textContent = "Exporting…";

  setStyle(exportingOverlay, {
    position: "absolute",
    inset: "0",
    display: "none",
    "align-items": "center",
    "justify-content": "center",
    "z-index": "30",
    background: "rgb(15 23 42 / 45%)",
    color: "#fff",
    "font-size": "11px",
    "pointer-events": "none",
  });

  previewShell.append(exportingOverlay);

  const close = makeIconButton(ownerDocument, "Close", "×");

  close.dataset.mesurerRecordingDiscard = "true";

  setStyle(close, {
    position: "absolute",
    top: "6px",
    right: "6px",
    width: "24px",
    height: "24px",
    "z-index": "40",
    background: "rgb(15 23 42 / 78%)",
    color: "#fff",
    opacity: "0",
    "pointer-events": "none",
    transition: "opacity 150ms ease",
  });

  previewShell.append(close);

  previewShell.addEventListener("mouseenter", () => {
    close.style.opacity = "1";
    close.style.pointerEvents = "auto";
  });

  previewShell.addEventListener("mouseleave", () => {
    if (ownerDocument.activeElement === close) return;
    close.style.opacity = "0";
    close.style.pointerEvents = "none";
  });

  close.addEventListener("focus", () => {
    close.style.opacity = "1";
    close.style.pointerEvents = "auto";
  });

  close.addEventListener("blur", () => {
    close.style.opacity = "0";
    close.style.pointerEvents = "none";
  });

  const controls = ownerDocument.createElement("div");

  setStyle(controls, {
    display: "flex",
    height: "20px",
    "align-items": "center",
    gap: "6px",
    "margin-top": "8px",
  });

  panel.append(controls);

  const play = makeIconButton(ownerDocument, "Play", "▶");

  play.dataset.mesurerRecordingPlay = "true";
  controls.append(play);

  const currentTime = ownerDocument.createElement("span");

  currentTime.textContent = "0:00.00";

  setStyle(currentTime, {
    display: "flex",
    width: "32px",
    height: "20px",
    "align-items": "center",
    "flex-shrink": "0",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
    "font-size": "10px",
    "font-variant-numeric": "tabular-nums",
  });

  controls.append(currentTime);

  const timeline = ownerDocument.createElement("div");

  timeline.dataset.mesurerRecordingTimeline = "true";

  setStyle(timeline, {
    position: "relative",
    height: "20px",
    "min-width": "0",
    flex: "1 1 0",
    cursor: "pointer",
    "user-select": "none",
  });

  controls.append(timeline);

  const rail = ownerDocument.createElement("div");

  rail.dataset.mesurerRecordingTimelineRail = "true";

  setStyle(rail, {
    position: "absolute",
    left: "0",
    right: "0",
    top: "50%",
    height: "3px",
    transform: "translateY(-50%)",
    "border-radius": "999px",
    background: "var(--msr-color-ink-200, #e2e8f0)",
    "pointer-events": "none",
  });

  timeline.append(rail);

  const clip = ownerDocument.createElement("div");

  clip.dataset.mesurerRecordingTimelineClip = "true";

  setStyle(clip, {
    position: "absolute",
    top: "50%",
    height: "3px",
    transform: "translateY(-50%)",
    "border-radius": "999px",
    background: "var(--msr-color-ink-300, #cbd5e1)",
    "pointer-events": "none",
  });

  timeline.append(clip);

  const hoverMarker = ownerDocument.createElement("div");

  setStyle(hoverMarker, {
    position: "absolute",
    display: "none",
    top: "50%",
    width: "2px",
    height: "10px",
    transform: "translate(-50%, -50%)",
    "border-radius": "999px",
    background: "var(--msr-color-ink-500, #64748b)",
    opacity: "0.5",
    "pointer-events": "none",
  });

  timeline.append(hoverMarker);

  const playhead = ownerDocument.createElement("div");

  playhead.dataset.mesurerRecordingPlayhead = "true";

  setStyle(playhead, {
    position: "absolute",
    top: "50%",
    left: "0",
    width: "2px",
    height: "8px",
    transform: "translate(-50%, -50%)",
    "border-radius": "999px",
    background: "var(--msr-content, #18181b)",
    "z-index": "25",
    "pointer-events": "none",
    transition: "height 150ms ease",
  });

  timeline.append(playhead);

  const makeTrimHandle = (
    kind: "start" | "end",
    label: string,
  ) => {
    const handle = ownerDocument.createElement("button");

    handle.type = "button";
    handle.dataset.mesurerRecordingTrimHandle = kind;
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", label);
    handle.setAttribute("aria-valuemin", "0");

    setStyle(handle, {
      position: "absolute",
      top: "50%",
      width: "8px",
      height: "14px",
      padding: "0",
      border: "1px solid var(--msr-surface-raised, #fff)",
      "border-radius": "3px",
      background: "var(--msr-content, #18181b)",
      transform: "translate(-50%, -50%)",
      "z-index": "20",
      cursor: "ew-resize",
    });

    timeline.append(handle);

    return handle;
  };

  const trimStart = makeTrimHandle("start", "Trim start");
  const trimEnd = makeTrimHandle("end", "Trim end");

  const durationLabel = ownerDocument.createElement("span");

  setStyle(durationLabel, {
    display: "flex",
    width: "32px",
    height: "20px",
    "align-items": "center",
    "justify-content": "flex-end",
    "flex-shrink": "0",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
    "font-size": "10px",
    "font-variant-numeric": "tabular-nums",
  });

  controls.append(durationLabel);

  const exportAnchor = ownerDocument.createElement("div");

  setStyle(exportAnchor, {
    position: "relative",
    display: "flex",
    height: "20px",
    "align-items": "center",
  });

  controls.append(exportAnchor);

  const exportOptions = makeIconButton(ownerDocument, "Export options", "1×");

  exportOptions.dataset.mesurerRecordingExportOptions = "true";
  exportOptions.setAttribute("aria-haspopup", "menu");
  exportOptions.setAttribute("aria-expanded", "false");

  setStyle(exportOptions, {
    width: "28px",
    "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
    "font-size": "10px",
  });

  exportAnchor.append(exportOptions);

  const exportMenu = ownerDocument.createElement("div");

  exportMenu.dataset.mesurerRecordingExportMenu = "true";
  exportMenu.setAttribute("role", "menu");

  setStyle(exportMenu, {
    position: "absolute",
    display: "none",
    right: "0",
    bottom: "24px",
    width: "176px",
    padding: "4px",
    "z-index": "120",
    border: "1px solid var(--msr-color-ink-200, #e2e8f0)",
    "border-radius": "9px",
    background: "var(--msr-surface-raised, #fff)",
    color: "var(--msr-content, #18181b)",
    "box-shadow": "var(--msr-shadow-floating, 0 10px 30px rgba(0, 0, 0, 0.12))",
    "pointer-events": "auto",
  });

  exportAnchor.append(exportMenu);

  const formatHeading = ownerDocument.createElement("p");

  formatHeading.textContent = "Format";

  setStyle(formatHeading, {
    margin: "0",
    padding: "4px 8px",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-size": "10px",
    "font-weight": "500",
  });

  exportMenu.append(formatHeading);

  const formatRows = ownerDocument.createElement("div");

  exportMenu.append(formatRows);

  const sizeHeading = ownerDocument.createElement("p");

  sizeHeading.textContent = "Size";

  setStyle(sizeHeading, {
    margin: "0",
    padding: "6px 8px 4px",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-size": "10px",
    "font-weight": "500",
  });

  exportMenu.append(sizeHeading);

  const sizeRows = ownerDocument.createElement("div");

  exportMenu.append(sizeRows);

  const scaleRows = ([1, 2, 3] as const).map((scale) => {
    const row = makeMenuRow(ownerDocument, `${scale}×`);

    row.button.dataset.mesurerRecordingScale = String(scale);
    sizeRows.append(row.button);

    return { scale, ...row };
  });

  const download = makeIconButton(ownerDocument, "Download", "↓");

  download.dataset.mesurerRecordingExport = "true";
  controls.append(download);

  const expand = makeIconButton(ownerDocument, "Grow preview", "↗");

  expand.dataset.mesurerRecordingExpand = "true";
  controls.append(expand);

  const status = ownerDocument.createElement("p");

  status.dataset.mesurerRecordingPreviewStatus = "true";
  status.setAttribute("role", "status");

  setStyle(status, {
    display: "none",
    margin: "8px 0 0",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-size": "11px",
    "line-height": "16px",
  });

  panel.append(status);

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
    const bounds = timeline.getBoundingClientRect();

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
      const row = makeMenuRow(
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

  const setExportMenuOpen = (open: boolean) => {
    exportMenu.style.display = open ? "block" : "none";
    exportOptions.setAttribute("aria-expanded", open ? "true" : "false");
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

  const place = () => {
    if (panel.style.display === "none") return;

    const width = Math.min(
      expanded ? PANEL_EXPANDED_WIDTH : PANEL_WIDTH,
      Math.max(1, ownerWindow.innerWidth - VIEWPORT_PADDING * 2),
    );

    const panelHeight = Math.max(180, panel.offsetHeight);

    const anchor = root
      .closest<HTMLElement>("[data-mesurer-root='true']")
      ?.querySelector<HTMLElement>("[data-mesurer-tool-id='recording']")
      ?? ownerDocument.querySelector<HTMLElement>("[data-mesurer-tool-id='recording']");

    const anchorRect = anchor?.getBoundingClientRect();

    let left = anchorRect
      ? anchorRect.left + anchorRect.width / 2 - width / 2
      : ownerWindow.innerWidth - width - VIEWPORT_PADDING;

    let top = anchorRect
      ? anchorRect.bottom + TOOLBAR_GAP
      : VIEWPORT_PADDING;

    left = Math.min(
      Math.max(VIEWPORT_PADDING, left),
      Math.max(VIEWPORT_PADDING, ownerWindow.innerWidth - width - VIEWPORT_PADDING),
    );

    if (top + panelHeight > ownerWindow.innerHeight - VIEWPORT_PADDING) {
      top = anchorRect
        ? anchorRect.top - panelHeight - TOOLBAR_GAP
        : ownerWindow.innerHeight - panelHeight - VIEWPORT_PADDING;
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(VIEWPORT_PADDING, top)}px`;
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
    clearUrl();
    asset = null;
    dragKind = null;
    dragPointerId = null;
    setExportMenuOpen(false);
    panel.style.display = "none";
    status.style.display = "none";
    setBusy(false);
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
    dismiss();
    onDiscard();
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

  ownerDocument.addEventListener("pointerdown", (event) => {
    if (exportMenu.style.display === "none") return;
    const path = event.composedPath();

    if (path.includes(exportAnchor)) return;

    setExportMenuOpen(false);
  }, true);

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
      dismiss();
      onDiscard();

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
          status.textContent = "No MediaBunny video encoder is available in this runtime.";
        }
      }).catch((cause: unknown) => {
        if (operation !== revision) return;

        supportedFormats = [];
        updateFormatRows();
        download.disabled = true;
        status.style.display = "block";
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
      panel.remove();
    },
  };
};
