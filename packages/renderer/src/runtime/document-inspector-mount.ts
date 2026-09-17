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

const DOCUMENT_INSPECTOR_Z_INDEX = "2147482999";

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

  // Context annotations are page evidence, so the fixed Mesurer renderer must
  // win when that evidence scrolls underneath the toolbar. Keep one document
  // stacking context immediately below the canonical renderer (2147483000),
  // while remaining above page content, selection chrome, and text-edit rings.
  // Marker > panel > highlight ordering still comes from their child z-indexes.
  Object.assign(element.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: "0px",
    height: "0px",
    overflow: "visible",
    zIndex: DOCUMENT_INSPECTOR_Z_INDEX,
  });
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
