import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MESURER_STYLES } from "../styles.generated";
import { ensureMesurerStyles } from "./style-inject";

export type MesurerDocumentInspectorRuntime = {
  runtime: MesurerSolidRuntimeService;
  documentBacked: boolean;
};

type PopoverInspectorMount = HTMLDivElement & {
  popover: string | null;
  showPopover(): void;
  hidePopover(): void;
};

const isDocumentBackedTarget = (
  runtime: MesurerSolidRuntimeService,
  realm: Window & typeof globalThis,
) => !(runtime.pageTarget instanceof realm.ShadowRoot)
  && runtime.pageTarget.getRootNode() === runtime.ownerDocument;

const supportsPopover = (element: HTMLDivElement): element is PopoverInspectorMount =>
  "popover" in element
  && "showPopover" in element
  && typeof element.showPopover === "function"
  && "hidePopover" in element
  && typeof element.hidePopover === "function";

const hardenInspectorMount = (element: HTMLDivElement) => {
  const properties = {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    margin: "0",
    padding: "0",
    border: "0",
    overflow: "visible",
    background: "transparent",
    "pointer-events": "none",
    "z-index": "2147483647",
  } satisfies Record<string, string>;
  for (const [property, value] of Object.entries(properties)) {
    element.style.setProperty(property, value, "important");
  }
};

/**
 * Give page-following plugin UI the same document positioning tree as the page
 * while keeping the canonical Mesurer toolbar in its hardened host/ShadowRoot.
 *
 * CSS Anchor Positioning cannot resolve a page element from inside Mesurer's
 * ShadowRoot. A document-backed inspector mount keeps transient plugin surfaces
 * in the page document so native anchors resolve. When the Popover API exists,
 * promote only that document-backed mount to the top layer so the isolated
 * Select interaction plane cannot steal input from those surfaces. The mount
 * itself remains pointer-transparent; only explicit inspector controls receive
 * pointer input. The equal max-z fallback is appended after the isolated host,
 * preserving the same ordering in browsers without Popover support.
 */
export function createDocumentInspectorRuntime(
  runtime: MesurerSolidRuntimeService,
): MesurerDocumentInspectorRuntime {
  const { ownerDocument, ownerWindow } = runtime;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument/pageTarget,
  // so its DOM constructors are the correct realm for this runtime.
  const realm = ownerWindow as Window & typeof globalThis;
  if (!ownerDocument.body || !isDocumentBackedTarget(runtime, realm)) {
    return { runtime, documentBacked: false };
  }

  ensureMesurerStyles(MESURER_STYLES, ownerDocument.body);

  const createInspectorMount = () => {
    const element = ownerDocument.createElement("div");
    element.dataset.mesurerInspectorUi = "true";
    element.dataset.mesurerDocumentInspectorRuntime = "true";
    hardenInspectorMount(element);

    const popover = supportsPopover(element);
    if (popover) element.popover = "manual";
    ownerDocument.body.append(element);
    if (popover) {
      try {
        element.showPopover();
      } catch {
        element.removeAttribute("popover");
      }
    }

    let disposed = false;
    return {
      element,
      dispose() {
        if (disposed) return;
        disposed = true;
        if (supportsPopover(element) && element.matches(":popover-open")) {
          try {
            element.hidePopover();
          } catch {
            // Removing the mount below also removes it from the top layer.
          }
        }
        element.remove();
      },
    };
  };

  return {
    documentBacked: true,
    runtime: {
      ...runtime,
      portalTarget: ownerDocument.body,
      createInspectorMount,
    },
  };
}
