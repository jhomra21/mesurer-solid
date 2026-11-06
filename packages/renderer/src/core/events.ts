export const realmFor = (ownerWindow: Window) => {
  // SAFETY: ownerWindow is the document realm for these events and owns the DOM constructors used below.
  return ownerWindow as Window & typeof globalThis;
};

// A closed ShadowRoot hides its focused descendant and its hit targets from outside. Mesurer's own
// island registers its root here so focus and pointer ownership can still see inside it.
const mesurerShadowRoots = new WeakMap<Element, ShadowRoot>();

export function registerMesurerShadowRoot(root: ShadowRoot): () => void {
  mesurerShadowRoots.set(root.host, root);

  return () => {
    if (mesurerShadowRoots.get(root.host) === root) mesurerShadowRoots.delete(root.host);
  };
}

const keyboardOwnedWindows = new WeakSet<Window>();

export function setKeyboardOwned(ownerWindow: Window, owned: boolean): void {
  if (owned) keyboardOwnedWindows.add(ownerWindow);
  else keyboardOwnedWindows.delete(ownerWindow);
}

export function isKeyboardOwned(ownerWindow: Window): boolean {
  return keyboardOwnedWindows.has(ownerWindow);
}

export function getDeepActiveElement(ownerWindow: Window): Element | null {
  let active: Element | null = ownerWindow.document.activeElement;

  while (active) {
    const root: ShadowRoot | null = active.shadowRoot ?? mesurerShadowRoots.get(active) ?? null;

    if (!root?.activeElement) break;
    active = root.activeElement;
  }

  return active;
}

const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

export function isEditableElement(node: EventTarget | null, ownerWindow: Window): boolean {
  const realm = realmFor(ownerWindow);

  if (!(node instanceof realm.HTMLElement)) return false;
  const tagName = node.tagName;

  if (node instanceof realm.HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(node.type);

  if (tagName === "TEXTAREA" || tagName === "SELECT") return true;

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

/**
 * Like isMesurerInputBoundary, but also resolves an island host at a viewport point. A closed
 * ShadowRoot retargets every hit inside it to the host, so the node alone cannot say whether the
 * pointer is over Mesurer UI or over the transparent interaction plane.
 */
export function isMesurerInputBoundaryAt(node: EventTarget | null, x: number, y: number, ownerWindow: Window): boolean {
  if (isMesurerInputBoundary(node, ownerWindow)) return true;
  const root = node instanceof realmFor(ownerWindow).Element ? mesurerShadowRoots.get(node) : undefined;
  const hit = root?.elementFromPoint(x, y) ?? null;

  return hit !== null && isMesurerInputBoundary(hit, ownerWindow);
}

/** A node that begins Mesurer-owned UI as seen from outside: the island host, an inspector mount, or the renderer root. */
export function isMesurerBoundaryNode(node: EventTarget | null, ownerWindow: Window): boolean {
  if (!(node instanceof realmFor(ownerWindow).Element)) return false;

  return node.getAttribute("data-mesurer-island") === "true"
    || node.getAttribute("data-mesurer-inspector-ui") === "true"
    || node.getAttribute("data-mesurer-root") === "true";
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

// An element that cannot take focus itself yet is the active element can only be a host whose
// closed ShadowRoot holds the focus. Whatever is focused inside is invisible, so assume typing.
function isOpaqueFocusHost(active: Element | null, ownerWindow: Window): boolean {
  const realm = realmFor(ownerWindow);

  return active instanceof realm.HTMLElement
    && active !== ownerWindow.document.body
    && active !== ownerWindow.document.documentElement
    && !active.hasAttribute("tabindex")
    && active.tabIndex < 0;
}

export function isTypingInPage(ownerWindow: Window): boolean {
  const active = getDeepActiveElement(ownerWindow);

  if (isInsideMesurer(active, ownerWindow)) return false;

  return isEditableElement(active, ownerWindow) || isOpaqueFocusHost(active, ownerWindow);
}

export function isMesurerKeyboardEvent(event: Event, ownerWindow: Window): boolean {
  if (isInsideMesurer(getDeepActiveElement(ownerWindow), ownerWindow)) return true;

  return event.composedPath().some((node) => isMesurerUiNode(node, ownerWindow));
}

export function isEditableKeyboardEvent(event: KeyboardEvent, ownerWindow: Window): boolean {
  // Escape belongs to interaction lifecycle/cancel handling, not the global shortcut gate.
  if (event.key === "Escape" || event.code === "Escape") return false;

  if (isTypingInMesurer(event, ownerWindow)) return true;

  // After the user works in Mesurer, a page prompt that keeps or regains focus no longer owns typing.
  if (isKeyboardOwned(ownerWindow)) return false;

  if (isTypingInPage(ownerWindow)) return true;

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
