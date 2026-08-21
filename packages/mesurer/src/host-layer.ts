export type MesurerHostLayerMode = "top-layer" | "fixed";

type PopoverHost = HTMLDivElement & {
  popover: string | null;
  showPopover(): void;
  hidePopover(): void;
};

const HOST_STYLES: Record<string, string> = {
  display: "block",
  position: "fixed",
  inset: "0",
  width: "100vw",
  height: "100vh",
  "min-width": "0",
  "min-height": "0",
  "max-width": "none",
  "max-height": "none",
  margin: "0",
  padding: "0",
  border: "0",
  overflow: "visible",
  background: "transparent",
  "box-sizing": "border-box",
  "pointer-events": "none",
  "z-index": "2147483647",
  opacity: "1",
  visibility: "visible",
  transform: "none",
  translate: "none",
  rotate: "none",
  scale: "none",
  filter: "none",
  "backdrop-filter": "none",
  "clip-path": "none",
  mask: "none",
  contain: "none",
  isolation: "isolate",
  "mix-blend-mode": "normal",
  animation: "none",
  transition: "none",
  "color-scheme": "light",
  color: "#0f172a",
  "font-family": "ui-sans-serif, system-ui, sans-serif",
  "font-size": "16px",
  "font-weight": "400",
  "line-height": "1.5",
  "letter-spacing": "normal",
  direction: "ltr",
};

function hardenHost(container: HTMLDivElement) {
  for (const [property, value] of Object.entries(HOST_STYLES)) {
    container.style.setProperty(property, value, "important");
  }
}

function supportsPopover(container: HTMLDivElement): container is PopoverHost {
  return "popover" in container
    && typeof (container as Partial<PopoverHost>).showPopover === "function"
    && typeof (container as Partial<PopoverHost>).hidePopover === "function";
}

const isDialog = (element: Element): element is HTMLDialogElement => element.localName === "dialog";

function isModalDialog(element: Element): element is HTMLDialogElement {
  if (!isDialog(element) || !element.open) return false;
  try {
    return element.matches(":modal");
  } catch {
    return false;
  }
}

export type MesurerHostLayer = {
  mode: MesurerHostLayerMode;
  bringToFront(): void;
  dispose(): void;
};

/**
 * Mount Mesurer's outer host using browser top-layer primitives when available.
 *
 * Shadow DOM isolates Mesurer's internals from host CSS, but it does not by
 * itself protect the shadow host from page stacking contexts, clipping, or
 * author styles. A manual popover escapes ordinary document stacking and
 * ancestor clipping. The fixed/max-z-index host is the compatibility fallback.
 *
 * Modal dialogs are special: the platform makes every node outside the active
 * modal inert. When an observable modal opens, Mesurer temporarily reparents
 * its host into that dialog so the toolbar stays interactive, then restores the
 * original parent when the modal closes.
 */
