import {
  getDeepActiveElement,
  isEditableElement,
  isInsideMesurer,
  isMesurerBoundaryNode,
  realmFor,
  registerMesurerShadowRoot,
  setKeyboardOwned,
} from "./events";

const TYPING_EVENTS = [
  "keydown",
  "keypress",
  "keyup",
  "beforeinput",
  "input",
  "compositionstart",
  "compositionupdate",
  "compositionend",
  "paste",
  "copy",
  "cut",
] as const;

type WindowGuards = { references: number; dispose: () => void };

const guards = new WeakMap<Window, WindowGuards>();

/**
 * Keep the keyboard usable on pages that fight for it.
 *
 * Call synchronously while a renderer component is created, before any Mesurer window listener
 * exists. Three guards, each needed:
 *
 * - Ownership (claimed by pressing or focusing Mesurer UI, released when focus moves to the page
 *   or the page is pressed) keeps shortcuts working when a page editor keeps focus. While Mesurer
 *   holds focus, or is taking it, page `focus()` calls are no-ops, so a prompt that refocuses itself
 *   on blur cannot take focus back. Outside that window the page may move focus freely.
 * - Cancellation by host listeners is ignored only for typing events that are travelling to a
 *   Mesurer node, and only while the event is still at a window or document that Mesurer has not
 *   reached yet. A window or document capture listener registered earlier always runs first, so
 *   Mesurer cannot beat it by ordering, only by making its cancellation inert. Events aimed at
 *   the page are never touched.
 * - Keys typed in a Mesurer field stop at the outermost Mesurer node, so host bubble-phase document
 *   listeners never see them. Escape continues, because Mesurer's lifecycle handler listens on window.
 *
 * The patched prototype methods stay reachable if another library wrapped them, so every wrapper
 * checks `disposed` first and then behaves exactly like the captured native method.
 */
export function installKeyboardOwnership(ownerWindow: Window, root: HTMLElement | ShadowRoot): () => void {
  const realm = realmFor(ownerWindow);
  const existing = guards.get(ownerWindow);

  if (existing) existing.references += 1;
  else guards.set(ownerWindow, { references: 1, dispose: installWindowGuards(ownerWindow) });

  const unregisterRoot = root instanceof realm.ShadowRoot ? registerMesurerShadowRoot(root) : () => undefined;

  return () => {
    unregisterRoot();
    const current = guards.get(ownerWindow);

    if (!current) return;
    current.references -= 1;

    if (current.references > 0) return;
    current.dispose();
    guards.delete(ownerWindow);
  };
}

