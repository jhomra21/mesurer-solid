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

const makeButton = (
  ownerDocument: Document,
  label: string,
) => {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.textContent = label;
  setStyle(button, {
    height: "28px",
    padding: "0 9px",
    border: "1px solid var(--msr-color-ink-200, #e2e8f0)",
    "border-radius": "7px",
    background: "var(--msr-surface-raised, #fff)",
    color: "var(--msr-content, #18181b)",
    "font-family": "inherit",
    "font-size": "11px",
    "font-weight": "500",
    cursor: "pointer",
  });

  return button;
};

const makeSelect = (
  ownerDocument: Document,
  label: string,
) => {
  const select = ownerDocument.createElement("select");
  select.setAttribute("aria-label", label);
  setStyle(select, {
    height: "28px",
    padding: "0 24px 0 8px",
    border: "1px solid var(--msr-color-ink-200, #e2e8f0)",
    "border-radius": "7px",
    background: "var(--msr-surface-raised, #fff)",
    color: "var(--msr-content, #18181b)",
    "font-family": "inherit",
    "font-size": "11px",
    cursor: "pointer",
  });

  return select;
};

const addOption = (
  ownerDocument: Document,
  select: HTMLSelectElement,
  value: string,
  label: string,
) => {
  const option = ownerDocument.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
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
  });
  root.append(panel);

  const previewShell = ownerDocument.createElement("div");
  setStyle(previewShell, {
    position: "relative",
    width: "100%",
    "min-height": "72px",
    "max-height": "160px",
    overflow: "hidden",
    "border-radius": "8px",
    background: "var(--msr-surface-muted, #f8fafc)",
    transition: "max-height 150ms ease",
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
    "max-height": "160px",
    "object-fit": "contain",
    transition: "max-height 150ms ease",
  });
  previewShell.append(video);

  const close = makeButton(ownerDocument, "×");
  close.dataset.mesurerRecordingDiscard = "true";
  close.setAttribute("aria-label", "Discard recording");
  setStyle(close, {
    position: "absolute",
    top: "6px",
    right: "6px",
    width: "24px",
    padding: "0",
    "border-radius": "999px",
    background: "rgb(15 23 42 / 78%)",
    color: "#fff",
    border: "0",
  });
  previewShell.append(close);

  const playbackRow = ownerDocument.createElement("div");
  setStyle(playbackRow, {
    display: "flex",
    "align-items": "center",
    gap: "6px",
    "margin-top": "8px",
  });
  panel.append(playbackRow);

  const play = makeButton(ownerDocument, "Play");
  play.dataset.mesurerRecordingPlay = "true";
  playbackRow.append(play);

  const currentTime = ownerDocument.createElement("span");
  currentTime.textContent = "0:00.00";
  setStyle(currentTime, {
    width: "48px",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
    "font-variant-numeric": "tabular-nums",
  });
  playbackRow.append(currentTime);

  const durationLabel = ownerDocument.createElement("span");
  setStyle(durationLabel, {
    "margin-left": "auto",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
    "font-variant-numeric": "tabular-nums",
  });
  playbackRow.append(durationLabel);

  const trimLabel = ownerDocument.createElement("div");
  trimLabel.dataset.mesurerRecordingTrimLabel = "true";
  setStyle(trimLabel, {
    "margin-top": "8px",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
    "font-variant-numeric": "tabular-nums",
  });
  panel.append(trimLabel);

  const trimGrid = ownerDocument.createElement("div");
  setStyle(trimGrid, {
    display: "grid",
    "grid-template-columns": "32px minmax(0, 1fr)",
    gap: "5px 8px",
    "align-items": "center",
    "margin-top": "5px",
  });
  panel.append(trimGrid);

  const startLabel = ownerDocument.createElement("span");
  startLabel.textContent = "In";
  startLabel.style.color = "var(--msr-color-ink-500, #64748b)";
  trimGrid.append(startLabel);

  const trimStart = ownerDocument.createElement("input");
  trimStart.type = "range";
  trimStart.min = "0";
  trimStart.step = "0.01";
  trimStart.dataset.mesurerRecordingTrimStart = "true";
  trimGrid.append(trimStart);

  const endLabel = ownerDocument.createElement("span");
  endLabel.textContent = "Out";
  endLabel.style.color = "var(--msr-color-ink-500, #64748b)";
  trimGrid.append(endLabel);

  const trimEnd = ownerDocument.createElement("input");
  trimEnd.type = "range";
  trimEnd.min = "0";
  trimEnd.step = "0.01";
  trimEnd.dataset.mesurerRecordingTrimEnd = "true";
  trimGrid.append(trimEnd);

  for (const slider of [trimStart, trimEnd]) {
    setStyle(slider, {
      width: "100%",
      height: "20px",
      margin: "0",
      accentColor: "var(--msr-accent, #0d99ff)",
      cursor: "ew-resize",
    });
  }

  const actions = ownerDocument.createElement("div");
  setStyle(actions, {
    display: "flex",
    "align-items": "center",
    gap: "6px",
    "margin-top": "8px",
  });
  panel.append(actions);

  const formatSelect = makeSelect(ownerDocument, "Export format");
  formatSelect.dataset.mesurerRecordingFormat = "true";
  actions.append(formatSelect);

  const scaleSelect = makeSelect(ownerDocument, "Export scale");
  scaleSelect.dataset.mesurerRecordingScale = "true";
  addOption(ownerDocument, scaleSelect, "1", "1×");
  addOption(ownerDocument, scaleSelect, "2", "2×");
  addOption(ownerDocument, scaleSelect, "3", "3×");
  actions.append(scaleSelect);

  const exportButton = makeButton(ownerDocument, "Export");
  exportButton.dataset.mesurerRecordingExport = "true";
  setStyle(exportButton, {
    "margin-left": "auto",
    background: "var(--msr-content, #18181b)",
    color: "var(--msr-surface, #fff)",
    border: "0",
  });
  actions.append(exportButton);

  const expand = makeButton(ownerDocument, "Expand");
  expand.dataset.mesurerRecordingExpand = "true";
  actions.append(expand);

  const status = ownerDocument.createElement("p");
  status.dataset.mesurerRecordingPreviewStatus = "true";
  status.setAttribute("role", "status");
  setStyle(status, {
    display: "none",
    margin: "7px 0 0",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-size": "11px",
  });
  panel.append(status);

  let asset: RecordingPreviewAsset | null = null;
  let objectUrl: string | null = null;
  let expanded = false;
  let exporting = false;
  let revision = 0;

  const selectedScale = (): RecordingScale => {
    const value = Number(scaleSelect.value);

    return value === 2 || value === 3 ? value : 1;
  };

  const trimRange = () => {
    const duration = asset?.duration ?? 0;
    const start = Math.min(duration, Math.max(0, Number(trimStart.value) || 0));
    const end = Math.min(duration, Math.max(start + MIN_TRIM_SECONDS, Number(trimEnd.value) || duration));

    return { start, end };
  };

  const syncTrimLabel = () => {
    const { start, end } = trimRange();

    trimLabel.textContent = `Trim ${timestamp(start)}–${timestamp(end)}`;
  };

  const setBusy = (value: boolean) => {
    exporting = value;

    for (const control of [play, close, trimStart, trimEnd, formatSelect, scaleSelect, exportButton, expand]) {
      control.toggleAttribute("disabled", value);
    }

    exportButton.textContent = value ? "Exporting…" : "Export";
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
    panel.style.display = "none";
    status.style.display = "none";
    setBusy(false);
  };

  close.addEventListener("click", () => {
    dismiss();
    onDiscard();
  });

  play.addEventListener("click", () => {
    if (!asset || exporting) return;

    if (video.paused) {
      const { start, end } = trimRange();

      if (video.currentTime < start || video.currentTime >= end) video.currentTime = start;
      void video.play();

      return;
    }

    video.pause();
  });

  video.addEventListener("play", () => {
    play.textContent = "Pause";
  });

  video.addEventListener("pause", () => {
    play.textContent = "Play";
  });

  video.addEventListener("timeupdate", () => {
    if (!asset) return;
    const { start, end } = trimRange();

    if (video.currentTime >= end - 0.01) {
      video.pause();
      video.currentTime = start;
    } else if (video.currentTime < start) {
      video.currentTime = start;
    }

    currentTime.textContent = timestamp(video.currentTime);
  });

  trimStart.addEventListener("input", () => {
    if (!asset) return;

    const start = Math.min(
      asset.duration - MIN_TRIM_SECONDS,
      Math.max(0, Number(trimStart.value) || 0),
    );

    trimStart.value = String(start);

    if ((Number(trimEnd.value) || asset.duration) < start + MIN_TRIM_SECONDS) {
      trimEnd.value = String(Math.min(asset.duration, start + MIN_TRIM_SECONDS));
    }

    video.currentTime = start;
    syncTrimLabel();
  });

  trimEnd.addEventListener("input", () => {
    if (!asset) return;

    const start = Number(trimStart.value) || 0;

    const end = Math.max(
      start + MIN_TRIM_SECONDS,
      Math.min(asset.duration, Number(trimEnd.value) || asset.duration),
    );

    trimEnd.value = String(end);
    video.currentTime = end;
    syncTrimLabel();
  });

  expand.addEventListener("click", () => {
    expanded = !expanded;
    panel.style.width = `${expanded ? PANEL_EXPANDED_WIDTH : PANEL_WIDTH}px`;
    previewShell.style.maxHeight = expanded ? "440px" : "160px";
    video.style.maxHeight = expanded ? "440px" : "160px";
    expand.textContent = expanded ? "Shrink" : "Expand";
    ownerWindow.requestAnimationFrame(place);
  });

  exportButton.addEventListener("click", () => {
    if (!asset || exporting) return;
    const operation = ++revision;
    const { start, end } = trimRange();
    const requestedFormat = formatSelect.value === "mp4" ? "mp4" : "webm";

    setBusy(true);
    status.style.display = "block";
    status.textContent = "Exporting with MediaBunny…";

    void onExport({
      format: requestedFormat,
      startTime: start,
      endTime: end,
      scale: selectedScale(),
    }).then((result) => {
      if (operation !== revision) return;
      downloadBlob(result.blob, result.filename, ownerDocument, ownerWindow);
      status.textContent = `Exported ${result.width}×${result.height} ${result.format.toUpperCase()}`;
    }).catch((cause: unknown) => {
      if (operation !== revision) return;
      status.textContent = cause instanceof Error ? cause.message : "Could not export the recording.";
    }).finally(() => {
      if (operation === revision) setBusy(false);
    });
  });

  const onResize = () => place();
  ownerWindow.addEventListener("resize", onResize);

  return {
    show(nextAsset) {
      revision += 1;
      clearUrl();
      asset = nextAsset;

      const nextUrl = globalThis.URL.createObjectURL(nextAsset.blob);

      objectUrl = nextUrl;
      video.src = nextUrl;
      video.currentTime = 0;
      currentTime.textContent = "0:00.00";
      durationLabel.textContent = timestamp(nextAsset.duration);
      trimStart.max = String(nextAsset.duration);
      trimStart.value = "0";
      trimEnd.max = String(nextAsset.duration);
      trimEnd.value = String(nextAsset.duration);
      syncTrimLabel();
      formatSelect.replaceChildren();
      addOption(ownerDocument, formatSelect, "webm", "WebM");
      panel.style.display = "block";
      status.style.display = "none";
      setBusy(false);
      place();

      const operation = revision;

      void formats(nextAsset).then((supported) => {
        if (operation !== revision || !asset) return;
        formatSelect.replaceChildren();

        for (const format of supported) {
          addOption(ownerDocument, formatSelect, format, format === "mp4" ? "MP4" : "WebM");
        }

        if (supported.length === 0) {
          addOption(ownerDocument, formatSelect, "webm", "No export codec");
          formatSelect.disabled = true;
          exportButton.disabled = true;
          status.style.display = "block";
          status.textContent = "No MediaBunny video encoder is available in this runtime.";
        } else {
          formatSelect.disabled = false;
          exportButton.disabled = false;
        }
      }).catch((cause: unknown) => {
        if (operation !== revision) return;
        status.style.display = "block";
        status.textContent = cause instanceof Error ? cause.message : "Could not inspect export support.";
      });

      ownerWindow.requestAnimationFrame(place);
    },
    dismiss,
    dispose() {
      dismiss();
      ownerWindow.removeEventListener("resize", onResize);
      panel.remove();
    },
  };
};