export function mountMesurerHost(
  container: HTMLDivElement,
  target: HTMLElement | ShadowRoot,
  preferTopLayer = true,
): MesurerHostLayer {
  hardenHost(container);

  const ownerDocument = container.ownerDocument;
  const ownerWindow = ownerDocument.defaultView ?? window;
  const originalTarget = target;
  let disposed = false;
  let mode: MesurerHostLayerMode = "fixed";
  let topLayer = false;
  let reassertFrame = 0;
  let modalStack: HTMLDialogElement[] = [];

  if (preferTopLayer && supportsPopover(container)) {
    container.popover = "manual";
  }

  target.append(container);

  if (preferTopLayer && supportsPopover(container)) {
    try {
      container.showPopover();
      topLayer = container.matches(":popover-open");
      if (topLayer) mode = "top-layer";
    } catch {
      container.removeAttribute("popover");
    }
  }

  const showTopLayer = () => {
    if (!topLayer || !supportsPopover(container)) return;
    try {
      if (!container.matches(":popover-open")) container.showPopover();
    } catch {
      // The fixed host remains a usable fallback if the browser temporarily
      // rejects a top-layer transition.
    }
  };

  const moveHost = (parent: HTMLElement | ShadowRoot) => {
    if (container.parentNode === parent) return;
    const wasOpen = topLayer && supportsPopover(container) && container.matches(":popover-open");
    if (wasOpen && supportsPopover(container)) {
      try {
        container.hidePopover();
      } catch {
        // Continue with the DOM move; showTopLayer() below is best effort.
      }
    }
    parent.append(container);
    hardenHost(container);
    if (wasOpen) showTopLayer();
  };

  const syncModalParent = () => {
    modalStack = modalStack.filter((dialog) => dialog.isConnected && isModalDialog(dialog));
    moveHost(modalStack.at(-1) ?? originalTarget);
  };

  const activateModal = (dialog: HTMLDialogElement) => {
    modalStack = modalStack.filter((candidate) => candidate !== dialog);
    modalStack.push(dialog);
    syncModalParent();
  };

  const deactivateModal = (dialog: HTMLDialogElement) => {
    modalStack = modalStack.filter((candidate) => candidate !== dialog);
    syncModalParent();
  };

  const bringToFront = () => {
    if (disposed || !topLayer || !supportsPopover(container)) return;
    try {
      if (container.matches(":popover-open")) container.hidePopover();
      container.showPopover();
    } catch {
      // If a browser temporarily refuses a top-layer transition, the hardened
      // fixed host remains mounted and can be reasserted on the next event.
    }
  };

  const scheduleBringToFront = () => {
    if (disposed || !topLayer || reassertFrame) return;
    reassertFrame = ownerWindow.requestAnimationFrame(() => {
      reassertFrame = 0;
      bringToFront();
    });
  };

  const handleToggle = (event: Event) => {
    if (!topLayer || event.target === container) return;
    const toggle = event as Event & { newState?: string };
    const element = event.target;
    if (!(element instanceof ownerWindow.Element)) return;

    if (isDialog(element)) {
      if (toggle.newState === "open" && isModalDialog(element)) {
        activateModal(element);
        scheduleBringToFront();
      } else if (toggle.newState === "closed") {
        deactivateModal(element);
      } else if (toggle.newState === "open") {
        scheduleBringToFront();
      }
      return;
    }

    if (toggle.newState === "open" && element.hasAttribute("popover")) {
      scheduleBringToFront();
    }
  };

  const handleClose = (event: Event) => {
    const element = event.target;
    if (element instanceof ownerWindow.Element && isDialog(element)) deactivateModal(element);
  };

  const handleFullscreenChange = () => {
    if (ownerDocument.fullscreenElement) scheduleBringToFront();
  };

  const scanForModals = (root: Element) => {
    if (isModalDialog(root)) activateModal(root);
    for (const dialog of root.querySelectorAll("dialog")) {
      if (isModalDialog(dialog)) activateModal(dialog);
    }
  };

  const observer = new ownerWindow.MutationObserver((records) => {
    if (!topLayer) return;
    for (const record of records) {
      if (record.type === "attributes") {
        const element = record.target;
        if (element instanceof ownerWindow.Element && isDialog(element)) {
          if (isModalDialog(element)) activateModal(element);
          else deactivateModal(element);
        }
      }
      for (const node of record.addedNodes) {
        if (node instanceof ownerWindow.Element) scanForModals(node);
      }
      if (modalStack.some((dialog) => !dialog.isConnected)) syncModalParent();
    }
  });

  if (topLayer) {
    ownerDocument.addEventListener("toggle", handleToggle, true);
    ownerDocument.addEventListener("close", handleClose, true);
    ownerDocument.addEventListener("fullscreenchange", handleFullscreenChange, true);
    observer.observe(ownerDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    scanForModals(ownerDocument.documentElement);
  }

  return {
    mode,
    bringToFront,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (reassertFrame) ownerWindow.cancelAnimationFrame(reassertFrame);
      ownerDocument.removeEventListener("toggle", handleToggle, true);
      ownerDocument.removeEventListener("close", handleClose, true);
      ownerDocument.removeEventListener("fullscreenchange", handleFullscreenChange, true);
      observer.disconnect();
      if (topLayer && supportsPopover(container) && container.matches(":popover-open")) {
        try {
          container.hidePopover();
        } catch {
          // Removing the host below also removes it from the top layer.
        }
      }
      modalStack = [];
    },
  };
}
