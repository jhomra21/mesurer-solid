import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MESURER_STYLES } from "../styles.generated";
import { ensureMesurerStyles } from "./style-inject";

export type DocumentInspectorMount = {
  element: HTMLDivElement;
  dispose(): void;
};

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
  // The fixed host fallback already occupies the highest author z-index. Give
  // the document inspector one later sibling stacking context at the same tier
  // so its page-owned controls remain physically reachable while preserving the
  // marker > panel > highlight ordering inside this mount. The mount itself is
  // zero-sized and non-interactive; only explicit child surfaces receive input.
  Object.assign(element.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: "0px",
    height: "0px",
    overflow: "visible",
    pointerEvents: "none",
    zIndex: "2147483647",
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
