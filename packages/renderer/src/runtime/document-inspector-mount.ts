import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MESURER_STYLES } from "../styles.generated";
import { ensureMesurerStyles } from "./style-inject";

export type DocumentInspectorMount = {
  element: HTMLDivElement;
  dispose(): void;
};

type DocumentInspectorRuntime = Pick<
  MesurerSolidRuntimeService,
  "ownerDocument" | "ownerWindow" | "pageTarget" | "createInspectorMount"
>;

const CONTEXT_HIGHLIGHT_Z_INDEX = "2147482950";

const CONTEXT_PANEL_Z_INDEX = "2147483646";

const CONTEXT_INTERACTION_Z_INDEX = "2147483647";

/**
 * Page-owned inspector UI must participate in the same document scroll tree as
 * the page it describes. The canonical Mesurer renderer can remain isolated in
 * its ShadowRoot/top layer while these surfaces use ordinary document-space
 * positioning, just like the accepted Typography path.
 */
export function createDocumentInspectorMount(
  runtime: DocumentInspectorRuntime,
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

  // Do not make the shared document origin a stacking context. Context has two
  // different paint responsibilities: the ownership edge is page evidence and
  // must pass underneath fixed Mesurer chrome, while real annotation controls
  // must stay physically reachable above the protected renderer. Let those
  // children participate directly in the document stacking order instead of
  // forcing both responsibilities into one parent z-index.
  Object.assign(element.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: "0px",
    height: "0px",
    overflow: "visible",
  });

  const layerStyle = ownerDocument.createElement("style");
  layerStyle.dataset.mesurerDocumentInspectorLayerStyle = "true";
  layerStyle.textContent = `
[data-mesurer-document-inspector-mount="true"] [data-mesurer-annotation-target-highlight="true"] {
  position: absolute !important;
  z-index: ${CONTEXT_HIGHLIGHT_Z_INDEX} !important;
}
[data-mesurer-document-inspector-mount="true"] [data-mesurer-annotation-panel="true"] {
  position: absolute !important;
  z-index: ${CONTEXT_PANEL_Z_INDEX} !important;
}
[data-mesurer-document-inspector-mount="true"] [data-mesurer-annotation-marker="true"],
[data-mesurer-document-inspector-mount="true"] [data-mesurer-annotation-trigger="true"],
[data-mesurer-document-inspector-mount="true"] [data-mesurer-annotation-composer="true"] {
  position: absolute !important;
  z-index: ${CONTEXT_INTERACTION_Z_INDEX} !important;
}
`;
  ownerDocument.head.append(layerStyle);
  body.append(element);

  let disposed = false;

  return {
    element,
    dispose() {
      if (disposed) return;
      disposed = true;
      layerStyle.remove();
      element.remove();
    },
  };
}
