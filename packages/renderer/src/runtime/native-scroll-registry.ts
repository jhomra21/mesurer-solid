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
