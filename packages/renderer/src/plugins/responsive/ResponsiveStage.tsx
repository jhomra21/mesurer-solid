import { onSettled } from "solid-js";
import { RESPONSIVE_FRAME_SANDBOX, installPreviewGuard } from "../../core/preview-guard";
import { isEditableKeyboardEvent } from "../../core/events";
import { CLOSE_ICON_PATH } from "../../components/Icons";

const WIDTH = 393;

const HEIGHT = 852;

const HEADER_HEIGHT = 40;

type ResponsiveStageProps = {
  ownerDocument: Document;
  ownerWindow: Window;
  host: HTMLElement;
  onClose(): void;
  onFramePointerDown(): void;
  shortcutsEnabled: boolean;
};

const setStyles = (element: HTMLElement, values: Record<string, string>) => {
  for (const [property, value] of Object.entries(values)) element.style.setProperty(property, value);
};

export function ResponsiveStage(props: ResponsiveStageProps) {
  onSettled(() => {
    const { ownerDocument, ownerWindow } = props;
    const host = props.host;

    const stage = ownerDocument.createElement("div");
    stage.dataset.mesurerResponsiveStage = "true";
    stage.dataset.mesurerInspectorUi = "true";
    setStyles(stage, {
      position: "fixed", inset: "0", "z-index": "80", display: "flex",
      "align-items": "center", "justify-content": "center", background: "#09090b",
      "font-family": "ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      color: "var(--msr-content, #171717)", "pointer-events": "auto",
    });
    stage.addEventListener("pointerdown", (event) => {
      if (event.target === stage) props.onClose();
    });

    const card = ownerDocument.createElement("div");
    card.dataset.mesurerResponsiveCard = "true";
    setStyles(card, {
      position: "relative", width: `${WIDTH}px`, height: `${HEIGHT + HEADER_HEIGHT}px`,
      overflow: "hidden", "border-radius": "10px", "box-shadow": "var(--msr-shadow-floating)",
      background: "var(--msr-surface-raised)", "transform-origin": "center center",
    });

    const header = ownerDocument.createElement("div");
    header.dataset.mesurerResponsiveHeader = "true";
    setStyles(header, {
      height: `${HEADER_HEIGHT}px`, display: "flex", "align-items": "center",
      "justify-content": "space-between", padding: "0 12px", "box-sizing": "border-box",
      gap: "12px", background: "var(--msr-surface-raised)", "font-size": "12px", "font-weight": "500",
    });
    const title = ownerDocument.createElement("span");
    title.textContent = "iPhone 15";
    const dimensions = ownerDocument.createElement("span");
    dimensions.textContent = "393 × 852";
    const close = ownerDocument.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close Responsive");
    close.title = "Close Responsive";
    close.className = "msr:flex msr:h-6 msr:w-6 msr:items-center msr:justify-center msr:rounded-[5px] msr:text-[var(--msr-content)] hover:msr:bg-[var(--msr-surface-muted)]";
    setStyles(close, { border: "0", background: "transparent", cursor: "pointer" });
    const closeIcon = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    closeIcon.setAttribute("width", "16");
    closeIcon.setAttribute("height", "16");
    closeIcon.setAttribute("viewBox", "0 0 256 256");
    closeIcon.setAttribute("fill", "currentColor");
    closeIcon.setAttribute("aria-hidden", "true");
    const closePath = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    closePath.setAttribute("d", CLOSE_ICON_PATH);
    closeIcon.append(closePath);
    close.append(closeIcon);
    close.addEventListener("click", props.onClose);
    header.append(title, dimensions, close);
    const headerSlot = ownerDocument.createElement("div");
    headerSlot.dataset.mesurerResponsiveHeaderSlot = "true";
    setStyles(headerSlot, { position: "relative", width: `${WIDTH}px`, height: `${HEADER_HEIGHT}px`, overflow: "hidden" });
    headerSlot.append(header);

    const frameShell = ownerDocument.createElement("div");
    frameShell.dataset.mesurerResponsiveFrameShell = "true";
    setStyles(frameShell, { position: "relative", overflow: "hidden", width: `${WIDTH}px`, height: `${HEIGHT}px` });
    const frame = ownerDocument.createElement("iframe");
    frame.dataset.mesurerResponsiveFrame = "true";
    frame.setAttribute("sandbox", RESPONSIVE_FRAME_SANDBOX);
    frame.title = "iPhone 15 preview";
    frame.width = String(WIDTH);
    frame.height = String(HEIGHT);
    frame.src = ownerWindow.location.href;
    setStyles(frame, {
      display: "block", width: `${WIDTH}px`, height: `${HEIGHT}px`, border: "0",
      "transform-origin": "top left",
    });

    const status = ownerDocument.createElement("div");
    status.dataset.mesurerResponsiveStatus = "true";
    status.setAttribute("role", "status");
    status.textContent = "Loading preview…";
    setStyles(status, {
      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      padding: "8px 12px", "border-radius": "6px", background: "var(--msr-surface-raised)",
      "font-size": "12px", "z-index": "2",
    });
    let removeGuard: (() => void) | undefined;
    let previewDocument: Document | null = null;
    let frameKeyHandler: ((event: KeyboardEvent) => void) | undefined;

    const onLoad = () => {
      previewDocument?.removeEventListener("pointerdown", onFramePointer, true);

      if (frameKeyHandler) previewDocument?.removeEventListener("keydown", frameKeyHandler, true);

      try {
        removeGuard?.();
      } catch {
        // The page may have navigated cross-origin since the previous load.
      }

      removeGuard = undefined;

      try {
        const contentDocument = frame.contentDocument;
        const contentWindow = frame.contentWindow;

        if (!contentDocument?.documentElement || !contentWindow
          || contentWindow.location.origin !== ownerWindow.location.origin
          || contentWindow.location.href === "about:blank") {
          throw new Error("The preview document is inaccessible.");
        }

        removeGuard = installPreviewGuard(contentWindow);
        previewDocument = contentDocument;
        contentDocument.addEventListener("pointerdown", onFramePointer, true);
        frameKeyHandler = (event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          const key = event.key.toLowerCase();

          if (key === "escape") {
            event.preventDefault();
            event.stopImmediatePropagation();
            props.onClose();

            return;
          }

          if (key !== "b" || !props.shortcutsEnabled) return;

          if (isEditableKeyboardEvent(event, contentWindow)) return;
          event.preventDefault();
          event.stopImmediatePropagation();

          if (event.repeat) return;

          props.onClose();
        };

        contentDocument.addEventListener("keydown", frameKeyHandler, true);
        status.style.display = "none";
      } catch {
        status.textContent = "This page cannot be previewed in a same-origin frame.";
        status.dataset.mesurerResponsiveRefused = "true";
        status.style.display = "block";
      }
    };

    const onError = () => {
      status.textContent = "This page cannot be previewed in a same-origin frame.";
      status.dataset.mesurerResponsiveRefused = "true";
      status.style.display = "block";
    };

    const onFramePointer = () => props.onFramePointerDown();
    frame.addEventListener("load", onLoad);
    frame.addEventListener("error", onError);
    frame.addEventListener("pointerdown", onFramePointer);
    frameShell.append(frame);
    card.append(headerSlot, frameShell);
    stage.append(card, status);
    host.append(stage);

    const fit = () => {
      const availableWidth = ownerWindow.innerWidth - 64;
      const availableHeight = ownerWindow.innerHeight - 72 - 40 - HEADER_HEIGHT;
      const scale = Math.min(1, availableWidth / WIDTH, availableHeight / HEIGHT);
      card.style.width = `${WIDTH * scale}px`;
      card.style.height = `${(HEIGHT + HEADER_HEIGHT) * scale}px`;
      headerSlot.style.width = `${WIDTH * scale}px`;
      headerSlot.style.height = `${HEADER_HEIGHT * scale}px`;
      header.style.width = `${WIDTH}px`;
      header.style.height = `${HEADER_HEIGHT}px`;
      header.style.transform = `scale(${scale})`;
      header.style.transformOrigin = "top left";
      frameShell.style.width = `${WIDTH * scale}px`;
      frameShell.style.height = `${HEIGHT * scale}px`;
      frame.style.transform = `scale(${scale})`;
    };

    fit();
    ownerWindow.addEventListener("resize", fit);
    const previousOverflow = ownerDocument.documentElement.style.getPropertyValue("overflow");
    const previousOverflowPriority = ownerDocument.documentElement.style.getPropertyPriority("overflow");
    const overflowX = ownerDocument.documentElement.style.getPropertyValue("overflow-x");
    const overflowXPriority = ownerDocument.documentElement.style.getPropertyPriority("overflow-x");
    const overflowY = ownerDocument.documentElement.style.getPropertyValue("overflow-y");
    const overflowYPriority = ownerDocument.documentElement.style.getPropertyPriority("overflow-y");
    ownerDocument.documentElement.style.setProperty("overflow", "hidden", "important");

    return () => {
      ownerWindow.removeEventListener("resize", fit);
      frame.removeEventListener("load", onLoad);
      frame.removeEventListener("error", onError);
      frame.removeEventListener("pointerdown", onFramePointer);
      previewDocument?.removeEventListener("pointerdown", onFramePointer, true);

      if (frameKeyHandler) previewDocument?.removeEventListener("keydown", frameKeyHandler, true);

      try {
        removeGuard?.();
      } catch {
        // The preview may have navigated cross-origin before it was closed.
      }

      frame.remove();
      stage.remove();

      if (
        ownerDocument.documentElement.style.getPropertyValue("overflow") === "hidden"
        && ownerDocument.documentElement.style.getPropertyPriority("overflow") === "important"
      ) {
        if (previousOverflow) ownerDocument.documentElement.style.setProperty("overflow", previousOverflow, previousOverflowPriority);
        else ownerDocument.documentElement.style.removeProperty("overflow");
      }

      if (
        ownerDocument.documentElement.style.getPropertyValue("overflow-x") === overflowX
        && ownerDocument.documentElement.style.getPropertyPriority("overflow-x") === overflowXPriority
      ) {
        if (overflowX) ownerDocument.documentElement.style.setProperty("overflow-x", overflowX, overflowXPriority);
        else ownerDocument.documentElement.style.removeProperty("overflow-x");
      }

      if (
        ownerDocument.documentElement.style.getPropertyValue("overflow-y") === overflowY
        && ownerDocument.documentElement.style.getPropertyPriority("overflow-y") === overflowYPriority
      ) {
        if (overflowY) ownerDocument.documentElement.style.setProperty("overflow-y", overflowY, overflowYPriority);
        else ownerDocument.documentElement.style.removeProperty("overflow-y");
      }
    };
  });

  return null;
}