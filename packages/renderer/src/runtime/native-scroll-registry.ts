const nativeScrollAnchoringCounts = new WeakMap<Document, number>();

/**
 * Track document-native scroll anchoring without making scroll handlers scan
 * the document for the coordinator's style element.
 */
export const registerNativeScrollAnchoring = (ownerDocument: Document) => {
  nativeScrollAnchoringCounts.set(
    ownerDocument,
    (nativeScrollAnchoringCounts.get(ownerDocument) ?? 0) + 1,
  );
  let released = false;

  return () => {
    if (released) return;
    released = true;
    const next = (nativeScrollAnchoringCounts.get(ownerDocument) ?? 1) - 1;

    if (next > 0) nativeScrollAnchoringCounts.set(ownerDocument, next);
    else nativeScrollAnchoringCounts.delete(ownerDocument);
  };
};

export const hasNativeScrollAnchoring = (ownerDocument: Document) =>
  (nativeScrollAnchoringCounts.get(ownerDocument) ?? 0) > 0;

const selectionAnchorListeners = new WeakMap<Document, Set<() => void>>();

/** Selection anchor names are minted per binding, so anything keyed to one
 * (such as Edit's source-owned stroke) must follow a rebind in the same task
 * instead of waiting for its own frame-based refresh. */
export const onSelectionAnchorsChanged = (ownerDocument: Document, listener: () => void) => {
  const listeners = selectionAnchorListeners.get(ownerDocument) ?? new Set<() => void>();

  listeners.add(listener);
  selectionAnchorListeners.set(ownerDocument, listeners);

  return () => {
    listeners.delete(listener);
  };
};

export const notifySelectionAnchorsChanged = (ownerDocument: Document) => {
  for (const listener of Array.from(selectionAnchorListeners.get(ownerDocument) ?? [])) listener();
};

/** Link a portaled selection border to its actual element; DOMRect matching is
 * ambiguous when the border uses document coordinates during a scroll. */
const selectionChromeTargets = new WeakMap<HTMLElement, Element>();

export const registerSelectionChromeTarget = (chrome: HTMLElement, target: Element) => {
  selectionChromeTargets.set(chrome, target);

  return () => {
    if (selectionChromeTargets.get(chrome) === target) selectionChromeTargets.delete(chrome);
  };
};

export const getSelectionChromeTarget = (chrome: HTMLElement): Element | undefined =>
  selectionChromeTargets.get(chrome);
