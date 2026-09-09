import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MESURER_STYLES } from "../styles.generated";
import { ensureMesurerStyles } from "./style-inject";

type InlineDisplay = {
  value: string;
  priority: string;
};

type RootPlacement = {
  root: HTMLElement;
  marker: Comment | null;
  proxy: HTMLElement | null;
  parent: Node | null;
  mirroredDisplay: InlineDisplay | null;
};

type DocumentRuntime = {
  runtime: MesurerSolidRuntimeService;
  isolated: boolean;
};

type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CachedTarget = RectLike & {
  element: HTMLElement;
};

type CachedToolbar = RectLike & {
  element: HTMLElement;
};

const TOOLBAR_TARGET_GAP = 6;
const VIEWPORT_PADDING = 8;
const SCROLL_IDLE_MS = 80;

const isDocumentBackedShadow = (
  runtime: MesurerSolidRuntimeService,
  realm: Window & typeof globalThis,
) => runtime.portalTarget instanceof realm.ShadowRoot
  && !(runtime.pageTarget instanceof realm.ShadowRoot)
  && runtime.pageTarget.getRootNode() === runtime.ownerDocument;

const intersects = (left: RectLike, right: RectLike, gap = 0) => !(
  left.left + left.width + gap <= right.left
  || right.left + right.width + gap <= left.left
  || left.top + left.height + gap <= right.top
  || right.top + right.height + gap <= left.top
);

const captureDisplay = (element: HTMLElement): InlineDisplay => ({
  value: element.style.getPropertyValue("display"),
  priority: element.style.getPropertyPriority("display"),
});

const restoreDisplay = (element: HTMLElement, display: InlineDisplay) => {
  if (display.value || display.priority) {
    element.style.setProperty("display", display.value, display.priority);
  } else {
    element.style.removeProperty("display");
  }
};

/**
 * Direct text editing is transient UI, but its geometry needs to participate in
 * the same document positioning tree as the page it follows. In an isolated
 * public mount, keep the main toolbar inside its ShadowRoot while giving the
 * text-edit runtime a document-backed inspector mount. The existing native
 * anchor coordinator can then own ring/highlight/Typography movement without a
 * fixed ShadowRoot surface chasing compositor scroll from JavaScript.
 */
export function createDocumentTextRuntime(
  runtime: MesurerSolidRuntimeService,
): DocumentRuntime {
  const { ownerDocument, ownerWindow } = runtime;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument and portalTarget, so its DOM constructors match this runtime.
  const realm = ownerWindow as Window & typeof globalThis;
  if (!ownerDocument.body || !isDocumentBackedShadow(runtime, realm)) {
    return { runtime, isolated: false };
  }

  // The public isolated mount normally keeps renderer CSS inside its ShadowRoot.
  // Text-edit surfaces moved into the document use the same generated, namespaced
  // stylesheet so their appearance remains identical to the isolated toolbar.
  ensureMesurerStyles(MESURER_STYLES, ownerDocument.body);

  const createInspectorMount = () => {
    const element = ownerDocument.createElement("div");
    element.dataset.mesurerInspectorUi = "true";
    element.dataset.mesurerIsolatedDocumentRuntime = "true";
    ownerDocument.body.append(element);
    let disposed = false;
    return {
      element,
      dispose() {
        if (disposed) return;
        disposed = true;
        element.remove();
      },
    };
  };

  return {
    isolated: true,
    runtime: {
      ...runtime,
      portalTarget: ownerDocument.body,
      createInspectorMount,
    },
  };
}

/**
 * Selected MeasurementBox roots are Solid-owned by the isolated renderer. Move
 * each complete root, never its children, into the document layer while it is
 * selected. This preserves Solid ownership/reconciliation and lets the normal
 * document scroll-anchor coordinator claim the chrome and label as a unit.
 *
 * A non-rendering marker stays in the original renderer tree. Capture plugins
 * can therefore keep using their normal measurement-discovery path; when that
 * source presentation is hidden, the document-layer root mirrors the same
 * visibility for the capture frame.
 */
