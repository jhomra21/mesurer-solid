export function documentHoverPortalTarget(
  overlay: HTMLElement | undefined,
  target: HTMLElement | null,
): HTMLElement | null {
  const ownerDocument = overlay?.ownerDocument;
  const body = ownerDocument?.body;

  if (!overlay || !target?.isConnected || !ownerDocument || !body) return null;

  if (target.getRootNode() !== ownerDocument) return null;

  // A document-backed Context mount already installs Mesurer's styles into the
  // page scroll tree. Use that stable mount as the ownership signal instead of
  // waiting for a particular annotation panel/composer node to exist.
  //
  // Do not require the renderer itself to live in a ShadowRoot. A non-isolated
  // renderer can still be protected by a top-layer popover. In that topology,
  // leaving Select hover inside the renderer makes the browser paint it above
  // every ordinary document annotation card regardless of numeric z-index.
  // Portaling the hover evidence into <body> gives it the same document paint
  // plane as Context, where the lower hover tier can be occluded by panels and
  // the Add Note composer.
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
