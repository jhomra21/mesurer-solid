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
  const realm = ownerWindow as Window & typeof globalThis;
  const documentBacked = body
    && !(pageTarget instanceof realm.ShadowRoot)
    && pageTarget.getRootNode() === ownerDocument;

  if (!documentBacked) return runtime.createInspectorMount();

  ensureMesurerStyles(MESURER_STYLES, body);
  const element = ownerDocument.createElement("div");
  element.dataset.mesurerInspectorUi = "true";
  element.dataset.mesurerDocumentInspectorMount = "true";
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
