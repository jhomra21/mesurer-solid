export const RECORDING_PREVIEW_PANEL_WIDTH = 352;

export const RECORDING_PREVIEW_PANEL_EXPANDED_WIDTH = 576;

const TIMELINE_EDGE_GUTTER = 10;

const setStyle = (
  element: HTMLElement,
  styles: Record<string, string>,
) => {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value);
  }
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

export const makeRecordingMenuRow = (
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

type RecordingPreviewUiOptions = {
  ownerDocument: Document;
  root: HTMLElement;
};

export const createRecordingPreviewUi = ({
  ownerDocument,
  root,
}: RecordingPreviewUiOptions) => {
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
    transform: "translateX(-50%)",
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
    height: "28px",
    "align-items": "center",
    gap: "8px",
    "margin-top": "8px",
  });

  panel.append(controls);

  const play = makeIconButton(ownerDocument, "Play", "▶");

  play.dataset.mesurerRecordingPlay = "true";
  controls.append(play);

  const currentTime = ownerDocument.createElement("span");

  currentTime.dataset.mesurerRecordingCurrentTime = "true";
  currentTime.textContent = "0:00.00";

  setStyle(currentTime, {
    display: "flex",
    width: "8ch",
    "min-width": "8ch",
    height: "20px",
    "align-items": "center",
    "flex-shrink": "0",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
    "font-size": "10px",
    "font-variant-numeric": "tabular-nums",
    "white-space": "nowrap",
  });

  controls.append(currentTime);

  const timeline = ownerDocument.createElement("div");

  timeline.dataset.mesurerRecordingTimeline = "true";

  setStyle(timeline, {
    position: "relative",
    height: "28px",
    "min-width": "0",
    flex: "1 1 0",
    cursor: "pointer",
    "user-select": "none",
  });

  controls.append(timeline);

  const track = ownerDocument.createElement("div");

  track.dataset.mesurerRecordingTimelineTrack = "true";
  setStyle(track, {
    position: "absolute",
    left: `${TIMELINE_EDGE_GUTTER}px`,
    right: `${TIMELINE_EDGE_GUTTER}px`,
    top: "0",
    bottom: "0",
  });
  timeline.append(track);

  const rail = ownerDocument.createElement("div");

  rail.dataset.mesurerRecordingTimelineRail = "true";

  setStyle(rail, {
    position: "absolute",
    left: "0",
    right: "0",
    top: "21px",
    height: "3px",
    transform: "translateY(-50%)",
    "border-radius": "999px",
    background: "var(--msr-color-ink-200, #e2e8f0)",
    "pointer-events": "none",
  });

  track.append(rail);

  const clip = ownerDocument.createElement("div");

  clip.dataset.mesurerRecordingTimelineClip = "true";

  setStyle(clip, {
    position: "absolute",
    top: "21px",
    height: "3px",
    transform: "translateY(-50%)",
    "border-radius": "999px",
    background: "var(--msr-color-ink-300, #cbd5e1)",
    "pointer-events": "none",
  });

  track.append(clip);

  const hoverMarker = ownerDocument.createElement("div");

  setStyle(hoverMarker, {
    position: "absolute",
    display: "none",
    top: "21px",
    width: "2px",
    height: "10px",
    transform: "translate(-50%, -50%)",
    "border-radius": "999px",
    background: "var(--msr-color-ink-500, #64748b)",
    opacity: "0.5",
    "pointer-events": "none",
  });

  track.append(hoverMarker);

  const playhead = ownerDocument.createElement("div");

  playhead.dataset.mesurerRecordingPlayhead = "true";

  setStyle(playhead, {
    position: "absolute",
    top: "21px",
    left: "0",
    width: "2px",
    height: "9px",
    transform: "translate(-50%, -50%)",
    "border-radius": "999px",
    background: "var(--msr-content, #18181b)",
    "z-index": "25",
    "pointer-events": "none",
    transition: "height 150ms ease",
  });

  track.append(playhead);

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
      top: "0",
      display: "flex",
      width: "20px",
      height: "16px",
      padding: "0",
      border: "0",
      "border-radius": "4px",
      background: "transparent",
      color: "var(--msr-content, #18181b)",
      transform: "translateX(-50%)",
      "z-index": "30",
      "align-items": "center",
      "justify-content": "center",
      cursor: "ew-resize",
      "touch-action": "none",
    });

    const chevron = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");

    chevron.dataset.mesurerRecordingTrimChevron = kind;
    chevron.setAttribute("aria-hidden", "true");
    chevron.setAttribute("viewBox", "0 0 12 14");
    chevron.setAttribute("width", "12");
    chevron.setAttribute("height", "14");

    const chevronPath = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");

    chevronPath.setAttribute("d", kind === "start" ? "M3.5 2.5L8.5 7L3.5 11.5" : "M8.5 2.5L3.5 7L8.5 11.5");
    chevronPath.setAttribute("fill", "none");
    chevronPath.setAttribute("stroke", "currentColor");
    chevronPath.setAttribute("stroke-width", "2");
    chevronPath.setAttribute("stroke-linecap", "round");
    chevronPath.setAttribute("stroke-linejoin", "round");
    chevron.append(chevronPath);
    handle.append(chevron);

    const stem = ownerDocument.createElement("span");

    stem.setAttribute("aria-hidden", "true");
    setStyle(stem, {
      position: "absolute",
      left: "50%",
      top: "15px",
      width: "1px",
      height: "4px",
      background: "var(--msr-content, #18181b)",
      transform: "translateX(-50%)",
      "pointer-events": "none",
    });
    handle.append(stem);
    track.append(handle);

    return handle;
  };

  const trimStart = makeTrimHandle("start", "Trim start");
  const trimEnd = makeTrimHandle("end", "Trim end");

  const durationLabel = ownerDocument.createElement("span");

  durationLabel.dataset.mesurerRecordingDuration = "true";

  setStyle(durationLabel, {
    display: "flex",
    width: "8ch",
    "min-width": "8ch",
    height: "20px",
    "align-items": "center",
    "justify-content": "flex-end",
    "flex-shrink": "0",
    color: "var(--msr-color-ink-500, #64748b)",
    "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
    "font-size": "10px",
    "font-variant-numeric": "tabular-nums",
    "white-space": "nowrap",
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
    const row = makeRecordingMenuRow(ownerDocument, `${scale}×`);

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

  return {
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
  };
};