function installWindowGuards(ownerWindow: Window): () => void {
  const realm = realmFor(ownerWindow);
  const ownerDocument = ownerWindow.document;
  const eventPrototype = realm.Event.prototype;
  const elementPrototype = realm.HTMLElement.prototype;
  const nativePreventDefault = eventPrototype.preventDefault;
  const nativeStopPropagation = eventPrototype.stopPropagation;
  const nativeStopImmediatePropagation = eventPrototype.stopImmediatePropagation;
  const nativeFocus = elementPrototype.focus;
  let disposed = false;
  let owned = false;
  // Mesurer is about to receive focus: a pointer press on Mesurer UI, or the blur that precedes a focus move into it.
  let incoming = false;
  // Depth of Mesurer's own synchronous focus() calls.
  let handoff = 0;
  let reached: { event: Event; window: boolean; document: boolean } | null = null;

  const isTypingEvent = (event: Event) =>
    event instanceof realm.KeyboardEvent
    || event instanceof realm.InputEvent
    || event instanceof realm.CompositionEvent
    || event instanceof realm.ClipboardEvent;

  const hasMesurerBoundary = (event: Event) =>
    event.composedPath().some((node) => isMesurerBoundaryNode(node, ownerWindow));

  // Closing a Mesurer dialog removes the focused field, leaving the page body focused. No host element
  // owns that key, so while Mesurer holds the keyboard it still counts as Mesurer's.
  const goesToMesurer = (event: Event) => {
    if (hasMesurerBoundary(event)) return true;
    const target = event.composedPath()[0];

    return owned && (target === ownerDocument.body || target === ownerDocument.documentElement);
  };

  // Only the window and the document can hold a host listener that ran before Mesurer's first one.
  const hostMaySwallow = (event: Event) => {
    if (disposed || !isTypingEvent(event)) return false;
    const node = event.currentTarget;

    if (node !== ownerWindow && node !== ownerDocument) return false;

    if (reached?.event === event && (node === ownerWindow ? reached.window : reached.document)) return false;

    return goesToMesurer(event);
  };

  const preventDefault = function (this: Event) {
    if (!hostMaySwallow(this)) nativePreventDefault.call(this);
  };

  const stopPropagation = function (this: Event) {
    if (!hostMaySwallow(this)) nativeStopPropagation.call(this);
  };

  const stopImmediatePropagation = function (this: Event) {
    if (!hostMaySwallow(this)) nativeStopImmediatePropagation.call(this);
  };

  const mesurerHoldsFocus = () => isInsideMesurer(getDeepActiveElement(ownerWindow), ownerWindow);

  const focus = function (this: HTMLElement, options?: FocusOptions) {
    if (disposed) return nativeFocus.call(this, options);

    if (isInsideMesurer(this, ownerWindow)) {
      // Claim the keyboard before the page's blur handler gets a chance to take focus back.
      setOwned(true);
      handoff += 1;

      try {
        nativeFocus.call(this, options);
      } finally {
        handoff -= 1;
      }

      return;
    }

    if (handoff > 0 || incoming || mesurerHoldsFocus()) return;
    nativeFocus.call(this, options);
  };

  const setOwned = (next: boolean) => {
    owned = next;
    setKeyboardOwned(ownerWindow, next);
  };

  const stopAtBoundary = (event: Event) => event.stopPropagation();

  const markReached = (event: Event, node: "window" | "document") => {
    if (reached?.event !== event) reached = { event, window: false, document: false };
    reached[node] = true;
  };

  const onTypingDocument = (event: Event) => markReached(event, "document");

  const onTyping = (event: Event) => {
    markReached(event, "window");

    if (event instanceof realm.KeyboardEvent && event.key === "Escape") return;
    const active = getDeepActiveElement(ownerWindow);

    if (!isEditableElement(active, ownerWindow) || !isInsideMesurer(active, ownerWindow)) return;
    // Mesurer UI is either inside the island or a document-backed inspector mount; stop above whichever is outermost.
    const boundary = event.composedPath().findLast((node) => isMesurerBoundaryNode(node, ownerWindow));

    boundary?.addEventListener(event.type, stopAtBoundary, { once: true });
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!hasMesurerBoundary(event)) {
      incoming = false;
      setOwned(false);

      return;
    }

    setOwned(true);
    incoming = true;
  };

  const onPointerEnd = () => { incoming = false; };

  const onBlur = (event: FocusEvent) => {
    if (isInsideMesurer(event.relatedTarget, ownerWindow)) incoming = true;
  };

  const onFocusIn = (event: FocusEvent) => {
    incoming = false;
    setOwned(hasMesurerBoundary(event));
  };

  for (const type of TYPING_EVENTS) {
    ownerWindow.addEventListener(type, onTyping, true);
    ownerDocument.addEventListener(type, onTypingDocument, true);
  }

  ownerWindow.addEventListener("pointerdown", onPointerDown, true);
  ownerWindow.addEventListener("pointerup", onPointerEnd, true);
  ownerWindow.addEventListener("pointercancel", onPointerEnd, true);
  ownerWindow.addEventListener("blur", onBlur, true);
  ownerWindow.addEventListener("focusin", onFocusIn, true);
  eventPrototype.preventDefault = preventDefault;
  eventPrototype.stopPropagation = stopPropagation;
  eventPrototype.stopImmediatePropagation = stopImmediatePropagation;
  elementPrototype.focus = focus;

  return () => {
    disposed = true;

    for (const type of TYPING_EVENTS) {
      ownerWindow.removeEventListener(type, onTyping, true);
      ownerDocument.removeEventListener(type, onTypingDocument, true);
    }

    ownerWindow.removeEventListener("pointerdown", onPointerDown, true);
    ownerWindow.removeEventListener("pointerup", onPointerEnd, true);
    ownerWindow.removeEventListener("pointercancel", onPointerEnd, true);
    ownerWindow.removeEventListener("blur", onBlur, true);
    ownerWindow.removeEventListener("focusin", onFocusIn, true);

    // A wrapper another library put on top stays in the chain; it now delegates straight to the native method.
    if (eventPrototype.preventDefault === preventDefault) eventPrototype.preventDefault = nativePreventDefault;

    if (eventPrototype.stopPropagation === stopPropagation) eventPrototype.stopPropagation = nativeStopPropagation;

    if (eventPrototype.stopImmediatePropagation === stopImmediatePropagation) {
      eventPrototype.stopImmediatePropagation = nativeStopImmediatePropagation;
    }

    if (elementPrototype.focus === focus) elementPrototype.focus = nativeFocus;
    reached = null;
    incoming = false;
    handoff = 0;
    setOwned(false);
  };
}
