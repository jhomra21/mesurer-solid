import {
  copyPngToClipboard,
  createScreenshotFilename,
  downloadPng,
} from "../core/screenshot";

const PREVIEW_WIDTH = 144;
const PREVIEW_HEIGHT = 96;
const VIEWPORT_PADDING = 8;
const DRAG_THRESHOLD = 4;
const TOAST_DURATION_MS = 1800;

type ScreenshotPreviewStatus = {
  copied: boolean;
  downloaded: boolean;
  copyFailed: boolean;
  downloadFailed: boolean;
};

type ScreenshotPreviewControllerOptions = {
  ownerDocument: Document;
  ownerWindow: Window;
  root: HTMLElement;
  anchorRect(): DOMRect | null;
  previewDurationMs: number;
};

type PreviewPosition = {
  left: number;
  top: number;
};

type PreviewDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  left: number;
  top: number;
  moved: boolean;
};

export type ScreenshotPreviewController = {
  show(blob: Blob, status: ScreenshotPreviewStatus): void;
  dismiss(): void;
  dispose(): void;
};

const setStyle = (
  element: HTMLElement,
  styles: Record<string, string>,
) => {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value);
  }
};

const clampPosition = (
  position: PreviewPosition,
  ownerWindow: Window,
): PreviewPosition => ({
  left: Math.min(
    Math.max(VIEWPORT_PADDING, position.left),
    Math.max(VIEWPORT_PADDING, ownerWindow.innerWidth - PREVIEW_WIDTH - VIEWPORT_PADDING),
  ),
  top: Math.min(
    Math.max(VIEWPORT_PADDING, position.top),
    Math.max(VIEWPORT_PADDING, ownerWindow.innerHeight - PREVIEW_HEIGHT - VIEWPORT_PADDING),
  ),
});

const createViewerButton = (
  ownerDocument: Document,
  label: string,
) => {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.textContent = label;
  setStyle(button, {
    height: "32px",
    padding: "0 12px",
    border: "1px solid rgb(255 255 255 / 18%)",
    "border-radius": "8px",
    "background-color": "rgb(28 28 30 / 84%)",
    color: "white",
    "font-family": "inherit",
    "font-size": "12px",
    "font-weight": "500",
    cursor: "pointer",
  });
  return button;
};

const captureStatusText = ({
  copied,
  downloaded,
  copyFailed,
  downloadFailed,
}: ScreenshotPreviewStatus) => {
  if (copied && downloaded) return "Copied and saved screenshot";
  if (copied && downloadFailed) return "Copied screenshot · Save unavailable";
  if (downloaded && copyFailed) return "Saved screenshot · Copy unavailable";
  if (copied) return "Copied screenshot";
  if (downloaded) return "Saved screenshot";
  if (copyFailed && downloadFailed) return "Screenshot captured · Copy and save unavailable";
  if (copyFailed) return "Screenshot captured · Copy unavailable";
  if (downloadFailed) return "Screenshot captured · Save unavailable";
  return "Screenshot captured";
};