export function installIsolatedSelectionPortal(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument and portalTarget, so its DOM constructors match this runtime.
  const realm = ownerWindow as Window & typeof globalThis;
  if (!ownerDocument.body || !isDocumentBackedShadow(runtime, realm)) return;

  ensureMesurerStyles(MESURER_STYLES, ownerDocument.body);
  const workspace = runtime.createWorkspaceRuntime();
  const placements = new Map<HTMLElement, RootPlacement>();
  let disposed = false;
  let queued = false;
  let lastSelection: HTMLElement[] = [];

  const moveRoot = (root: HTMLElement) => {
    if (placements.has(root) || root.dataset.mesurerSelectionGroup === "true") return;
    const parent = root.parentNode;
    const marker = parent ? ownerDocument.createComment("mesurer-isolated-selection-portal") : null;
    const proxy = parent ? ownerDocument.createElement("span") : null;
    if (marker && parent) parent.insertBefore(marker, root);
    if (proxy && parent) {
      proxy.dataset.mesurerMeasurement = "true";
      proxy.dataset.mesurerIsolatedSelectionProxy = "true";
      proxy.setAttribute("aria-hidden", "true");
      proxy.style.display = "none";
      parent.insertBefore(proxy, root);
    }
    placements.set(root, { root, marker, proxy, parent, mirroredDisplay: null });
    root.dataset.mesurerIsolatedDocumentLayer = "true";
    ownerDocument.body.append(root);
  };

  const sourcePresentationHidden = (placement: RootPlacement) => {
    let current = placement.proxy?.parentElement ?? null;
    while (current) {
      if (current.style.getPropertyValue("display") === "none") return true;
      current = current.parentElement;
    }
    return false;
  };

  const syncSourceVisibility = (placement: RootPlacement) => {
    const hidden = sourcePresentationHidden(placement);
    if (hidden && placement.mirroredDisplay === null) {
      placement.mirroredDisplay = captureDisplay(placement.root);
      placement.root.style.setProperty("display", "none", "important");
      return;
    }
    if (!hidden && placement.mirroredDisplay !== null) {
      restoreDisplay(placement.root, placement.mirroredDisplay);
      placement.mirroredDisplay = null;
    }
  };

  const releaseRoot = (placement: RootPlacement, restore: boolean) => {
    const { root, marker, proxy, parent } = placement;
    if (placement.mirroredDisplay !== null) {
      restoreDisplay(root, placement.mirroredDisplay);
      placement.mirroredDisplay = null;
    }
    delete root.dataset.mesurerIsolatedDocumentLayer;
    if (restore && root.isConnected && marker?.parentNode === parent && parent) {
      parent.insertBefore(root, marker);
    }
    proxy?.remove();
    marker?.remove();
    placements.delete(root);
  };

  const stabilize = () => {
    if (disposed) return;
    for (const root of portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-selected-measurement='true']")) {
      moveRoot(root);
    }

    const selectedElements = workspace.currentSelection().elements;
    lastSelection = selectedElements;
    for (const placement of Array.from(placements.values())) {
      const { root } = placement;
      if (!root.isConnected) {
        releaseRoot(placement, false);
        continue;
      }
      syncSourceVisibility(placement);
      // Solid removes selection roots when their measurement leaves the model.
      // The only explicit release needed here is the empty-selection case. Do
      // not compare page/root DOMRects on workspace notifications; that turns
      // compositor scrolling back into forced main-thread layout work.
      if (selectedElements.length === 0) releaseRoot(placement, true);
    }
  };

  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    ownerWindow.queueMicrotask(() => {
      queued = false;
      stabilize();
    });
  };

  const observer = new realm.MutationObserver(schedule);
  observer.observe(portalTarget, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style"],
  });
  const unsubscribeWorkspace = workspace.subscribe(() => {
    const next = workspace.currentSelection().elements;
    const changed = next.length !== lastSelection.length
      || next.some((element, index) => element !== lastSelection[index]);
    if (changed) schedule();
  });
  ownerWindow.addEventListener("pointerup", schedule, true);
  ownerWindow.addEventListener("dblclick", schedule, true);
  ownerWindow.addEventListener("resize", schedule, true);
  schedule();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    unsubscribeWorkspace();
    ownerWindow.removeEventListener("pointerup", schedule, true);
    ownerWindow.removeEventListener("dblclick", schedule, true);
    ownerWindow.removeEventListener("resize", schedule, true);
    for (const placement of Array.from(placements.values())) releaseRoot(placement, true);
    workspace.dispose();
  });
}

/**
 * The canonical toolbar is viewport UI, so it should not chase the selected
 * element. Its collision response is computed from cached document geometry:
 * scroll events do arithmetic plus a compositor `translate` write only. DOM
 * geometry is sampled when selection/layout changes and once after scrolling
 * settles, never in the hot trackpad path.
 */
