import type { MesurerAnnotationTarget } from "@jhomra21/mesurer-solid-core";
import { getElementSelector } from "@jhomra21/mesurer-solid-dom";
import { getAccessibleDocuments } from "../core/document-tree";
import { getAccessibleFrameDocument } from "../core/frame-geometry";

export function previewTargetScope(element: Element): Pick<MesurerAnnotationTarget, "viewport" | "domPath"> {
  let current = element;
  const domPath: NonNullable<MesurerAnnotationTarget["domPath"]> = [];

  while (true) {
    const root = current.getRootNode();

    if ("host" in root) {
      // SAFETY: getRootNode() returns a ShadowRoot when its root has a host.
      const host = (root as ShadowRoot).host;
      domPath.unshift({ kind: "shadow", selector: getElementSelector(host) });
      current = host;
      continue;
    }

    const doc = current.ownerDocument;
    const frame = doc.defaultView?.frameElement;

    if (!frame) return {};

    if (frame.hasAttribute("data-mesurer-responsive-frame")) {
      const view = doc.defaultView!;

      return {
        viewport: {
          url: view.location.href.split("#")[0],
          width: view.innerWidth,
          height: view.innerHeight,
          previewId: frame.getAttribute("data-mesurer-responsive-preview-id")!,
        },
        domPath,
      };
    }

    domPath.unshift({ kind: "frame", selector: getElementSelector(frame) });
    current = frame;
  }
}

export function previewTargetRoot(root: ParentNode | undefined, target: MesurerAnnotationTarget): Document | ShadowRoot | null {
  const viewport = target.viewport;

  if (!viewport || !root) return null;

  const matches = [...root.querySelectorAll("iframe[data-mesurer-responsive-frame]")].filter((frame) => {
    const doc = getAccessibleFrameDocument(frame);
    const view = doc?.defaultView;

    return view
      && view.location.href.split("#")[0] === viewport.url
      && view.innerWidth === viewport.width
      && view.innerHeight === viewport.height;
  });

  const original = matches.find((frame) => frame.getAttribute("data-mesurer-responsive-preview-id") === viewport.previewId);
  const frame = original ?? (matches.length === 1 ? matches[0] : undefined);
  let targetRoot: Document | ShadowRoot | null = frame ? getAccessibleFrameDocument(frame) : null;

  for (const hop of target.domPath ?? []) {
    const matches: NodeListOf<Element> | undefined = targetRoot?.querySelectorAll(hop.selector);

    if (matches?.length !== 1) return null;
    targetRoot = hop.kind === "frame" ? getAccessibleFrameDocument(matches[0]) : matches[0].shadowRoot;
  }

  return targetRoot;
}

export function previewDocuments(root: ParentNode | undefined): Document[] {
  return [...root?.querySelectorAll("iframe[data-mesurer-responsive-frame]") ?? []].flatMap((frame) => {
    const doc = getAccessibleFrameDocument(frame);

    return doc ? getAccessibleDocuments(doc) : [];
  });
}