export const createScreenshotPreviewController = ({
  ownerDocument,
  ownerWindow,
  root,
  anchorRect,
  previewDurationMs,
}: ScreenshotPreviewControllerOptions): ScreenshotPreviewController => {
  const preview = ownerDocument.createElement("div");
  preview.dataset.mesurerScreenshotPreview = "true";
  preview.setAttribute("role", "button");
  preview.setAttribute("aria-label", "Open captured screenshot");
  preview.tabIndex = 0;
  setStyle(preview, {
    position: "fixed",
    display: "none",
    "z-index": "96",
    width: `${PREVIEW_WIDTH}px`,
    height: `${PREVIEW_HEIGHT}px`,
    overflow: "hidden",
    "border-radius": "10px",
    border: "1px solid rgb(0 0 0 / 14%)",
    "background-color": "white",
    "box-shadow": "0 2px 8px rgb(0 0 0 / 12%)",
    "pointer-events": "auto",
    cursor: "grab",
    "user-select": "none",
    "touch-action": "none",
  });

  const previewImage = ownerDocument.createElement("img");
  previewImage.dataset.mesurerScreenshotPreviewImage = "true";
  previewImage.alt = "Captured screenshot";
  previewImage.draggable = false;
  previewImage.title = "Click to open · Right-click for browser image actions";
  setStyle(previewImage, {
    display: "block",
    width: "100%",
    height: "100%",
    "object-fit": "contain",
    "background-color": "white",
  });
  preview.append(previewImage);

  const dismissButton = ownerDocument.createElement("button");
  dismissButton.dataset.mesurerScreenshotPreviewDismiss = "true";
  dismissButton.type = "button";
  dismissButton.textContent = "×";
  dismissButton.setAttribute("aria-label", "Dismiss screenshot preview");
  dismissButton.title = "Dismiss";
  setStyle(dismissButton, {
    position: "absolute",
    top: "6px",
    right: "6px",
    width: "22px",
    height: "22px",
    padding: "0",
    border: "1px solid rgb(255 255 255 / 22%)",
    "border-radius": "999px",
    "background-color": "rgb(0 0 0 / 62%)",
    color: "white",
    "font-family": "inherit",
    "font-size": "16px",
    "line-height": "18px",
    cursor: "pointer",
  });
  preview.append(dismissButton);
  root.append(preview);

  const viewer = ownerDocument.createElement("div");
  viewer.dataset.mesurerScreenshotViewer = "true";
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.setAttribute("aria-label", "Screenshot viewer");
  setStyle(viewer, {
    position: "fixed",
    inset: "0",
    display: "none",
    "z-index": "110",
    "align-items": "center",
    "justify-content": "center",
    padding: "56px 48px 40px",
    "box-sizing": "border-box",
    "background-color": "rgb(0 0 0 / 72%)",
    "backdrop-filter": "blur(8px)",
    "pointer-events": "auto",
  });

  const viewerImage = ownerDocument.createElement("img");
  viewerImage.dataset.mesurerScreenshotViewerImage = "true";
  viewerImage.alt = "Captured screenshot";
  setStyle(viewerImage, {
    display: "block",
    "max-width": "calc(100vw - 96px)",
    "max-height": "calc(100vh - 112px)",
    width: "auto",
    height: "auto",
    "object-fit": "contain",
    "border-radius": "8px",
    "box-shadow": "0 8px 30px rgb(0 0 0 / 28%)",
  });
  viewer.append(viewerImage);

  const viewerControls = ownerDocument.createElement("div");
  viewerControls.dataset.mesurerScreenshotViewerControls = "true";
  setStyle(viewerControls, {
    position: "fixed",
    top: "16px",
    right: "16px",
    display: "flex",
    gap: "8px",
    "pointer-events": "auto",
  });
  const copyButton = createViewerButton(ownerDocument, "Copy");
  copyButton.dataset.mesurerScreenshotViewerCopy = "true";
  copyButton.setAttribute("aria-label", "Copy screenshot");
  const saveButton = createViewerButton(ownerDocument, "Save");
  saveButton.dataset.mesurerScreenshotViewerSave = "true";
  saveButton.setAttribute("aria-label", "Save screenshot");
  const closeViewerButton = createViewerButton(ownerDocument, "Close");
  closeViewerButton.dataset.mesurerScreenshotViewerClose = "true";
  closeViewerButton.setAttribute("aria-label", "Close screenshot viewer");
  viewerControls.append(copyButton, saveButton, closeViewerButton);
  viewer.append(viewerControls);
  root.append(viewer);

  const toast = ownerDocument.createElement("div");
  toast.dataset.mesurerScreenshotToast = "true";
  toast.setAttribute("role", "status");
  setStyle(toast, {
    position: "fixed",
    left: "50%",
    bottom: "20px",
    display: "none",
    "z-index": "120",
    transform: "translateX(-50%)",
    padding: "7px 10px",
    "border-radius": "8px",
    "background-color": "rgb(28 28 30 / 90%)",
    color: "white",
    "font-size": "12px",
    "font-weight": "500",
    "pointer-events": "none",
  });
  root.append(toast);

  let currentBlob: Blob | null = null;
  let currentUrl: string | null = null;
  let previewPosition: PreviewPosition | null = null;
  let previewDrag: PreviewDrag | null = null;
  let previewTimer = 0;
  let toastTimer = 0;
  let disposed = false;

  const clearPreviewTimer = () => {
    if (previewTimer) ownerWindow.clearTimeout(previewTimer);
    previewTimer = 0;
  };

  const clearToastTimer = () => {
    if (toastTimer) ownerWindow.clearTimeout(toastTimer);
    toastTimer = 0;
  };

  const showToast = (message: string, error = false) => {
    clearToastTimer();
    toast.textContent = message;
    toast.style.backgroundColor = error ? "#b42318" : "rgb(28 28 30 / 90%)";
    toast.style.display = "block";
    toastTimer = ownerWindow.setTimeout(() => {
      toastTimer = 0;
      toast.style.display = "none";
    }, TOAST_DURATION_MS);
  };

  const closeViewer = () => {
    viewer.style.display = "none";
  };

  const revokeCurrent = () => {
    if (currentUrl) globalThis.URL.revokeObjectURL(currentUrl);
    currentUrl = null;
    currentBlob = null;
    previewImage.removeAttribute("src");
    viewerImage.removeAttribute("src");
  };

  const dismiss = () => {
    clearPreviewTimer();
    closeViewer();
    preview.style.display = "none";
    revokeCurrent();
  };

  const defaultPosition = (): PreviewPosition => {
    const anchor = anchorRect();
    if (!anchor) return { left: VIEWPORT_PADDING, top: VIEWPORT_PADDING };
    const left = anchor.left + anchor.width / 2 - PREVIEW_WIDTH / 2;
    const below = anchor.bottom + 8;
    const top = below + PREVIEW_HEIGHT <= ownerWindow.innerHeight - VIEWPORT_PADDING
      ? below
      : anchor.top - PREVIEW_HEIGHT - 8;
    return clampPosition({ left, top }, ownerWindow);
  };

  const applyPreviewPosition = (position: PreviewPosition) => {
    const next = clampPosition(position, ownerWindow);
    previewPosition = next;
    preview.style.left = `${next.left}px`;
    preview.style.top = `${next.top}px`;
  };

  const openViewer = () => {
    if (!currentBlob || !currentUrl) return;
    clearPreviewTimer();
    viewer.style.display = "flex";
    closeViewerButton.focus();
  };

  const copyCurrent = async () => {
    const blob = currentBlob;
    if (!blob) return;
    try {
      await copyPngToClipboard(Promise.resolve(blob), ownerWindow);
      showToast("Copied screenshot");
    } catch {
      showToast("Could not copy screenshot", true);
    }
  };

  const saveCurrent = () => {
    const blob = currentBlob;
    if (!blob) return;
    try {
      downloadPng(blob, createScreenshotFilename(), ownerDocument, ownerWindow);
      showToast("Saved screenshot");
    } catch {
      showToast("Could not save screenshot", true);
    }
  };

  const onPreviewPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !currentBlob) return;
    clearPreviewTimer();
    const rect = preview.getBoundingClientRect();
    previewDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    };
    preview.style.cursor = "grabbing";
    preview.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onPreviewPointerMove = (event: PointerEvent) => {
    const drag = previewDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD) drag.moved = true;
    if (!drag.moved) return;
    applyPreviewPosition({ left: drag.left + dx, top: drag.top + dy });
  };

  const endPreviewDrag = (event: PointerEvent) => {
    const drag = previewDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    previewDrag = null;
    preview.style.cursor = "grab";
    if (preview.hasPointerCapture?.(event.pointerId)) preview.releasePointerCapture(event.pointerId);
    if (!drag.moved) openViewer();
  };

  const onPreviewPointerCancel = (event: PointerEvent) => {
    const drag = previewDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    previewDrag = null;
    preview.style.cursor = "grab";
    if (preview.hasPointerCapture?.(event.pointerId)) preview.releasePointerCapture(event.pointerId);
  };

  const onPreviewKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openViewer();
  };

  const onViewerClick = (event: MouseEvent) => {
    if (event.target === viewer) closeViewer();
  };

  const onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || viewer.style.display === "none") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeViewer();
  };

  dismissButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  dismissButton.addEventListener("click", (event) => {
    event.stopPropagation();
    dismiss();
  });
  preview.addEventListener("pointerdown", onPreviewPointerDown);
  preview.addEventListener("pointermove", onPreviewPointerMove);
  preview.addEventListener("pointerup", endPreviewDrag);
  preview.addEventListener("pointercancel", onPreviewPointerCancel);
  preview.addEventListener("keydown", onPreviewKeyDown);
  viewer.addEventListener("click", onViewerClick);
  copyButton.addEventListener("click", () => { void copyCurrent(); });
  saveButton.addEventListener("click", saveCurrent);
  closeViewerButton.addEventListener("click", closeViewer);
  ownerWindow.addEventListener("pointermove", onPreviewPointerMove, true);
  ownerWindow.addEventListener("pointerup", endPreviewDrag, true);
  ownerWindow.addEventListener("pointercancel", onPreviewPointerCancel, true);
  ownerWindow.addEventListener("keydown", onWindowKeyDown, true);

  return {
    show(blob, status) {
      if (disposed) return;
      clearPreviewTimer();
      closeViewer();
      revokeCurrent();
      currentBlob = blob;
      currentUrl = globalThis.URL.createObjectURL(blob);
      previewImage.src = currentUrl;
      viewerImage.src = currentUrl;
      preview.style.display = "block";
      applyPreviewPosition(previewPosition ?? defaultPosition());
      showToast(captureStatusText(status));
      if (previewDurationMs > 0) {
        previewTimer = ownerWindow.setTimeout(dismiss, previewDurationMs);
      }
    },
    dismiss,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearPreviewTimer();
      clearToastTimer();
      dismiss();
      ownerWindow.removeEventListener("pointermove", onPreviewPointerMove, true);
      ownerWindow.removeEventListener("pointerup", endPreviewDrag, true);
      ownerWindow.removeEventListener("pointercancel", onPreviewPointerCancel, true);
      ownerWindow.removeEventListener("keydown", onWindowKeyDown, true);
      preview.removeEventListener("pointerdown", onPreviewPointerDown);
      preview.removeEventListener("pointermove", onPreviewPointerMove);
      preview.removeEventListener("pointerup", endPreviewDrag);
      preview.removeEventListener("pointercancel", onPreviewPointerCancel);
      preview.removeEventListener("keydown", onPreviewKeyDown);
      viewer.removeEventListener("click", onViewerClick);
      if (root.contains(preview)) preview.remove();
      if (root.contains(viewer)) viewer.remove();
      if (root.contains(toast)) toast.remove();
    },
  };
};
