// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import {
  makeBox,
  makeCard,
  populateCard,
  positionBox,
  positionCard,
  type InspectorBox,
  type InspectorCard,
} from "./text-inspector-dom";
import {
  TypographyInspector,
  type TypographyInfo,
} from "./text-inspector-typography";
import { hasNativeScrollAnchoring } from "./native-scroll-registry";

const DEFAULT_SKIP_TAGS = [
  "HTML", "BODY", "SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT",
  "IMG", "VIDEO", "AUDIO", "IFRAME",
];
const FILL_HOVER = "color-mix(in oklch, oklch(0.62 0.18 255) 8%, transparent)";
const OUTLINE_HOVER = "color-mix(in oklch, oklch(0.62 0.18 255) 80%, transparent)";
const FILL_PINNED = "color-mix(in oklch, oklch(0.62 0.18 255) 4%, transparent)";
const OUTLINE_PINNED = "color-mix(in oklch, oklch(0.62 0.18 255) 35%, transparent)";
const NATIVE_SCROLL_SETTLE_MS = 80;
let instanceCount = 0;

type PinSnapshot = {
  sourceEl: HTMLElement;
  left: number;
  top: number;
  userPlaced: boolean;
};
type Pin = PinSnapshot & {
  box: InspectorBox;
  card: InspectorCard;
  detach: () => void;
};

