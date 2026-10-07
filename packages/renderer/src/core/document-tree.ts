import { isElementWithinDomTarget } from "@jhomra21/mesurer-solid-dom";
import { getAccessibleFrameDocument } from "./frame-geometry";

const isElementInDocument = (
  node: Node,
  ownerDocument: Document,
): node is Element => {
  const ElementConstructor = ownerDocument.defaultView?.Element;

  return Boolean(ElementConstructor && node instanceof ElementConstructor);
};

export const getAccessibleDocuments = (
  root: Document | ShadowRoot | Element,
): Document[] => {
  const ownerDocument = root instanceof Document
    ? root
    : root.ownerDocument;

  const documents: Document[] = [];
  const seenDocuments = new Set<Document>();
  const seenRoots = new Set<Node>();

  const visitDocument = (currentDocument: Document) => {
    if (seenDocuments.has(currentDocument)) return;

    seenDocuments.add(currentDocument);
    documents.push(currentDocument);
    visitRoot(currentDocument, currentDocument);
  };

  const visitElement = (
    element: Element,
    currentDocument: Document,
  ) => {
    if (element.shadowRoot) visitRoot(element.shadowRoot, currentDocument);

    const childDocument = getAccessibleFrameDocument(element);

    if (childDocument) visitDocument(childDocument);
  };

  const visitRoot = (
    currentRoot: Document | ShadowRoot | Element,
    currentDocument: Document,
  ) => {
    if (seenRoots.has(currentRoot)) return;

    seenRoots.add(currentRoot);

    if (isElementInDocument(currentRoot, currentDocument)) {
      visitElement(currentRoot, currentDocument);
    }

    const walker = currentDocument.createTreeWalker(currentRoot, 1);
    let node = walker.nextNode();

    while (node) {
      if (isElementInDocument(node, currentDocument)) {
        visitElement(node, currentDocument);
      }

      node = walker.nextNode();
    }
  };

  if (root instanceof Document) visitDocument(root);
  else {
    seenDocuments.add(ownerDocument);
    documents.push(ownerDocument);
    visitRoot(root, ownerDocument);
  }

  return documents;
};

export const isElementWithinAccessibleTarget = (
  element: Element,
  target: HTMLElement | ShadowRoot,
) => {
  if (isElementWithinDomTarget(element, target)) return true;

  const targetDocument = target.ownerDocument;
  let currentDocument = element.ownerDocument;
  const seen = new Set<Document>();

  while (
    currentDocument !== targetDocument
    && !seen.has(currentDocument)
  ) {
    seen.add(currentDocument);

    let frame: Element | null = null;

    try {
      frame = currentDocument.defaultView?.frameElement ?? null;
    } catch {
      return false;
    }

    if (!frame) return false;

    if (
      frame.ownerDocument === targetDocument
      && isElementWithinDomTarget(frame, target)
    ) {
      return true;
    }

    currentDocument = frame.ownerDocument;
  }

  return false;
};
