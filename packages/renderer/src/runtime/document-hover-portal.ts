export function documentHoverPortalTarget(
  overlay: HTMLElement | undefined,
  target: HTMLElement | null,
): HTMLElement | null {
  const ownerDocument = overlay?.ownerDocument;
  const ownerWindow = ownerDocument?.defaultView;
  const body = ownerDocument?.body;
  if (!overlay || !target?.isConnected || !ownerDocument || !ownerWindow || !body) return null;
  if (!(overlay.getRootNode() instanceof ownerWindow.ShadowRoot)) return null;
  if (target.getRootNode() !== ownerDocument) return null;

  // A document-backed Context mount already installs Mesurer's styles into the
  // page scroll tree. Use that stable mount as the ownership signal instead of
  // waiting for a particular annotation panel/composer node to exist. The old
  // panel query was not reactive, so hover chrome could remain in the protected
  // top-layer island and visually paint through a card that opened afterward.
  const documentContext = ownerDocument.querySelector<HTMLElement>(
    "[data-mesurer-document-inspector-mount='true'][data-mesurer-context-root='true']",
  );
  const textInspector = ownerDocument.querySelector<HTMLElement>(
    "[data-mesurer-text-inspector-info='true']",
  );
  const documentInspector = documentContext ?? textInspector;
  if (!documentInspector?.isConnected || documentInspector.getRootNode() !== ownerDocument) return null;

  return body;
}
