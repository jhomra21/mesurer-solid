import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MESURER_STYLES } from "../styles.generated";
import { ensureMesurerStyles } from "./style-inject";

export type MesurerDocumentInspectorRuntime = {
  runtime: MesurerSolidRuntimeService;
  documentBacked: boolean;
};

const isDocumentBackedTarget = (
  runtime: MesurerSolidRuntimeService,
  realm: Window & typeof globalThis,
) => !(runtime.pageTarget instanceof realm.ShadowRoot)
  && runtime.pageTarget.getRootNode() === runtime.ownerDocument;

const rectContainsPoint = (rect: DOMRect, x: number, y: number) =>
  rect.width > 0
  && rect.height > 0
  && x >= rect.left
  && x <= rect.right
  && y >= rect.top
  && y <= rect.bottom;

const isProtectedTopLayerControl = (
  event: Event,
  mount: HTMLElement,
  realm: Window & typeof globalThis,
) => event.composedPath().some((node) => {
  if (!(node instanceof realm.Element) || mount.contains(node)) return false;
  return node.matches("button, input, select, textarea, [role='button'], [role='switch'], [role='slider']")
    || node.hasAttribute("data-mesurer-toolbar")
    || node.hasAttribute("data-mesurer-settings");
});

const deepestMountHit = (
  mount: HTMLElement,
  x: number,
  y: number,
  realm: Window & typeof globalThis,
) => {
  const candidates = Array.from(mount.querySelectorAll<HTMLElement>("*"));
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (!candidate.isConnected) continue;
    const style = realm.getComputedStyle(candidate);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") continue;
    if (rectContainsPoint(candidate.getBoundingClientRect(), x, y)) return candidate;
  }
  return null;
};

const createBridgedClick = (
  event: PointerEvent | MouseEvent,
  realm: Window & typeof globalThis,
) => new realm.MouseEvent("click", {
  bubbles: true,
  cancelable: true,
  composed: true,
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

const installHostedInputBridge = (
  mount: HTMLElement,
  ownerWindow: Window & typeof globalThis,
) => {
  const eventStartsInsideMount = (event: Event) =>
    event.target instanceof ownerWindow.Node && mount.contains(event.target);
  let suppressNativeClick = false;
  let suppressNativeClickTimer = 0;

  const armNativeClickSuppression = () => {
    suppressNativeClick = true;
    if (suppressNativeClickTimer) ownerWindow.clearTimeout(suppressNativeClickTimer);
    suppressNativeClickTimer = ownerWindow.setTimeout(() => {
      suppressNativeClick = false;
      suppressNativeClickTimer = 0;
    }, 0);
  };

  const routePointer = (event: PointerEvent) => {
    if (eventStartsInsideMount(event)) return;
    if (isProtectedTopLayerControl(event, mount, ownerWindow)) return;
    const target = deepestMountHit(mount, event.clientX, event.clientY, ownerWindow);
    if (!target) return;

    // Keep Select from seeing a pointer that belongs to document-backed Mesurer
    // UI, but preserve the browser's pointer lifecycle. The bridged click is
    // emitted deterministically on primary pointerup instead of depending on a
    // compatibility click from the Mesurer-owned host layer.
    event.stopImmediatePropagation();
    const focusTarget = target.closest<HTMLElement>(
      "button, input, select, textarea, [contenteditable='true'], [tabindex]",
    );
    focusTarget?.focus({ preventScroll: true });
    target.dispatchEvent(new ownerWindow.PointerEvent(event.type, {
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
    }));

    if (event.type === "pointerup" && event.button === 0 && event.isPrimary) {
      armNativeClickSuppression();
      target.dispatchEvent(createBridgedClick(event, ownerWindow));
    }
  };

  const routeClick = (event: MouseEvent) => {
    if (eventStartsInsideMount(event)) return;
    if (isProtectedTopLayerControl(event, mount, ownerWindow)) return;
    const target = deepestMountHit(mount, event.clientX, event.clientY, ownerWindow);
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (suppressNativeClick) {
      suppressNativeClick = false;
      if (suppressNativeClickTimer) ownerWindow.clearTimeout(suppressNativeClickTimer);
      suppressNativeClickTimer = 0;
      return;
    }

    const focusTarget = target.closest<HTMLElement>(
      "button, input, select, textarea, [contenteditable='true'], [tabindex]",
    );
    focusTarget?.focus({ preventScroll: true });
    target.dispatchEvent(createBridgedClick(event, ownerWindow));
  };

  ownerWindow.addEventListener("pointerdown", routePointer, true);
  ownerWindow.addEventListener("pointerup", routePointer, true);
  ownerWindow.addEventListener("click", routeClick, true);
  return () => {
    ownerWindow.removeEventListener("pointerdown", routePointer, true);
    ownerWindow.removeEventListener("pointerup", routePointer, true);
    ownerWindow.removeEventListener("click", routeClick, true);
    if (suppressNativeClickTimer) ownerWindow.clearTimeout(suppressNativeClickTimer);
    suppressNativeClickTimer = 0;
    suppressNativeClick = false;
  };
};

/**
 * Give page-following plugin UI the same document positioning tree as the page
 * while keeping the canonical Mesurer toolbar in its hardened host boundary.
 *
 * CSS Anchor Positioning cannot resolve a page element from inside Mesurer's
 * top-layer ShadowRoot, so transient page-following surfaces stay in the page
 * document. Within a Mesurer-owned island, whether isolated by ShadowRoot or
 * rendered directly into its island host, the interaction plane can sit above
 * the document-backed inspector. A capture bridge forwards only pointer input
 * that geometrically belongs to this document-backed inspector mount; ordinary
 * page input still reaches Select, while canonical Mesurer controls retain
 * precedence. This preserves native compositor anchoring without making
 * inspected application controls live.
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
  const hostedIsland = runtime.portalTarget instanceof realm.ShadowRoot
    || (
      runtime.portalTarget instanceof realm.HTMLElement
      && runtime.portalTarget.dataset.mesurerIsland === "true"
    );

  const createInspectorMount = () => {
    const element = ownerDocument.createElement("div");
    element.dataset.mesurerInspectorUi = "true";
    element.dataset.mesurerDocumentInspectorRuntime = "true";
    ownerDocument.body.append(element);
    const disposeInputBridge = hostedIsland
      ? installHostedInputBridge(element, realm)
      : null;
    let disposed = false;
    return {
      element,
      dispose() {
        if (disposed) return;
        disposed = true;
        disposeInputBridge?.();
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
