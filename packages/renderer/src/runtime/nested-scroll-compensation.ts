export type MesurerNestedScrollCompensation = {
  sync(): void;
  release(): void;
};

type ScrollPosition = {
  left: number;
  top: number;
};

const X_VARIABLE = "--mesurer-nested-scroll-x";
const Y_VARIABLE = "--mesurer-nested-scroll-y";

/**
 * Compensate document-portaled anchor surfaces for element scrolling.
 *
 * Absolute CSS anchor positioning already follows viewport/document scrolling,
 * but a surface portaled outside an overflow ancestor does not inherit that
 * ancestor's scroll translation. Capture only the selected target's ancestor
 * chain once, then update an accumulated delta from scrollLeft/scrollTop.
 *
 * There are no geometry reads in the scroll path. Each scroll event is O(1):
 * one ancestor-map lookup, two scalar deltas, and a bounded number of surface
 * custom-property writes. Window/document scrolling is intentionally ignored
 * because the native absolute-anchor path already handles it.
 */
export const installNestedScrollCompensation = (
  ownerWindow: Window,
  target: HTMLElement,
  surfaces: () => Iterable<HTMLElement | null | undefined>,
): MesurerNestedScrollCompensation => {
  // SAFETY: ownerWindow is the browsing-context global for target.ownerDocument.
  const realm = ownerWindow as Window & typeof globalThis;
  const positions = new Map<HTMLElement, ScrollPosition>();
  let ancestor = target.parentElement;
  while (ancestor) {
    positions.set(ancestor, {
      left: ancestor.scrollLeft,
      top: ancestor.scrollTop,
    });
    ancestor = ancestor.parentElement;
  }

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

  const onScroll = (event: Event) => {
    if (disposed || !(event.target instanceof realm.HTMLElement)) return;
    const previous = positions.get(event.target);
    if (!previous) return;

    const left = event.target.scrollLeft;
    const top = event.target.scrollTop;
    const deltaX = left - previous.left;
    const deltaY = top - previous.top;
    if (deltaX === 0 && deltaY === 0) return;

    previous.left = left;
    previous.top = top;
    offsetX -= deltaX;
    offsetY -= deltaY;
    sync();
  };

  ownerWindow.addEventListener("scroll", onScroll, true);
  sync();

  return {
    sync,
    release() {
      if (disposed) return;
      disposed = true;
      ownerWindow.removeEventListener("scroll", onScroll, true);
      for (const surface of currentSurfaces()) {
        delete surface.dataset.mesurerNestedScrollCompensation;
        surface.style.removeProperty(X_VARIABLE);
        surface.style.removeProperty(Y_VARIABLE);
      }
      positions.clear();
    },
  };
};
