import {
  MIN_SCREENSHOT_SELECTION,
  normalizeScreenshotRect,
  type ScreenshotRect,
} from "../core/screenshot";

const ERROR_DURATION_MS = 3000;

const setStyle = (
  element: HTMLElement,
  styles: Record<string, string>,
) => {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value);
  }
};

export type RecordingSelectionController = {
  startSelection(): void;
  finishSelection(): void;
  showRecordingMask(rect: ScreenshotRect): void;
  hideRecordingMask(): void;
  placeRecordingStatus(rect: ScreenshotRect): void;
  hideRecordingStatus(): void;
  setRecordingTime(value: string): void;
  flashError(cause: unknown): void;
  dispose(): void;
};

type RecordingSelectionControllerOptions = {
  ownerDocument: Document;
  ownerWindow: Window;
  root: HTMLElement;
  statusRoot: HTMLElement;
  rendererRoot: HTMLElement | null;
  isSelecting(): boolean;
  isRecording(): boolean;
  onRectChange(rect: ScreenshotRect | null): void;
  onConfirm(rect: ScreenshotRect): Promise<void>;
  onCancel(): Promise<void>;
  onStop(): Promise<void>;
  setRecordingInteractionActive(active: boolean): void;
};

export const createRecordingSelectionController = ({
  ownerDocument,
  ownerWindow,
  root,
  statusRoot,
  rendererRoot,
  isSelecting,
  isRecording,
  onRectChange,
  onConfirm,
  onCancel,
  onStop,
  setRecordingInteractionActive,
}: RecordingSelectionControllerOptions): RecordingSelectionController => {
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
    element.dataset.mesurerRecordingShade = "true";
    setStyle(element, {
      position: "fixed",
      background: "rgb(0 0 0 / 40%)",
      "pointer-events": "none",
    });
    overlay.append(element);

    return element;
  });

  const recordingMask = ownerDocument.createElement("div");
  recordingMask.dataset.mesurerRecordingMask = "true";
  setStyle(recordingMask, {
    position: "fixed",
    display: "none",
    background: "transparent",
    outline: "2px solid var(--msr-accent, #0d99ff)",
    "outline-offset": "-1px",
    "box-shadow": "0 0 0 100vmax rgb(0 0 0 / 40%)",
    "pointer-events": "none",
  });
  overlay.append(recordingMask);

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
  statusRoot.append(recordingStatus);

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

  statusRoot.append(errorToast);

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

  let errorTimer = 0;

  const resetSelectionState = () => {
    selectingOrigin = null;
    selectionRect = null;
    selectionAdjusting = false;
    selectionDrag = null;
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
    onRectChange(clamped);
    renderSelection(clamped);
  };

  const showRecordingMask = (rect: ScreenshotRect) => {
    resetSelectionState();

    for (const element of shade) {
      setRectStyle(element, { left: 0, top: 0, width: 0, height: 0 });
    }

    setRectStyle(recordingMask, rect);
    recordingMask.style.display = "block";
    outline.style.display = "none";
    sizeTag.style.display = "none";
    selectionPanel.style.display = "none";
    selectionGrid.style.display = "none";
    hint.style.display = "none";

    for (const handle of resizeHandles) handle.style.display = "none";

    overlay.style.display = "block";
    overlay.style.pointerEvents = "none";
    overlay.style.cursor = "default";
  };

  const hideRecordingMask = () => {
    setRecordingInteractionActive(false);
    recordingMask.style.display = "none";
    overlay.style.display = "none";
    overlay.style.pointerEvents = "auto";
    overlay.style.cursor = "crosshair";
    hint.style.removeProperty("display");
  };

  const finishSelection = () => {
    resetSelectionState();
    renderSelection(null);
    overlay.style.display = "none";
    overlay.style.cursor = "crosshair";
    root.style.pointerEvents = "none";
  };

  const placeRecordingStatus = (rect: ScreenshotRect) => {
    const height = 34;
    const gap = 8;
    const viewportHeight = ownerWindow.innerHeight;
    const viewportWidth = ownerWindow.innerWidth;

    recordingStatus.style.visibility = "hidden";
    recordingStatus.style.display = "flex";

    const width = Math.max(112, recordingStatus.offsetWidth || 112);

    const left = Math.min(
      viewportWidth - width - 8,
      Math.max(8, rect.left + rect.width / 2 - width / 2),
    );

    const toolbarRect = rendererRoot
      ?.querySelector<HTMLElement>("[data-mesurer-toolbar='true']")
      ?.getBoundingClientRect();

    const candidates = [
      rect.top >= height + gap + 8 ? rect.top - height - gap : null,
      viewportHeight - (rect.top + rect.height) >= height + gap + 8
        ? rect.top + rect.height + gap
        : null,
    ].filter((top): top is number => top !== null);

    const overlapsToolbar = (top: number) => {
      if (!toolbarRect) return false;

      return left < toolbarRect.right
        && left + width > toolbarRect.left
        && top < toolbarRect.bottom
        && top + height > toolbarRect.top;
    };

    const top = candidates.find((candidate) => !overlapsToolbar(candidate))
      ?? candidates[0]
      ?? null;

    if (top === null) {
      recordingStatus.style.display = "none";
      recordingStatus.style.removeProperty("visibility");

      return;
    }

    recordingStatus.style.left = `${left}px`;
    recordingStatus.style.top = `${top}px`;
    recordingStatus.style.removeProperty("visibility");
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
    }, ERROR_DURATION_MS);
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
    if (!isSelecting() || event.button !== 0) return;

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
    onRectChange(null);
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
    if (!isSelecting()) return;

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

    if (!isSelecting() || !origin) return;

    if (overlay.hasPointerCapture?.(event.pointerId)) overlay.releasePointerCapture(event.pointerId);

    const rect = normalizeScreenshotRect(
      origin,
      { x: event.clientX, y: event.clientY },
      { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
    );

    if (rect.width < MIN_SCREENSHOT_SELECTION || rect.height < MIN_SCREENSHOT_SELECTION) {
      selectionRect = null;
      selectionAdjusting = false;
      onRectChange(null);
      renderSelection(null);

      return;
    }

    selectionRect = clampSelectionRect(rect);
    selectionAdjusting = true;
    overlay.style.cursor = "default";
    onRectChange(selectionRect);
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
      && isSelecting()
      && selectionAdjusting
      && selectionRect
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void onConfirm(selectionRect).catch(() => undefined);

      return;
    }

    if (event.key !== "Escape") return;

    if (isSelecting()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void onCancel().catch(() => undefined);

      return;
    }

    if (isRecording()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void onStop().catch(() => undefined);
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
      target instanceof Element
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
      isSelecting()
      && selectionAdjusting
      && selectionRect
    ) {
      void onConfirm(selectionRect).catch(() => undefined);
    }
  });

  recordingStop.addEventListener("click", () => {
    if (isRecording()) {
      void onStop().catch(() => undefined);

      return;
    }

    if (isSelecting() && recordingStatus.style.display !== "none") {
      void onCancel().catch(() => undefined);
    }
  });

  const startSelection = () => {
    resetSelectionState();
    renderSelection(null);
    overlay.style.display = "block";
    overlay.style.pointerEvents = "auto";
    hint.style.removeProperty("display");
    root.style.pointerEvents = "auto";
  };

  return {
    startSelection,
    finishSelection,
    showRecordingMask,
    hideRecordingMask,
    placeRecordingStatus,
    hideRecordingStatus,
    setRecordingTime(value) {
      recordingTime.textContent = value;
    },
    flashError,
    dispose() {
      overlay.removeEventListener("pointerdown", onPointerDown);
      overlay.removeEventListener("pointermove", onPointerMove);
      overlay.removeEventListener("pointerup", onPointerUp);
      overlay.removeEventListener("pointercancel", onPointerCancel);
      ownerWindow.removeEventListener("keydown", onKeyDown, true);

      if (errorTimer) ownerWindow.clearTimeout(errorTimer);
      finishSelection();
    },
  };
};
