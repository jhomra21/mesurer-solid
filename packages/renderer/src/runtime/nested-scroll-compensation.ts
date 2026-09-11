export type MesurerNestedScrollCompensation = {
  sync(): void;
  rebase(): void;
  release(): void;
};

type ScrollPosition = {
  left: number;
  top: number;
};

const X_VARIABLE = "--mesurer-nested-scroll-x";
const Y_VARIABLE = "--mesurer-nested-scroll-y";

/**
 * Compensate a page-following surface that cannot share the selected target's
 * CSS anchor tree (for example, a document-backed Mesurer surface following a
 * target inside a descendant ShadowRoot).
 *
 * Capture the target's composed ancestor chain once. The scroll hot path never
 * scans the DOM or reads layout geometry: it performs one cached source lookup,
 * two scalar deltas, and CSS-variable writes. Cached element sources are
 * observed directly so non-composed ShadowRoot scroll events do not need to
 * escape their tree. Window scrolling uses the same delta model. `rebase()` is
 * used when a settled layout resample has supplied fresh base coordinates so
 * accumulated deltas are not applied twice.
 */
export const installNestedScrollCompensation = (
  ownerWindow: Window,
  target: HTMLElement,
  surfaces: () => Iterable<HTMLElement | null | undefined>,
): MesurerNestedScrollCompensation => {
  // SAFETY: ownerWindow is the browsing-context global for target.ownerDocument.
  const realm = ownerWindow as Window & typeof globalThis;
  const positions = new Map<HTMLElement, ScrollPosition>();
  const ownerDocument = target.ownerDocument;

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
    for (const surface of currentSurfaces()) {
      surface.dataset.mesurerNestedScrollCompensation = "true";
      surface.style.setProperty(X_VARIABLE, `${offsetX}px`);
      surface.style.setProperty(Y_VARIABLE, `${offsetY}px`);
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
    if (disposed || !applyDelta(windowPosition, ownerWindow.scrollX, ownerWindow.scrollY)) return;
    sync();
  };

  for (const element of positions.keys()) {
    element.addEventListener("scroll", onElementScroll, { passive: true });
  }
  ownerWindow.addEventListener("scroll", onWindowScroll, { passive: true });
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
      ownerWindow.removeEventListener("scroll", onWindowScroll);
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