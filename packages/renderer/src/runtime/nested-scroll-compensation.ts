export type MesurerNestedScrollCompensation = {
  sync(): void;
  rebase(): void;
  release(): void;
};

type ScrollPosition = {
  left: number;
  top: number;
};

type CompensationOptions = {
  trackWindow?: boolean;
};

const X_VARIABLE = "--mesurer-nested-scroll-x";
const Y_VARIABLE = "--mesurer-nested-scroll-y";

/**
 * Compensate a page-following surface that has been portaled outside one or
 * more of the selected target's scroll ancestors.
 *
 * Capture the target's composed ancestor chain once. The scroll hot path never
 * scans the DOM or reads layout geometry: it performs one cached source lookup,
 * two scalar deltas, and CSS-variable writes only when those deltas change.
 * Cached element sources are observed directly so non-composed ShadowRoot
 * scroll events do not need to escape their tree.
 *
 * Native CSS anchors already follow window/document scrolling, so their helper
 * leaves `trackWindow` false and contributes only nested-element deltas. A
 * surface that cannot share the target's anchor tree sets `trackWindow` true
 * and uses the same scalar-delta mechanism for window scrolling as well.
 * `rebase()` is used only when a fresh absolute fallback position has already
 * been sampled, preventing accumulated deltas from being applied twice.
 */
export const installNestedScrollCompensation = (
  ownerWindow: Window,
  target: HTMLElement,
  surfaces: () => Iterable<HTMLElement | null | undefined>,
  options: CompensationOptions = {},
): MesurerNestedScrollCompensation => {
  // SAFETY: ownerWindow is the browsing-context global for target.ownerDocument.
  const realm = ownerWindow as Window & typeof globalThis;
  const positions = new Map<HTMLElement, ScrollPosition>();
  const ownerDocument = target.ownerDocument;
  const trackWindow = options.trackWindow === true;

  const composedParent = (element: HTMLElement): HTMLElement | null => {
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof realm.ShadowRoot && root.host instanceof realm.HTMLElement
      ? root.host
      : null;
  };

  let ancestor = composedParent(target);
  while (ancestor) {
    if (ancestor !== ownerDocument.body && ancestor !== ownerDocument.documentElement) {
      positions.set(ancestor, {
        left: ancestor.scrollLeft,
        top: ancestor.scrollTop,
      });
    }
    ancestor = composedParent(ancestor);
  }

  let windowPosition: ScrollPosition = {
    left: ownerWindow.scrollX,
    top: ownerWindow.scrollY,
  };
  let offsetX = 0;
  let offsetY = 0;
  let disposed = false;

  const currentSurfaces = () => {
    const values = new Set<HTMLElement>();
    for (const surface of surfaces()) {
      if (surface?.isConnected) values.add(surface);
    }
    return values;
  };

  const sync = () => {
    if (disposed) return;
    const x = `${offsetX}px`;
    const y = `${offsetY}px`;
    for (const surface of currentSurfaces()) {
      if (surface.dataset.mesurerNestedScrollCompensation !== "true") {
        surface.dataset.mesurerNestedScrollCompensation = "true";
      }
      if (surface.style.getPropertyValue(X_VARIABLE) !== x) {
        surface.style.setProperty(X_VARIABLE, x);
      }
      if (surface.style.getPropertyValue(Y_VARIABLE) !== y) {
        surface.style.setProperty(Y_VARIABLE, y);
      }
    }
  };

  const applyDelta = (previous: ScrollPosition, left: number, top: number) => {
    const deltaX = left - previous.left;
    const deltaY = top - previous.top;
    if (deltaX === 0 && deltaY === 0) return false;
    previous.left = left;
    previous.top = top;
    offsetX -= deltaX;
    offsetY -= deltaY;
    return true;
  };

  const onElementScroll = (event: Event) => {
    if (disposed || !(event.currentTarget instanceof realm.HTMLElement)) return;
    const element = event.currentTarget;
    const previous = positions.get(element);
    if (!previous || !applyDelta(previous, element.scrollLeft, element.scrollTop)) return;
    sync();
  };

  const onWindowScroll = () => {
    if (
      disposed
      || !trackWindow
      || !applyDelta(windowPosition, ownerWindow.scrollX, ownerWindow.scrollY)
    ) return;
    sync();
  };

  for (const element of positions.keys()) {
    element.addEventListener("scroll", onElementScroll, { passive: true });
  }
  if (trackWindow) ownerWindow.addEventListener("scroll", onWindowScroll, { passive: true });
  sync();

  return {
    sync,
    rebase() {
      if (disposed) return;
      for (const [element, position] of positions) {
        position.left = element.scrollLeft;
        position.top = element.scrollTop;
      }
      windowPosition = {
        left: ownerWindow.scrollX,
        top: ownerWindow.scrollY,
      };
      offsetX = 0;
      offsetY = 0;
      sync();
    },
    release() {
      if (disposed) return;
      disposed = true;
      if (trackWindow) ownerWindow.removeEventListener("scroll", onWindowScroll);
      for (const element of positions.keys()) {
        element.removeEventListener("scroll", onElementScroll);
      }
      for (const surface of currentSurfaces()) {
        delete surface.dataset.mesurerNestedScrollCompensation;
        surface.style.removeProperty(X_VARIABLE);
        surface.style.removeProperty(Y_VARIABLE);
      }
      positions.clear();
    },
  };
};
