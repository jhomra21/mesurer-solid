import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MESURER_STYLES } from "../styles.generated";
import { ensureMesurerStyles } from "./style-inject";

export type DocumentInspectorMount = {
  element: HTMLDivElement;
  dispose(): void;
};

const ANNOTATION_HIGHLIGHT_Z_INDEX = "2147482950";

/**
 * Page-owned inspector UI must participate in the same document scroll tree as
 * the page it describes. The canonical Mesurer renderer can remain isolated in
 * its ShadowRoot/top layer while these surfaces use ordinary document-space
 * positioning, just like the accepted Typography path.
 */
export function createDocumentInspectorMount(
  runtime: MesurerSolidRuntimeService,
): DocumentInspectorMount {
  const { ownerDocument, ownerWindow, pageTarget } = runtime;
  const body = ownerDocument.body;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument and pageTarget, so its DOM constructors match this runtime.
  const realm = ownerWindow as Window & typeof globalThis;
  const documentBacked = body
    && !(pageTarget instanceof realm.ShadowRoot)
    && pageTarget.getRootNode() === ownerDocument;

  if (!documentBacked) return runtime.createInspectorMount();

  ensureMesurerStyles(MESURER_STYLES, body);
  const element = ownerDocument.createElement("div");
  element.dataset.mesurerInspectorUi = "true";
  element.dataset.mesurerDocumentInspectorMount = "true";

  // Keep this origin out of the stacking tree. Individual document-owned
  // surfaces already own explicit z-index tiers, and letting the mount create a
  // top-level stacking context would force even non-interactive page evidence
  // above the fixed Mesurer toolbar while the page scrolls underneath it.
  Object.assign(element.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: "0px",
    height: "0px",
    overflow: "visible",
  });

  // The ownership edge is page evidence, not viewport chrome. Keep it above the
  // selected measurement box but below the canonical fixed renderer so the
  // toolbar naturally occludes the edge when its target scrolls behind it. The
  // interactive marker/panel tiers remain untouched and can still sit above the
  // renderer when their passthrough contract requires it.
  const layerStyle = ownerDocument.createElement("style");
  layerStyle.dataset.mesurerDocumentInspectorLayerStyle = "true";
  layerStyle.textContent = `
[data-mesurer-document-inspector-mount="true"] [data-mesurer-annotation-target-highlight="true"] {
  z-index: ${ANNOTATION_HIGHLIGHT_Z_INDEX} !important;
}
`;
  element.append(layerStyle);
  body.append(element);

  let disposed = false;
  return {
    element,
    dispose() {
      if (disposed) return;
      disposed = true;
      element.remove();
    },
  };
}
