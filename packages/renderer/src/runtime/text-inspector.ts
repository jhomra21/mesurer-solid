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

const DEFAULT_SKIP_TAGS = [
  "HTML", "BODY", "SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT",
  "IMG", "VIDEO", "AUDIO", "IFRAME",
];
const FILL_HOVER = "color-mix(in oklch, oklch(0.62 0.18 255) 8%, transparent)";
const OUTLINE_HOVER = "color-mix(in oklch, oklch(0.62 0.18 255) 80%, transparent)";
const FILL_PINNED = "color-mix(in oklch, oklch(0.62 0.18 255) 4%, transparent)";
const OUTLINE_PINNED = "color-mix(in oklch, oklch(0.62 0.18 255) 35%, transparent)";
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
#${overlayId} .mesurer-ti-card{transform:translateX(-50%);opacity:1}
#${overlayId} .mesurer-ti-box{opacity:1}
#${overlayId} [data-state="hidden"]{opacity:0!important}
#${overlayId} .mesurer-ti-card--pinned{cursor:grab}
#${overlayId} .mesurer-ti-card--pinned:active{cursor:grabbing}
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
  const pins: Pin[] = [];
  const history: PinSnapshot[][] = [];
  const future: PinSnapshot[][] = [];

  const portal = options.portalTarget ?? doc.body;
  const ensureStyles = () => {
    const roots: Array<Document | ShadowRoot> = [doc];
    if (portal.nodeType === 11) roots.push(portal as ShadowRoot);
    for (const root of roots) {
      if (root.querySelector(`#${styleId}`)) continue;
      const style = doc.createElement("style");
      style.id = styleId;
      style.textContent = styles(modeClass, overlayId);
      if (root.nodeType === 9) (root as Document).head.append(style);
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
      active = true;
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
      if (event.button !== 0 || (event.target as HTMLElement | null)?.classList.contains("mesurer-ti-close")) return;
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
    const info = typography.getFull(sourceEl);
    populateCard(doc, card, info, true);
    root.append(box, card);
    const rect = sourceEl.getBoundingClientRect();
    positionBox(box, rect);
    positionCard(win, card, rect);
    if (state?.userPlaced) {
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

  const sync = () => {
    if (!enabled) return;
    const target = pick(pointer.x, pointer.y);
    if (!target) hideHover();
    else if (target !== hoveredEl) inspect(target);
    else if (hoverBox && hoverCard) {
      const rect = target.getBoundingClientRect();
      positionBox(hoverBox, rect); positionCard(win, hoverCard, rect);
    }
    for (const pin of [...pins]) {
      if (!pin.sourceEl.isConnected) { removePin(pin, false, false); continue; }
      const rect = pin.sourceEl.getBoundingClientRect();
      positionBox(pin.box, rect);
      if (!pin.userPlaced) positionCard(win, pin.card, rect);
      const isVisible = rect.bottom >= 0 && rect.right >= 0 && rect.left <= win.innerWidth && rect.top <= win.innerHeight;
      visible(pin.box, isVisible); visible(pin.card, isVisible);
      pin.card.style.pointerEvents = isVisible ? "auto" : "none";
    }
  };
  const schedule = () => {
    if (raf) return;
    raf = win.requestAnimationFrame(() => { raf = 0; sync(); });
  };
  const onMove = (event: MouseEvent) => { pointer = { x: event.clientX, y: event.clientY }; schedule(); };
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
    win.addEventListener("mousemove", onMove, true);
    win.addEventListener("mouseout", onOut, true);
    win.addEventListener("click", onClick, true);
    win.addEventListener("auxclick", onAux, true);
    win.addEventListener("scroll", schedule, true);
    win.addEventListener("resize", schedule, true);
  };
  const disable = () => {
    if (!enabled) return;
    enabled = false;
    win.cancelAnimationFrame(raf); raf = 0; win.clearTimeout(enrichmentTimer);
    win.removeEventListener("mousemove", onMove, true);
    win.removeEventListener("mouseout", onOut, true);
    win.removeEventListener("click", onClick, true);
    win.removeEventListener("auxclick", onAux, true);
    win.removeEventListener("scroll", schedule, true);
    win.removeEventListener("resize", schedule, true);
    hideHover(); clearPins();
    hoverBox?.remove(); hoverCard?.remove(); hoverBox = null; hoverCard = null;
    history.length = 0; future.length = 0;
    doc.body.classList.remove(modeClass);
  };
  const cleanup = () => {
    disable(); overlay?.remove(); overlay = null;
    doc.getElementById(styleId)?.remove();
    if (portal.nodeType === 11) (portal as ShadowRoot).querySelector(`#${styleId}`)?.remove();
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