export type TextInspectorAPI = {
  enable: () => void;
  disable: () => void;
  undo: () => boolean;
  redo: () => boolean;
  isEnabled: () => boolean;
  cleanup: () => void;
  destroy: () => void;
  clear: () => void;
  inspect: (element: HTMLElement) => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export type TextInspectorOptions = {
  id?: string;
  ignoredTags?: readonly string[];
  maxPinned?: number;
  portalTarget?: HTMLElement | ShadowRoot;
  onInspect?: (element: HTMLElement, info: TypographyInfo) => void;
  onPin?: (element: HTMLElement, info: TypographyInfo) => void;
  onUnpin?: (element: HTMLElement) => void;
};

const styles = (mode: string, overlayId: string) => `
.${mode},.${mode} *{cursor:help!important}
.${mode} [data-mesurer-root],.${mode} [data-mesurer-root] *{cursor:auto!important}
#${overlayId} .mesurer-ti-card{transform:translateX(-50%);opacity:1;transition:none!important;animation:none!important}
#${overlayId} .mesurer-ti-box{opacity:1;transition:none!important;animation:none!important}
#${overlayId} [data-state="hidden"]{opacity:0!important}
#${overlayId} .mesurer-ti-card--draggable{cursor:grab}
#${overlayId} .mesurer-ti-card--draggable:active{cursor:grabbing}
#${overlayId} .mesurer-ti-close{cursor:pointer}
#${overlayId} .mesurer-ti-close:hover{background:rgba(15,23,42,.06)!important;color:#0f172a!important}
`;

export function createTextInspector(options: TextInspectorOptions = {}, legacy = false): TextInspectorAPI {
  const doc = options.portalTarget?.ownerDocument ?? globalThis.document;
  const win = doc?.defaultView ?? globalThis.window;
  if (!doc || !win) {
    const noop = () => {};
    return {
      enable: noop, disable: noop, undo: () => false, redo: () => false,
      isEnabled: () => false, cleanup: noop, destroy: noop, clear: noop,
      inspect: () => false, canUndo: () => false, canRedo: () => false,
    };
  }

  const id = (options.id ?? (legacy ? "mesurer-text-inspector" : `mesurer-text-inspector-${++instanceCount}`))
    .replace(/[^a-zA-Z0-9_-]/g, "-");
  const overlayId = `${id}-overlay`;
  const styleId = `${id}-styles`;
  const modeClass = `${id}-mode`;
  const ignored = new Set((options.ignoredTags ?? DEFAULT_SKIP_TAGS).map((tag) => tag.toUpperCase()));
  const maxPinned = Number.isFinite(options.maxPinned) ? Math.max(1, Math.floor(options.maxPinned!)) : Infinity;
  const typography = new TypographyInspector(doc, win);
  const HTMLElementCtor = win.HTMLElement;
  const SVGElementCtor = win.SVGElement;
  const NodeCtor = win.Node;

  let enabled = false;
  let overlay: HTMLDivElement | null = null;
  let hoverBox: InspectorBox | null = null;
  let hoverCard: InspectorCard | null = null;
  let hoveredEl: HTMLElement | null = null;
  let pointer = { x: 0, y: 0 };
  let raf = 0;
  let enrichmentTimer = 0;
  let scrollIdleTimer = 0;
  let scrollX = win.scrollX;
  let scrollY = win.scrollY;
  const pins: Pin[] = [];
  const history: PinSnapshot[][] = [];
  const future: PinSnapshot[][] = [];

  const portal = options.portalTarget ?? doc.body;
  const ensureStyles = () => {
    const roots: Array<Document | ShadowRoot> = [doc];
    if (portal instanceof win.ShadowRoot) roots.push(portal);
    for (const root of roots) {
      if (root.querySelector(`#${styleId}`)) continue;
      const style = doc.createElement("style");
      style.id = styleId;
      style.textContent = styles(modeClass, overlayId);
      if (root === doc) doc.head.append(style);
      else root.append(style);
    }
  };
  const ensureOverlay = () => {
    if (overlay?.isConnected) return overlay;
    overlay = doc.createElement("div");
    overlay.id = overlayId;
    overlay.dataset.mesurerInspectorUi = "true";
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483646",
    });
    portal.appendChild(overlay);
    return overlay;
  };
  const visible = (el: HTMLElement | null, value: boolean) => {
    if (el) el.dataset.state = value ? "visible" : "hidden";
  };
  const ensureHover = () => {
    const root = ensureOverlay();
    hoverBox ??= makeBox(doc, FILL_HOVER, OUTLINE_HOVER);
    hoverCard ??= makeCard(doc, false);
    if (!hoverBox.parentNode) root.append(hoverBox);
    if (!hoverCard.parentNode) root.append(hoverCard);
  };
  const hasDirectText = (el: Element) => Array.from(el.childNodes).some(
    (node) => node.nodeType === NodeCtor.TEXT_NODE && !!node.nodeValue?.trim(),
  );
  const inspectable = (el: Element | null): el is HTMLElement =>
    !!el && el instanceof HTMLElementCtor && !(el instanceof SVGElementCtor) &&
    !ignored.has(el.tagName) && hasDirectText(el) && !el.closest("[data-mesurer-root]");

  const pick = (x: number, y: number) =>
    doc.elementsFromPoint(x, y).find((el): el is HTMLElement => inspectable(el)) ?? null;

  const hideHover = () => {
    hoveredEl = null;
    visible(hoverBox, false);
    visible(hoverCard, false);
  };

  const inspect = (element: HTMLElement) => {
    if (!enabled || !inspectable(element)) return false;
    ensureHover();
    const rect = element.getBoundingClientRect();
    const fast = typography.getFast(element);
    hoveredEl = element;
    populateCard(doc, hoverCard!, fast, false);
    positionBox(hoverBox!, rect);
    positionCard(win, hoverCard!, rect);
    visible(hoverBox, true);
    visible(hoverCard, true);
    win.clearTimeout(enrichmentTimer);
    enrichmentTimer = win.setTimeout(() => {
      if (!enabled || hoveredEl !== element || !hoverCard) return;
      const full = typography.getFull(element, fast);
      populateCard(doc, hoverCard, full, false);
      positionCard(win, hoverCard, element.getBoundingClientRect());
      options.onInspect?.(element, full);
    }, 24);
    return true;
  };

  const snapshot = (): PinSnapshot[] => pins.map((pin) => ({
    sourceEl: pin.sourceEl,
    left: pin.userPlaced ? pin.card.getBoundingClientRect().left + pin.card.getBoundingClientRect().width / 2 : 0,
    top: pin.userPlaced ? pin.card.getBoundingClientRect().top : 0,
    userPlaced: pin.userPlaced,
  }));
  const record = () => { history.push(snapshot()); if (history.length > 100) history.shift(); future.length = 0; };

  const removePin = (pin: Pin, shouldRecord = true, notify = true) => {
    const index = pins.indexOf(pin);
    if (index < 0) return;
    if (shouldRecord) record();
    pins.splice(index, 1);
    pin.detach();
    pin.box.remove();
    pin.card.remove();
    if (notify) options.onUnpin?.(pin.sourceEl);
  };
  const clearPins = (notify = false) => {
    while (pins.length) removePin(pins[pins.length - 1], false, notify);
  };

  const attachDrag = (pin: Pin) => {
    let pointerId = -1;
    let sx = 0, sy = 0, ox = 0, oy = 0;
    let active = false, recorded = false;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - sx, dy = event.clientY - sy;
      if (!active && Math.abs(dx) <= 6 && Math.abs(dy) <= 6) return;
      if (!active) {
        active = true;
        pin.card.classList.add("mesurer-ti-card--pinned");
        delete pin.card.dataset.mesurerNativeScrollAnchor;
        delete pin.card.dataset.mesurerNativeScrollOwner;
        pin.card.style.removeProperty("position-anchor");
      }
      if (!recorded) { record(); recorded = true; }
      pin.userPlaced = true;
      pin.card.style.left = `${Math.min(win.innerWidth - 8, Math.max(8, ox + dx))}px`;
      pin.card.style.top = `${Math.min(win.innerHeight - 8, Math.max(8, oy + dy))}px`;
    };
    const end = (event: PointerEvent) => {
      if (pointerId !== -1 && event.pointerId !== pointerId) return;
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", end);
      win.removeEventListener("pointercancel", end);
      pointerId = -1; active = false; recorded = false;
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || (event.target instanceof HTMLElementCtor && event.target.classList.contains("mesurer-ti-close"))) return;
      const rect = pin.card.getBoundingClientRect();
      pointerId = event.pointerId; sx = event.clientX; sy = event.clientY;
      ox = rect.left + rect.width / 2; oy = rect.top;
      win.addEventListener("pointermove", move);
      win.addEventListener("pointerup", end);
      win.addEventListener("pointercancel", end);
    };
    pin.card.addEventListener("pointerdown", down);
    return () => {
      pin.card.removeEventListener("pointerdown", down);
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", end);
      win.removeEventListener("pointercancel", end);
    };
  };

  const createPin = (sourceEl: HTMLElement, state?: PinSnapshot, shouldRecord = true, notify = true) => {
    const existing = pins.find((pin) => pin.sourceEl === sourceEl);
    if (existing) return;
    if (shouldRecord) record();
    if (pins.length >= maxPinned) removePin(pins[0], false, true);
    const root = ensureOverlay();
    const box = makeBox(doc, FILL_PINNED, OUTLINE_PINNED);
    const card = makeCard(doc, true);
    card.classList.add("mesurer-ti-card--draggable");
    card.classList.remove("mesurer-ti-card--pinned");
    const info = typography.getFull(sourceEl);
    populateCard(doc, card, info, true);
    root.append(box, card);
    const rect = sourceEl.getBoundingClientRect();
    positionBox(box, rect);
    positionCard(win, card, rect);
    if (state?.userPlaced) {
      card.classList.add("mesurer-ti-card--pinned");
      card.style.left = `${state.left}px`;
      card.style.top = `${state.top}px`;
    }
    visible(box, true); visible(card, true);
    const pin: Pin = {
      sourceEl, box, card,
      left: state?.left ?? 0,
      top: state?.top ?? 0,
      userPlaced: state?.userPlaced ?? false,
      detach: () => {},
    };
    pins.push(pin);
    pin.detach = attachDrag(pin);
    card.querySelector<HTMLButtonElement>(".mesurer-ti-close")?.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation(); removePin(pin);
    });
    if (notify) options.onPin?.(sourceEl, info);
  };

  const restore = (states: PinSnapshot[]) => {
    clearPins(false);
    for (const state of states) if (state.sourceEl.isConnected) createPin(state.sourceEl, state, false, false);
  };
  const undo = () => { const previous = history.pop(); if (!previous) return false; future.push(snapshot()); restore(previous); return true; };
  const redo = () => { const next = future.pop(); if (!next) return false; history.push(snapshot()); restore(next); return true; };
  const clear = () => { if (!pins.length) return; record(); clearPins(true); };

  const syncPins = () => {
    for (const pin of pins.slice()) {
      if (!pin.sourceEl.isConnected) { removePin(pin, false, false); continue; }
      const rect = pin.sourceEl.getBoundingClientRect();
      positionBox(pin.box, rect);
      if (!pin.userPlaced) positionCard(win, pin.card, rect);
      const isVisible = rect.bottom >= 0 && rect.right >= 0 && rect.left <= win.innerWidth && rect.top <= win.innerHeight;
      visible(pin.box, isVisible); visible(pin.card, isVisible);
      pin.card.style.pointerEvents = isVisible ? "auto" : "none";
    }
  };

  const syncCurrentGeometry = () => {
    if (!enabled) return;
    if (hoveredEl && hoverBox && hoverCard) {
      if (!hoveredEl.isConnected) {
        hideHover();
      } else {
        const rect = hoveredEl.getBoundingClientRect();
        positionBox(hoverBox, rect);
        positionCard(win, hoverCard, rect);
        const isVisible = rect.bottom >= 0 && rect.right >= 0 && rect.left <= win.innerWidth && rect.top <= win.innerHeight;
        visible(hoverBox, isVisible); visible(hoverCard, isVisible);
      }
    }
    syncPins();
  };

  const sync = () => {
    if (!enabled) return;
    const target = pick(pointer.x, pointer.y);
    if (!target) hideHover();
    else if (target !== hoveredEl) inspect(target);
    else if (hoverBox && hoverCard) {
      const rect = target.getBoundingClientRect();
      positionBox(hoverBox, rect); positionCard(win, hoverCard, rect);
    }
    syncPins();
  };
  const schedule = () => {
    if (raf) return;
    raf = win.requestAnimationFrame(() => { raf = 0; sync(); });
  };
  const onMove = (event: MouseEvent) => { pointer = { x: event.clientX, y: event.clientY }; schedule(); };
  const shiftFallback = (element: HTMLElement | null, dx: number, dy: number) => {
    if (!element || element.dataset.mesurerNativeScrollAnchor) return;
    const left = Number.parseFloat(element.style.left);
    const top = Number.parseFloat(element.style.top);
    if (Number.isFinite(left)) element.style.left = `${left - dx}px`;
    if (Number.isFinite(top)) element.style.top = `${top - dy}px`;
  };
  const onScroll = () => {
    const nextX = win.scrollX;
    const nextY = win.scrollY;
    const dx = nextX - scrollX;
    const dy = nextY - scrollY;
    scrollX = nextX;
    scrollY = nextY;
    const nativeDocumentScroll = portal === doc.body && hasNativeScrollAnchoring(doc);
    if (nativeDocumentScroll) {
      // A newly shown Typography surface can exist for one task before the
      // document anchor coordinator claims it. Keep that fallback glued to its
      // current target with scroll-delta arithmetic only; never read layout in
      // the hot scroll path. Once CSS anchoring is present these writes stop.
      if (dx || dy) {
        shiftFallback(hoverBox, dx, dy);
        shiftFallback(hoverCard, dx, dy);
        // Updating pinned surfaces is inherently O(p): each of p visible pins
        // is an independently rendered output. It is independent of page DOM size.
        for (const pin of pins) {
          shiftFallback(pin.box, dx, dy);
          if (!pin.userPlaced) shiftFallback(pin.card, dx, dy);
        }
      }
      if (scrollIdleTimer) win.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = win.setTimeout(() => {
        scrollIdleTimer = 0;
        syncCurrentGeometry();
      }, NATIVE_SCROLL_SETTLE_MS);
      return;
    }

    // Fallback environments without document CSS anchoring still need the
    // legacy event-time geometry path.
    syncCurrentGeometry();
    schedule();
  };
  const onOut = (event: MouseEvent) => { if (!event.relatedTarget) hideHover(); };
  const uiEvent = (event: Event) => event.composedPath().some((node) =>
    node instanceof HTMLElementCtor && (
      node.id === overlayId || node.hasAttribute("data-mesurer-root") ||
      node.classList.contains("mesurer-ti-card") || node.classList.contains("mesurer-ti-close")
    ),
  );
  const onClick = (event: MouseEvent) => {
    if (uiEvent(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.button === 0) {
      const target = pick(event.clientX, event.clientY);
      if (target) createPin(target);
    }
  };
  const onAux = (event: MouseEvent) => {
    if (uiEvent(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };

  const enable = () => {
    if (enabled) return;
    enabled = true; ensureStyles(); ensureOverlay(); doc.body.classList.add(modeClass);
    scrollX = win.scrollX; scrollY = win.scrollY;
    win.addEventListener("mousemove", onMove, true);
    win.addEventListener("mouseout", onOut, true);
    win.addEventListener("click", onClick, true);
    win.addEventListener("auxclick", onAux, true);
    win.addEventListener("scroll", onScroll, { capture: true, passive: true });
    win.addEventListener("resize", schedule, true);
  };
  const disable = () => {
    if (!enabled) return;
    enabled = false;
    win.cancelAnimationFrame(raf); raf = 0; win.clearTimeout(enrichmentTimer); win.clearTimeout(scrollIdleTimer); scrollIdleTimer = 0;
    win.removeEventListener("mousemove", onMove, true);
    win.removeEventListener("mouseout", onOut, true);
    win.removeEventListener("click", onClick, true);
    win.removeEventListener("auxclick", onAux, true);
    win.removeEventListener("scroll", onScroll, true);
    win.removeEventListener("resize", schedule, true);
    hideHover(); clearPins();
    hoverBox?.remove(); hoverCard?.remove(); hoverBox = null; hoverCard = null;
    history.length = 0; future.length = 0;
    doc.body.classList.remove(modeClass);
  };
  const cleanup = () => {
    disable(); overlay?.remove(); overlay = null;
    doc.getElementById(styleId)?.remove();
    if (portal instanceof win.ShadowRoot) portal.querySelector(`#${styleId}`)?.remove();
  };

  return {
    enable, disable, undo, redo, clear, inspect,
    isEnabled: () => enabled,
    canUndo: () => history.length > 0,
    canRedo: () => future.length > 0,
    cleanup, destroy: cleanup,
  };
}

export const TextInspector = createTextInspector({}, true);
