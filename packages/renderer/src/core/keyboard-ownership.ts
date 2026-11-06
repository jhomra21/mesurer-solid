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
 * - Ownership (set by pressing or focusing Mesurer UI, cleared by pressing the page) makes page
 *   `focus()` calls no-ops, so a prompt that refocuses itself on blur cannot take focus back from
 *   Mesurer, and stops a page editor from disabling shortcuts.
 * - While Mesurer owns the keyboard, `preventDefault`/`stopPropagation` calls on typing events
 *   made before Mesurer's first window-capture listener ran (host code registered before mount)
 *   are ignored. A window-capture listener registered earlier always runs first, so Mesurer
 *   cannot beat it by ordering, only by making its cancellation inert.
 * - Keys typed in a Mesurer field stop at the outermost Mesurer node, so host document listeners never see them.
 *   Escape continues, because Mesurer's lifecycle handler listens on window.
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
  const eventPrototype = realm.Event.prototype;
  const elementPrototype = realm.HTMLElement.prototype;
  const nativePreventDefault = eventPrototype.preventDefault;
  const nativeStopPropagation = eventPrototype.stopPropagation;
  const nativeStopImmediatePropagation = eventPrototype.stopImmediatePropagation;
  const nativeFocus = elementPrototype.focus;
  let owned = false;
  let seen: Event | null = null;

  const isTypingEvent = (event: Event) =>
    event instanceof realm.KeyboardEvent
    || event instanceof realm.InputEvent
    || event instanceof realm.CompositionEvent
    || event instanceof realm.ClipboardEvent;

  const hostMaySwallow = (event: Event) =>
    seen !== event
    && isTypingEvent(event)
    && (owned || isInsideMesurer(getDeepActiveElement(ownerWindow), ownerWindow));

  const preventDefault = function (this: Event) {
    if (!hostMaySwallow(this)) nativePreventDefault.call(this);
  };

  const stopPropagation = function (this: Event) {
    if (!hostMaySwallow(this)) nativeStopPropagation.call(this);
  };

  const stopImmediatePropagation = function (this: Event) {
    if (!hostMaySwallow(this)) nativeStopImmediatePropagation.call(this);
  };

  const focus = function (this: HTMLElement, options?: FocusOptions) {
    // Mesurer focusing its own field (the direct text editor lives in the page) claims the keyboard
    // before the page's blur handler gets a chance to take focus back.
    if (isInsideMesurer(this, ownerWindow)) setOwned(true);

    if (!owned || isInsideMesurer(this, ownerWindow)) nativeFocus.call(this, options);
  };

  const setOwned = (next: boolean) => {
    owned = next;
    setKeyboardOwned(ownerWindow, next);
  };

  const stopAtBoundary = (event: Event) => event.stopPropagation();

  const onTyping = (event: Event) => {
    seen = event;

    if (event instanceof realm.KeyboardEvent && event.key === "Escape") return;
    const active = getDeepActiveElement(ownerWindow);

    if (!isEditableElement(active, ownerWindow) || !isInsideMesurer(active, ownerWindow)) return;
    // Mesurer UI is either inside the island or a document-backed inspector mount; stop above whichever is outermost.
    const boundary = event.composedPath().findLast((node) => isMesurerBoundaryNode(node, ownerWindow));

    boundary?.addEventListener(event.type, stopAtBoundary, { once: true });
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!event.composedPath().some((node) => isMesurerBoundaryNode(node, ownerWindow))) {
      setOwned(false);

      return;
    }

    setOwned(true);
    const active = getDeepActiveElement(ownerWindow);

    // Mesurer controls may cancel pointerdown, which would leave the page editor focused.
    if (active instanceof realm.HTMLElement
      && active !== ownerWindow.document.body
      && !isInsideMesurer(active, ownerWindow)) active.blur();
  };

  const onFocusIn = (event: FocusEvent) => {
    if (event.composedPath().some((node) => isMesurerBoundaryNode(node, ownerWindow))) setOwned(true);
  };

  for (const type of TYPING_EVENTS) ownerWindow.addEventListener(type, onTyping, true);
  ownerWindow.addEventListener("pointerdown", onPointerDown, true);
  ownerWindow.addEventListener("focusin", onFocusIn, true);
  eventPrototype.preventDefault = preventDefault;
  eventPrototype.stopPropagation = stopPropagation;
  eventPrototype.stopImmediatePropagation = stopImmediatePropagation;
  elementPrototype.focus = focus;

  return () => {
    for (const type of TYPING_EVENTS) ownerWindow.removeEventListener(type, onTyping, true);
    ownerWindow.removeEventListener("pointerdown", onPointerDown, true);
    ownerWindow.removeEventListener("focusin", onFocusIn, true);

    if (eventPrototype.preventDefault === preventDefault) eventPrototype.preventDefault = nativePreventDefault;

    if (eventPrototype.stopPropagation === stopPropagation) eventPrototype.stopPropagation = nativeStopPropagation;

    if (eventPrototype.stopImmediatePropagation === stopImmediatePropagation) {
      eventPrototype.stopImmediatePropagation = nativeStopImmediatePropagation;
    }

    if (elementPrototype.focus === focus) elementPrototype.focus = nativeFocus;
    setOwned(false);
  };
}
