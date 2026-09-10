import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MESURER_STYLES } from "../styles.generated";
import { ensureMesurerStyles } from "./style-inject";

export type MesurerDocumentInspectorRuntime = {
  runtime: MesurerSolidRuntimeService;
  documentBacked: boolean;
};

const DOCUMENT_INSPECTOR_Z_INDEX = "2147483000";
const DOCUMENT_INPUT_Z_INDEX = "2147482999";

const isDocumentBackedTarget = (
  runtime: MesurerSolidRuntimeService,
  realm: Window & typeof globalThis,
) => !(runtime.pageTarget instanceof realm.ShadowRoot)
  && runtime.pageTarget.getRootNode() === runtime.ownerDocument;

const findIsolatedInteractionPlane = (
  portalTarget: ShadowRoot,
  realm: Window & typeof globalThis,
) => {
  const root = portalTarget.querySelector<HTMLElement>("[data-mesurer-root='true']");
  if (!root) return null;
  return Array.from(root.children).find((child): child is HTMLElement =>
    child instanceof realm.HTMLElement
      && child.classList.contains("msr:absolute")
      && child.classList.contains("msr:inset-0")
      && child.classList.contains("msr:select-none"),
  ) ?? null;
};

const clonePointerEvent = (
  event: PointerEvent,
  realm: Window & typeof globalThis,
) => new realm.PointerEvent(event.type, {
  bubbles: true,
  cancelable: true,
  composed: true,
  pointerId: event.pointerId,
  pointerType: event.pointerType,
  isPrimary: event.isPrimary,
  button: event.button,
  buttons: event.buttons,
  clientX: event.clientX,
  clientY: event.clientY,
  screenX: event.screenX,
  screenY: event.screenY,
  ctrlKey: event.ctrlKey,
  shiftKey: event.shiftKey,
  altKey: event.altKey,
  metaKey: event.metaKey,
});

const installIsolatedInputProxy = (
  runtime: MesurerSolidRuntimeService,
  mount: HTMLElement,
  realm: Window & typeof globalThis,
) => {
  if (!(runtime.portalTarget instanceof realm.ShadowRoot)) return () => undefined;
  const interactionPlane = findIsolatedInteractionPlane(runtime.portalTarget, realm);
  if (!interactionPlane) return () => undefined;

  interactionPlane.dataset.mesurerDocumentInputProxy = "true";
  const override = runtime.ownerDocument.createElement("style");
  override.dataset.mesurerDocumentInputProxyStyle = "true";
  override.textContent = "[data-mesurer-document-input-proxy='true']{pointer-events:none!important}";
  runtime.portalTarget.append(override);

  const blocker = runtime.ownerDocument.createElement("div");
  blocker.dataset.mesurerInspectorUi = "true";
  blocker.dataset.mesurerDocumentInputBlocker = "true";
  Object.assign(blocker.style, {
    position: "fixed",
    inset: "0",
    zIndex: DOCUMENT_INPUT_Z_INDEX,
    margin: "0",
    padding: "0",
    border: "0",
    background: "transparent",
    pointerEvents: "none",
    userSelect: "none",
  });
  mount.before(blocker);

  const syncBlocker = () => {
    const active = interactionPlane.style.pointerEvents === "auto";
    blocker.style.pointerEvents = active ? "auto" : "none";
    blocker.style.cursor = runtime.currentToolMode?.() === "guides" ? "crosshair" : "default";
  };
  const forward = (event: PointerEvent) => {
    event.preventDefault();
    interactionPlane.dispatchEvent(clonePointerEvent(event, realm));
  };
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave"] as const) {
    blocker.addEventListener(type, forward);
  }

  const observer = new realm.MutationObserver(syncBlocker);
  observer.observe(interactionPlane, { attributes: true, attributeFilter: ["style", "class"] });
  syncBlocker();

  return () => {
    observer.disconnect();
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave"] as const) {
      blocker.removeEventListener(type, forward);
    }
    blocker.remove();
    override.remove();
    delete interactionPlane.dataset.mesurerDocumentInputProxy;
  };
};

/**
 * Give page-following plugin UI the same document positioning tree as the page
 * while keeping the canonical Mesurer toolbar in its hardened host/ShadowRoot.
 *
 * CSS Anchor Positioning cannot resolve a page element from inside Mesurer's
 * top-layer ShadowRoot, so transient page-following surfaces stay in the page
 * document. In the isolated-host topology, the original full-screen interaction
 * plane is made pointer-transparent and a document blocker immediately beneath
 * inspector UI proxies its pointer stream back to that same plane. Inspector
 * controls therefore receive native browser input, page controls remain blocked,
 * and Select/Guides keep their existing pointer handlers and hit-testing logic.
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
    element.style.zIndex = DOCUMENT_INSPECTOR_Z_INDEX;
    ownerDocument.body.append(element);
    const disposeInputProxy = installIsolatedInputProxy(runtime, element, realm);
    let disposed = false;
    return {
      element,
      dispose() {
        if (disposed) return;
        disposed = true;
        disposeInputProxy();
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