export function installToolbarTargetAvoidance(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerWindow, portalTarget } = runtime;
  const workspace = runtime.createWorkspaceRuntime();
  let disposed = false;
  let captureQueued = false;
  let scrolling = false;
  let scrollIdleTimer = 0;
  let target: CachedTarget | null = null;
  let toolbar: CachedToolbar | null = null;

  const clearAvoidance = (element: HTMLElement) => {
    element.style.removeProperty("translate");
    delete element.dataset.mesurerToolbarAvoidingTarget;
    delete element.dataset.mesurerToolbarAvoidX;
    delete element.dataset.mesurerToolbarAvoidY;
  };

  const applyCached = () => {
    if (disposed || !toolbar?.element.isConnected || !target?.element.isConnected) return;
    const base = toolbar;
    const targetBox: RectLike = {
      left: target.left - ownerWindow.scrollX,
      top: target.top - ownerWindow.scrollY,
      width: target.width,
      height: target.height,
    };

    if (!intersects(base, targetBox, TOOLBAR_TARGET_GAP)) {
      clearAvoidance(base.element);
      return;
    }

    const maxLeft = Math.max(VIEWPORT_PADDING, ownerWindow.innerWidth - base.width - VIEWPORT_PADDING);
    const maxTop = Math.max(VIEWPORT_PADDING, ownerWindow.innerHeight - base.height - VIEWPORT_PADDING);
    const left = Math.min(maxLeft, Math.max(VIEWPORT_PADDING, base.left));
    const targetCenterY = targetBox.top + targetBox.height / 2;
    const verticalCandidates = targetCenterY < ownerWindow.innerHeight / 2
      ? [maxTop, VIEWPORT_PADDING]
      : [VIEWPORT_PADDING, maxTop];
    const horizontalCandidates = [
      Math.min(maxLeft, Math.max(VIEWPORT_PADDING, targetBox.left - base.width - TOOLBAR_TARGET_GAP)),
      Math.min(maxLeft, Math.max(VIEWPORT_PADDING, targetBox.left + targetBox.width + TOOLBAR_TARGET_GAP)),
    ];

    const candidates: RectLike[] = [
      ...verticalCandidates.map((top) => ({ left, top, width: base.width, height: base.height })),
      ...horizontalCandidates.map((candidateLeft) => ({
        left: candidateLeft,
        top: Math.min(maxTop, Math.max(VIEWPORT_PADDING, base.top)),
        width: base.width,
        height: base.height,
      })),
    ];
    const next = candidates.find((candidate) => !intersects(candidate, targetBox, TOOLBAR_TARGET_GAP));
    if (!next) return;

    const offsetX = next.left - base.left;
    const offsetY = next.top - base.top;
    base.element.style.setProperty("translate", `${offsetX}px ${offsetY}px`, "important");
    base.element.dataset.mesurerToolbarAvoidingTarget = "true";
    base.element.dataset.mesurerToolbarAvoidX = String(offsetX);
    base.element.dataset.mesurerToolbarAvoidY = String(offsetY);
  };

  const capture = () => {
    captureQueued = false;
    if (disposed) return;
    const nextToolbar = portalTarget.querySelector<HTMLElement>("[data-mesurer-toolbar='true']");
    const nextTarget = workspace.currentSelection().elements.at(-1) ?? null;
    if (!nextToolbar?.isConnected || !nextTarget?.isConnected) {
      if (toolbar?.element.isConnected) clearAvoidance(toolbar.element);
      toolbar = null;
      target = null;
      return;
    }

    const rendered = nextToolbar.getBoundingClientRect();
    const priorX = Number(nextToolbar.dataset.mesurerToolbarAvoidX ?? 0);
    const priorY = Number(nextToolbar.dataset.mesurerToolbarAvoidY ?? 0);
    toolbar = {
      element: nextToolbar,
      left: rendered.left - priorX,
      top: rendered.top - priorY,
      width: rendered.width,
      height: rendered.height,
    };

    const targetRect = nextTarget.getBoundingClientRect();
    target = {
      element: nextTarget,
      left: targetRect.left + ownerWindow.scrollX,
      top: targetRect.top + ownerWindow.scrollY,
      width: targetRect.width,
      height: targetRect.height,
    };
    applyCached();
  };

  const scheduleCapture = () => {
    if (disposed || captureQueued) return;
    captureQueued = true;
    ownerWindow.queueMicrotask(capture);
  };

  const unsubscribeWorkspace = workspace.subscribe(() => {
    const nextTarget = workspace.currentSelection().elements.at(-1) ?? null;
    if (nextTarget !== target?.element || !scrolling) scheduleCapture();
  });
  const onScroll = () => {
    scrolling = true;
    applyCached();
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = ownerWindow.setTimeout(() => {
      scrollIdleTimer = 0;
      scrolling = false;
      scheduleCapture();
    }, SCROLL_IDLE_MS);
  };
  const onResize = () => scheduleCapture();
  const onPointerUp = () => scheduleCapture();

  ownerWindow.addEventListener("scroll", onScroll, true);
  ownerWindow.addEventListener("resize", onResize, true);
  ownerWindow.addEventListener("pointerup", onPointerUp, true);
  scheduleCapture();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    unsubscribeWorkspace();
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    ownerWindow.removeEventListener("scroll", onScroll, true);
    ownerWindow.removeEventListener("resize", onResize, true);
    ownerWindow.removeEventListener("pointerup", onPointerUp, true);
    if (toolbar?.element.isConnected) clearAvoidance(toolbar.element);
    workspace.dispose();
  });
}
