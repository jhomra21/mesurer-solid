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
const TOOLBAR_BLUE = "#0d99ff";
const TOOLBAR_INK = "#0f172a";
const TOOLBAR_SHADOW =
  "0 0 0.5px rgba(0, 0, 0, 0.18), 0 3px 8px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.1)";
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

type DirectEditPreview = {
  editor: HTMLTextAreaElement;
  sourceEl: HTMLElement;
  card: InspectorCard;
  sourceObserver: MutationObserver;
  toolbarObserver: MutationObserver | null;
  frame: number;
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

  const realm = win as Window & typeof globalThis;
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
  const HTMLTextAreaElementCtor = realm.HTMLTextAreaElement;

  let enabled = false;
  let overlay: HTMLDivElement | null = null;
  let hoverBox: InspectorBox | null = null;
  let hoverCard: InspectorCard | null = null;
  let hoveredEl: HTMLElement | null = null;
  let pointer = { x: 0, y: 0 };
  let raf = 0;
  let enrichmentTimer = 0;
  let directEditPreview: DirectEditPreview | null = null;
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

  const toolbarRoot = (editor: HTMLTextAreaElement) => {
    const root = editor.getRootNode();
    return root instanceof realm.Document || root instanceof realm.ShadowRoot ? root : null;
  };

  const styleToolbarButton = (button: HTMLButtonElement) => {
    const previous = button.dataset.mesurerTextStyleActive;
    const originalBackground = button.style.background.trim();
    const active = previous === "true"
      || (previous !== "false"
        && originalBackground !== ""
        && originalBackground !== "transparent"
        && originalBackground !== "rgba(0, 0, 0, 0)");
    button.dataset.mesurerTextStyleActive = active ? "true" : "false";
    button.setAttribute("aria-pressed", active ? "true" : "false");
    Object.assign(button.style, {
      width: "32px",
      height: "32px",
      border: "0",
      borderRadius: "8px",
      background: active ? TOOLBAR_BLUE : "transparent",
      color: active ? "#ffffff" : "#000000",
      font: "600 13px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      cursor: "pointer",
      outline: "none",
    });
    button.onmouseenter = () => {
      if (button.dataset.mesurerTextStyleActive !== "true") button.style.background = "rgba(0, 0, 0, 0.04)";
    };
    button.onmouseleave = () => {
      button.style.background = button.dataset.mesurerTextStyleActive === "true" ? TOOLBAR_BLUE : "transparent";
    };
  };

  const styleToolbarSelect = (select: HTMLSelectElement) => {
    Object.assign(select.style, {
      height: "32px",
      maxWidth: select.dataset.mesurerTextStyleSelect === "font-family" ? "128px" : "72px",
      border: "0",
      borderRadius: "8px",
      background: "transparent",
      color: TOOLBAR_INK,
      font: "500 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      padding: "0 8px",
      cursor: "pointer",
      outline: "none",
    });
    select.onmouseenter = () => { select.style.background = "rgba(0, 0, 0, 0.04)"; };
    select.onmouseleave = () => { select.style.background = "transparent"; };
  };

  const styleDirectEditToolbar = (toolbar: HTMLElement) => {
    toolbar.classList.add("mesurer-toolbar-surface");
    toolbar.dataset.mesurerTextStyleSurface = "toolbar";
    Object.assign(toolbar.style, {
      display: "flex",
      alignItems: "center",
      flexWrap: "nowrap",
      gap: "4px",
      maxWidth: "calc(100vw - 16px)",
      padding: "4px",
      borderRadius: "12px",
      background: "#ffffff",
      color: TOOLBAR_INK,
      boxShadow: TOOLBAR_SHADOW,
    });

    for (const button of toolbar.querySelectorAll<HTMLButtonElement>("[data-mesurer-text-style-button]")) {
      styleToolbarButton(button);
    }
    for (const select of toolbar.querySelectorAll<HTMLSelectElement>("[data-mesurer-text-style-select]")) {
      styleToolbarSelect(select);
    }

    const swatches = toolbar.querySelector<HTMLElement>("[data-mesurer-text-color-swatches='true']");
    if (swatches) {
      Object.assign(swatches.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        marginLeft: "2px",
        paddingLeft: "8px",
        borderLeft: "1px solid rgba(0, 0, 0, 0.10)",
      });
      const colorButtons = [...swatches.querySelectorAll<HTMLButtonElement>("[data-mesurer-text-color]")];
      colorButtons.forEach((swatch, index) => {
        const selected = swatch.style.borderWidth === "2px";
        Object.assign(swatch.style, {
          display: index < 6 ? "block" : "none",
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          border: selected ? `2px solid ${TOOLBAR_BLUE}` : "1px solid rgba(0, 0, 0, 0.18)",
          cursor: "pointer",
          padding: "0",
        });
      });
    }

    const customColor = toolbar.querySelector<HTMLInputElement>("[data-mesurer-text-custom-color='true']");
    if (customColor) {
      Object.assign(customColor.style, {
        width: "32px",
        height: "32px",
        border: "0",
        borderRadius: "8px",
        background: "transparent",
        padding: "5px",
        cursor: "pointer",
      });
      customColor.onmouseenter = () => { customColor.style.background = "rgba(0, 0, 0, 0.04)"; };
      customColor.onmouseleave = () => { customColor.style.background = "transparent"; };
    }
  };

  const findDirectEditTarget = (editor: HTMLTextAreaElement) => {
    const rect = editor.getBoundingClientRect();
    const pointerEvents = editor.style.pointerEvents;
    editor.style.pointerEvents = "none";
    const target = pick(rect.left + rect.width / 2, rect.top + rect.height / 2);
    editor.style.pointerEvents = pointerEvents;
    return target;
  };

  const positionDirectEditCard = (preview: DirectEditPreview) => {
    const card = preview.card;
    const editorRect = preview.editor.getBoundingClientRect();
    const root = toolbarRoot(preview.editor);
    const toolbar = root?.querySelector<HTMLElement>("[data-mesurer-text-style-toolbar='true']") ?? null;
    const anchor = toolbar?.getBoundingClientRect() ?? editorRect;
    const cardRect = card.getBoundingClientRect();
    const half = cardRect.width / 2;
    const center = Math.min(
      Math.max(anchor.left + anchor.width / 2, 8 + half),
      win.innerWidth - 8 - half,
    );
    let top = anchor.bottom + 8;
    if (top + cardRect.height > win.innerHeight - 8) {
      top = Math.max(8, editorRect.top - cardRect.height - 8);
    }
    card.style.left = `${center}px`;
    card.style.top = `${top}px`;
  };

  const clearDirectEditPreview = () => {
    const preview = directEditPreview;
    if (!preview) return;
    if (preview.frame) win.cancelAnimationFrame(preview.frame);
    preview.sourceObserver.disconnect();
    preview.toolbarObserver?.disconnect();
    preview.card.remove();
    directEditPreview = null;
  };

  const refreshDirectEditPreview = () => {
    const preview = directEditPreview;
    if (!preview) return;
    preview.frame = 0;
    if (!preview.editor.isConnected || !preview.sourceEl.isConnected) {
      clearDirectEditPreview();
      return;
    }
    const root = toolbarRoot(preview.editor);
    const toolbar = root?.querySelector<HTMLElement>("[data-mesurer-text-style-toolbar='true']") ?? null;
    if (toolbar) styleDirectEditToolbar(toolbar);
    populateCard(doc, preview.card, typography.getFull(preview.sourceEl), false);
    preview.card.dataset.mesurerTextInspectorInfo = "true";
    preview.card.setAttribute("aria-label", "Text inspector");
    preview.card.style.zIndex = "2147483647";
    preview.card.style.pointerEvents = "none";
    visible(preview.card, true);
    positionDirectEditCard(preview);
  };

  const scheduleDirectEditPreview = () => {
    const preview = directEditPreview;
    if (!preview || preview.frame) return;
    preview.frame = win.requestAnimationFrame(refreshDirectEditPreview);
  };

  const beginDirectEditPreview = (editor: HTMLTextAreaElement) => {
    if (directEditPreview?.editor === editor) {
      scheduleDirectEditPreview();
      return;
    }
    clearDirectEditPreview();
    const sourceEl = findDirectEditTarget(editor);
    if (!sourceEl) return;
    hideHover();
    ensureStyles();
    const root = ensureOverlay();
    const card = makeCard(doc, false);
    card.dataset.mesurerTextInspectorInfo = "true";
    card.setAttribute("aria-label", "Text inspector");
    root.append(card);

    const sourceObserver = new realm.MutationObserver(scheduleDirectEditPreview);
    sourceObserver.observe(sourceEl, {
      attributes: true,
      attributeFilter: ["class", "style"],
      childList: true,
      characterData: true,
      subtree: true,
    });
    const editorRoot = toolbarRoot(editor);
    const toolbar = editorRoot?.querySelector<HTMLElement>("[data-mesurer-text-style-toolbar='true']") ?? null;
    const toolbarObserver = toolbar ? new realm.MutationObserver(scheduleDirectEditPreview) : null;
    toolbarObserver?.observe(toolbar!, { childList: true, subtree: true });

    directEditPreview = {
      editor,
      sourceEl,
      card,
      sourceObserver,
      toolbarObserver,
      frame: 0,
    };
    refreshDirectEditPreview();
  };

  const directEditorFromEvent = (event: Event) => event.composedPath().find(
    (entry): entry is HTMLTextAreaElement =>
      entry instanceof HTMLTextAreaElementCtor && entry.dataset.mesurerTextEditor === "true",
  ) ?? null;

  const onDirectEditFocus = (event: FocusEvent) => {
    if (legacy) return;
    const editor = directEditorFromEvent(event);
    if (editor) beginDirectEditPreview(editor);
  };
  const onDirectEditLifecycle = () => {
    if (legacy) return;
    if (directEditPreview) scheduleDirectEditPreview();
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

  doc.addEventListener("focusin", onDirectEditFocus, true);
  win.addEventListener("pointerdown", onDirectEditLifecycle, true);
  win.addEventListener("keydown", onDirectEditLifecycle, true);
  win.addEventListener("scroll", onDirectEditLifecycle, true);
  win.addEventListener("resize", onDirectEditLifecycle, true);

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
    disable();
    clearDirectEditPreview();
    doc.removeEventListener("focusin", onDirectEditFocus, true);
    win.removeEventListener("pointerdown", onDirectEditLifecycle, true);
    win.removeEventListener("keydown", onDirectEditLifecycle, true);
    win.removeEventListener("scroll", onDirectEditLifecycle, true);
    win.removeEventListener("resize", onDirectEditLifecycle, true);
    overlay?.remove(); overlay = null;
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