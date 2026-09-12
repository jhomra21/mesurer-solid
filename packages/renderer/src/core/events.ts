const realmFor = (ownerWindow: Window) => {
  // SAFETY: ownerWindow is the document realm for these events and owns the DOM constructors used below.
  return ownerWindow as Window & typeof globalThis;
};

export function getDeepActiveElement(ownerWindow: Window): Element | null {
  let active: Element | null = ownerWindow.document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

export function isEditableElement(node: EventTarget | null, ownerWindow: Window): boolean {
  const realm = realmFor(ownerWindow);
  if (!(node instanceof realm.HTMLElement)) return false;
  const tagName = node.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return true;
  if (node.isContentEditable) return true;
  const editable = node.getAttribute("contenteditable");
  return editable !== null && editable !== "false";
}

export function isInsideMesurer(node: EventTarget | null, ownerWindow: Window): boolean {
  const realm = realmFor(ownerWindow);
  if (!(node instanceof realm.Node)) return false;
  let current: Node | null = node;
  while (current) {
    if (current instanceof realm.Element && (
      current.getAttribute("data-mesurer-root") === "true"
      || current.getAttribute("data-mesurer-island") === "true"
      || current.getAttribute("data-mesurer-inspector-ui") === "true"
    )) return true;
    const parent: Node | null = current.parentNode;
    current = parent instanceof realm.ShadowRoot ? parent.host : parent;
  }
  return false;
}

/**
 * Return true only for a concrete Mesurer-owned input surface at this node.
 *
 * This intentionally does not treat the full-screen renderer root or its outer
 * island host as a pointer boundary merely because they are ancestors. Select's
 * transparent interaction plane covers the viewport and must be temporarily
 * ignored to inspect the page. Inspector cards, toolbars, settings, annotation
 * controls, and other explicit inspector islands are different: they are real
 * UI and must never be looked through to page content underneath.
 */
export function isMesurerInputBoundary(node: EventTarget | null, ownerWindow: Window): boolean {
  const realm = realmFor(ownerWindow);
  if (!(node instanceof realm.Element)) return false;
  let current: Element | null = node;
  while (current) {
    if (
      current.getAttribute("data-mesurer-inspector-ui") === "true"
      || current.hasAttribute("data-mesurer-toolbar")
      || current.hasAttribute("data-mesurer-settings")
    ) return true;
    current = current.parentElement;
  }
  return false;
}

export function isMesurerUiNode(node: EventTarget | null, ownerWindow: Window): boolean {
  if (isInsideMesurer(node, ownerWindow)) return true;
  const realm = realmFor(ownerWindow);
  if (!(node instanceof realm.Element)) return false;
  return Boolean(node.shadowRoot?.querySelector("[data-mesurer-root='true']"));
}

export function isTypingInMesurer(event: KeyboardEvent, ownerWindow: Window): boolean {
  const active = getDeepActiveElement(ownerWindow);
  if (isEditableElement(active, ownerWindow) && isInsideMesurer(active, ownerWindow)) return true;
  return event.composedPath().some((node) =>
    isEditableElement(node, ownerWindow) && isMesurerUiNode(node, ownerWindow));
}

export function isTypingInPage(ownerWindow: Window): boolean {
  const active = getDeepActiveElement(ownerWindow);
  return isEditableElement(active, ownerWindow) && !isInsideMesurer(active, ownerWindow);
}

export function isMesurerKeyboardEvent(event: Event, ownerWindow: Window): boolean {
  if (isInsideMesurer(getDeepActiveElement(ownerWindow), ownerWindow)) return true;
  return event.composedPath().some((node) => isMesurerUiNode(node, ownerWindow));
}

export function isEditableKeyboardEvent(event: KeyboardEvent, ownerWindow: Window): boolean {
  // Escape belongs to interaction lifecycle/cancel handling, not the global shortcut gate.
  if (event.key === "Escape" || event.code === "Escape") return false;
  if (isTypingInMesurer(event, ownerWindow) || isTypingInPage(ownerWindow)) return true;
  return event.composedPath().some((target) => isEditableElement(target, ownerWindow));
}

type PointerCaptureTarget = {
  ownerDocument?: Document | null;
  setPointerCapture?: (pointerId: number) => void;
};

const isExpectedPointerCaptureError = (cause: unknown, target: PointerCaptureTarget): boolean => {
  const DOMExceptionConstructor = target.ownerDocument?.defaultView?.DOMException;
  if (!DOMExceptionConstructor) return false;
  return cause instanceof DOMExceptionConstructor
    && (cause.name === "NotFoundError" || cause.name === "InvalidStateError");
};

export function trySetPointerCapture(target: PointerCaptureTarget, pointerId: number): boolean {
  if (!target.setPointerCapture) return false;
  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch (error) {
    if (isExpectedPointerCaptureError(error, target)) return false;
    throw error;
  }
}
