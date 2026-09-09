const activeDocuments = new WeakMap<Document, number>();

/**
 * Marks a document whose visible Mesurer geometry is owned by CSS Anchor
 * Positioning. Legacy JavaScript geometry fallbacks consult this state so they
 * do not force layout on every compositor-driven scroll event.
 */
export function retainNativeScrollDocument(ownerDocument: Document) {
  activeDocuments.set(ownerDocument, (activeDocuments.get(ownerDocument) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (activeDocuments.get(ownerDocument) ?? 1) - 1;
    if (next > 0) activeDocuments.set(ownerDocument, next);
    else activeDocuments.delete(ownerDocument);
  };
}

export const hasNativeScrollDocument = (ownerDocument: Document) =>
  (activeDocuments.get(ownerDocument) ?? 0) > 0;
