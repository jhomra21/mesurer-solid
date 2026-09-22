import type {
  InspectMeasurement,
  MesurerElementFingerprint,
  Rect,
} from "@jhomra21/mesurer-solid-core";

export type DomHost = {
  ownerWindow: Window;
  ownerDocument: Document;
  portalTarget: HTMLElement | ShadowRoot;
};

export function createDomHost(target?: HTMLElement | ShadowRoot): DomHost {
  const ownerDocument = target?.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView ?? window;

  return { ownerWindow, ownerDocument, portalTarget: target ?? ownerDocument.body };
}

export function createPortalMount(host: DomHost, attribute = "data-mesurer-host") {
  const mount = host.ownerDocument.createElement("div");
  mount.setAttribute(attribute, "true");
  host.portalTarget.append(mount);

  return { mount, dispose: () => mount.remove() };
}

type ElectronGlobal = {
  process?: {
    type?: string;
    versions?: { electron?: string };
  };
};

// SAFETY: Electron augments the runtime global with optional process metadata; browsers simply leave it absent.
const runtimeElectronGlobal = globalThis as ElectronGlobal;

export function isElectronRenderer(globalValue: ElectronGlobal = runtimeElectronGlobal): boolean {
  return globalValue.process?.type === "renderer" || Boolean(globalValue.process?.versions?.electron);
}

export type StorageAdapter = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

export function createLocalStorageAdapter(ownerWindow: Window = window): StorageAdapter {
  return {
    get: (key) => ownerWindow.localStorage.getItem(key),
    set: (key, value) => ownerWindow.localStorage.setItem(key, value),
    remove: (key) => ownerWindow.localStorage.removeItem(key),
  };
}

export type DomInspectionRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  x: number;
  y: number;
};

export type DomEdges = { top: number; right: number; bottom: number; left: number };

export type DomElementFingerprint = MesurerElementFingerprint;

export type DomElementInspection = {
  selector: string;
  tag: string;
  id: string | null;
  classes: string[];
  text: string;
  role: string | null;
  ariaLabel: string | null;
  rect: DomInspectionRect;
  margin: DomEdges;
  padding: DomEdges;
  border: DomEdges;
  typography: {
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    letterSpacing: string;
    textAlign: string;
    color: string;
  };
  appearance: {
    backgroundColor: string;
    borderColor: string;
    borderRadius: string;
    boxShadow: string;
    opacity: string;
  };
  layout: {
    display: string;
    position: string;
    zIndex: string;
    overflowX: string;
    overflowY: string;
    flexDirection: string;
    alignItems: string;
    justifyContent: string;
    gap: string;
    gridTemplateColumns: string;
    gridTemplateRows: string;
    transform: string;
  };
  scroll: {
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
    overflowsX: boolean;
    overflowsY: boolean;
  };
};

export type DomInspectableElement = {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  tagName: string;
  id: string;
  classList: { item(index: number): string | null };
};

type BoxComputedStyle = {
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
};

export type DomStyleReader<ElementRef extends DomInspectableElement> = {
  getComputedStyle(element: ElementRef): BoxComputedStyle;
};

const parseEdge = (value: string) => Number.parseFloat(value) || 0;

let inspectionId = 0;

const escapeCss = (value: string, ownerWindow: Window) => {
  // SAFETY: ownerWindow is the browser realm that owns the inspected document and therefore exposes that realm's CSS namespace.
  const css = (ownerWindow as Window & typeof globalThis).CSS;

  return css?.escape ? css.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
};

const normalizedFingerprintText = (element: Element) => {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);

  return text || null;
};

const isDocument = (value: Node): value is Document => value.nodeType === 9;

const isShadowRoot = (value: Node): value is ShadowRoot => value.nodeType === 11;

export function getRectFromDom(element: Element): Rect {
  const rect = element.getBoundingClientRect();

  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export type DomHitTestTarget = Document | HTMLElement | ShadowRoot;

export function getDomTreeRoot(element: Element): Document | ShadowRoot {
  const root = element.getRootNode();

  return isShadowRoot(root) ? root : element.ownerDocument;
}

const pointRoot = (target: DomHitTestTarget, ownerDocument: Document): Document | ShadowRoot => {
  if (isDocument(target) || isShadowRoot(target)) return target;
  const root = getDomTreeRoot(target);

  return isShadowRoot(root) ? root : ownerDocument;
};

/** Resolve the deepest open-ShadowRoot element at a viewport point. */
export function getDeepestElementAtPoint(
  point: { x: number; y: number },
  target: DomHitTestTarget,
  ownerDocument: Document = isDocument(target) ? target : target.ownerDocument ?? document,
): Element | null {
  let current = pointRoot(target, ownerDocument).elementFromPoint(point.x, point.y);

  while (current?.shadowRoot) {
    const nested = current.shadowRoot.elementFromPoint(point.x, point.y);

    if (!nested || nested === current) break;
    current = nested;
  }

  return current;
}

const MAX_VISUAL_HIT_DESCENDANTS = 600;

type VisualHitCandidate = {
  element: Element;
  area: number;
  depth: number;
  order: number;
};

const rectContainsPoint = (
  rect: { left: number; top: number; right: number; bottom: number },
  point: { x: number; y: number },
) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;

const elementContainsPoint = (element: Element, point: { x: number; y: number }) =>
  Array.from(element.getClientRects()).some((rect) => rectContainsPoint(rect, point));

const getCaretElementAtPoint = (
  point: { x: number; y: number },
  ownerDocument: Document,
  root: Element,
) => {
  // SAFETY: this only augments the standard Document type with browser caret APIs that are feature-detected via optional calls.
  const documentWithCaret = ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode?: Node } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  const node = documentWithCaret.caretRangeFromPoint?.(point.x, point.y)?.startContainer
    ?? documentWithCaret.caretPositionFromPoint?.(point.x, point.y)?.offsetNode;

  if (!node) return null;

  const ElementConstructor = ownerDocument.defaultView?.Element;

  if (!ElementConstructor) return null;

  let element = node instanceof ElementConstructor ? node : node.parentElement;

  while (element && element !== root) {
    if (root.contains(element)) return element;
    element = element.parentElement;
  }

  return element === root ? root : null;
};

const getPointerTransparentVisualDescendants = (
  root: Element,
  point: { x: number; y: number },
  ownerDocument: Document,
) => {
  const ownerWindow = ownerDocument.defaultView;
  const ElementConstructor = ownerWindow?.Element;

  if (!ownerWindow || !ElementConstructor) return [];
  const candidates: VisualHitCandidate[] = [];
  const visited = new Set<Element>();

  const addCandidate = (element: Element, depth: number, order: number) => {
    if (visited.has(element)) return;
    const style = ownerWindow.getComputedStyle(element);

    if (
      style.pointerEvents !== "none"
      || style.visibility === "hidden"
      || style.display === "none"
      || style.opacity === "0"
      || !elementContainsPoint(element, point)
    ) return;

    const rect = element.getBoundingClientRect();
    visited.add(element);
    candidates.push({
      element,
      area: rect.width * rect.height,
      depth,
      order,
    });
  };

  const walker = ownerDocument.createTreeWalker(root, 1);
  let current = walker.nextNode();
  let order = 1;

  while (current && order <= MAX_VISUAL_HIT_DESCENDANTS) {
    if (current instanceof ElementConstructor) {
      const element = current;
      const style = ownerWindow.getComputedStyle(element);

      if (style.pointerEvents === "none") {
        let depth = 1;
        let parent = element.parentElement;

        while (parent && parent !== root) {
          depth += 1;
          parent = parent.parentElement;
        }

        addCandidate(element, depth, order);
      }
    }

    order += 1;
    current = walker.nextNode();
  }

  const caretElement = getCaretElementAtPoint(point, ownerDocument, root);

  if (caretElement && ownerWindow.getComputedStyle(caretElement).pointerEvents === "none") {
    addCandidate(caretElement, 10_000, order);
  }

  return candidates
    .sort((left, right) =>
      right.depth - left.depth
      || left.area - right.area
      || right.order - left.order
    )
    .map(({ element }) => element);
};

/**
 * Resolve the visually specific element at a point. Native hit testing skips
 * descendants with pointer-events:none, so inspectable labels and wrappers can
 * otherwise collapse to their interactive ancestor. Search only the bounded
 * subtree of native point hits and prefer the deepest visible transparent
 * descendant before falling back to the native target.
 */
export function getVisualElementAtPoint(
  point: { x: number; y: number },
  target: DomHitTestTarget,
  ownerDocument: Document = isDocument(target) ? target : target.ownerDocument ?? document,
): Element | null {
  const root = pointRoot(target, ownerDocument);
  const ownerWindow = ownerDocument.defaultView;

  if (!ownerWindow) return null;

  const rawStack = root.elementsFromPoint(point.x, point.y);

  for (const raw of rawStack) {
    let element: Element | null = raw;

    while (element?.shadowRoot) {
      const nested = element.shadowRoot.elementFromPoint(point.x, point.y);

      if (!nested || nested === element) break;
      element = nested;
    }

    if (!element || !isElementWithinDomTarget(element, target)) continue;

    const transparentDescendants = getPointerTransparentVisualDescendants(element, point, ownerDocument);

    if (transparentDescendants.length > 0) return transparentDescendants[0];

    if (ownerWindow.getComputedStyle(element).pointerEvents !== "none") return element;
  }

  return null;
}

export function isElementWithinDomTarget(element: Element, target: DomHitTestTarget): boolean {
  if (isDocument(target)) return true;
  let current: Element | null = element;

  while (current) {
    if (target === current || target.contains(current)) return true;
    const root = current.getRootNode();

    if (!isShadowRoot(root)) return false;
    current = root.host;
  }

  return false;
}

export function withPointerEventsDisabled<T>(element: HTMLElement | null, operation: () => T): T {
  if (!element) return operation();
  const elements = [element, ...element.querySelectorAll<HTMLElement>("*")];

  const previous = elements.map((current) => [
    current,
    current.style.getPropertyValue("pointer-events"),
    current.style.getPropertyPriority("pointer-events"),
  ] as const);

  for (const current of elements) current.style.setProperty("pointer-events", "none", "important");

  try {
    return operation();
  } finally {
    for (const [current, value, priority] of previous) {
      if (value) current.style.setProperty("pointer-events", value, priority);
      else current.style.removeProperty("pointer-events");
    }
  }
}

export function getElementSelector(element: Element): string {
  const ownerWindow = element.ownerDocument.defaultView ?? window;

  if (element.id) return `#${escapeCss(element.id, ownerWindow)}`;
  const testId = element.getAttribute("data-testid");

  if (testId) return `[data-testid=${JSON.stringify(testId)}]`;

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && parts.length < 5) {
    let part = current.localName;
    const currentName = current.localName;
    const parent: Element | null = current.parentElement;

    if (parent) {
      const siblings = [...parent.children].filter((candidate) => candidate.localName === currentName);

      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }

    parts.unshift(part);
    current = parent;
  }

  return parts.join(" > ");
}

export function getElementFingerprint(element: Element): DomElementFingerprint {
  return {
    tag: element.localName,
    id: element.id || null,
    testId: element.getAttribute("data-testid"),
    role: element.getAttribute("role"),
    ariaLabel: element.getAttribute("aria-label"),
    classes: [...element.classList],
    text: normalizedFingerprintText(element),
  };
}

export function isElementFingerprintRebindable(fingerprint: DomElementFingerprint): boolean {
  return Boolean(
    fingerprint.id
    || fingerprint.testId
    || fingerprint.role
    || fingerprint.ariaLabel
    || fingerprint.classes.length
    || fingerprint.text,
  );
}

export function isElementFingerprintCompatible(element: Element, fingerprint: DomElementFingerprint): boolean {
  if (element.localName !== fingerprint.tag) return false;

  if (fingerprint.id && element.id !== fingerprint.id) return false;

  if (fingerprint.testId && element.getAttribute("data-testid") !== fingerprint.testId) return false;

  if (fingerprint.role && element.getAttribute("role") !== fingerprint.role) return false;

  if (fingerprint.ariaLabel && element.getAttribute("aria-label") !== fingerprint.ariaLabel) return false;

  const hasStrongIdentity = Boolean(fingerprint.id || fingerprint.testId);

  if (hasStrongIdentity) return true;

  if (fingerprint.classes.some((className) => !element.classList.contains(className))) return false;

  if (fingerprint.text && normalizedFingerprintText(element) !== fingerprint.text) return false;

  return isElementFingerprintRebindable(fingerprint);
}

/**
 * Canonical Mesurer box-model inspection for browser hosts and automation.
 * This intentionally matches the visual Select inspector's content/padding/margin geometry.
 */
export function getInspectMeasurement<ElementRef extends DomInspectableElement>(
  element: ElementRef,
  styleReader: DomStyleReader<ElementRef>,
  id = `dom-inspection-${++inspectionId}`,
): InspectMeasurement<ElementRef> {
  const rect = element.getBoundingClientRect();
  const style = styleReader.getComputedStyle(element);

  const padding = {
    top: parseEdge(style.paddingTop),
    right: parseEdge(style.paddingRight),
    bottom: parseEdge(style.paddingBottom),
    left: parseEdge(style.paddingLeft),
  };

  const margin = {
    top: parseEdge(style.marginTop),
    right: parseEdge(style.marginRight),
    bottom: parseEdge(style.marginBottom),
    left: parseEdge(style.marginLeft),
  };

  const paddingRect = {
    left: rect.left + padding.left,
    top: rect.top + padding.top,
    width: Math.max(0, rect.width - padding.left - padding.right),
    height: Math.max(0, rect.height - padding.top - padding.bottom),
  };

  const marginRect = {
    left: rect.left - margin.left,
    top: rect.top - margin.top,
    width: rect.width + margin.left + margin.right,
    height: rect.height + margin.top + margin.bottom,
  };

  const tag = element.tagName.toLowerCase();
  const elementId = element.id ? `#${element.id}` : "";
  const firstClass = element.classList.item(0);
  const className = firstClass ? `.${firstClass}` : "";

  return {
    id,
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    paddingRect,
    marginRect,
    padding,
    margin,
    label: `${tag}${elementId}${className}`,
    elementRef: element,
  };
}

export function inspectDomElement(element: Element): DomElementInspection {
  const ownerWindow = element.ownerDocument.defaultView ?? window;
  const style = ownerWindow.getComputedStyle(element);
  // SAFETY: ownerWindow is the realm that owns element and therefore its HTMLElement constructor.
  const HTMLElementCtor = (ownerWindow as Window & typeof globalThis).HTMLElement;
  const html = element instanceof HTMLElementCtor ? element : null;
  const bounding = element.getBoundingClientRect();
  const canonical = html ? getInspectMeasurement(html, ownerWindow) : null;

  const number = (value: string) => {
    const parsed = Number.parseFloat(value);

    return Number.isFinite(parsed) ? parsed : 0;
  };

  const edges = (prefix: "margin" | "padding" | "border"): DomEdges => ({
    top: number(style.getPropertyValue(`${prefix}-top${prefix === "border" ? "-width" : ""}`)),
    right: number(style.getPropertyValue(`${prefix}-right${prefix === "border" ? "-width" : ""}`)),
    bottom: number(style.getPropertyValue(`${prefix}-bottom${prefix === "border" ? "-width" : ""}`)),
    left: number(style.getPropertyValue(`${prefix}-left${prefix === "border" ? "-width" : ""}`)),
  });

  return {
    selector: getElementSelector(element),
    tag: element.localName,
    id: element.id || null,
    classes: [...element.classList],
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
    role: element.getAttribute("role"),
    ariaLabel: element.getAttribute("aria-label"),
    rect: {
      left: bounding.left,
      top: bounding.top,
      right: bounding.right,
      bottom: bounding.bottom,
      width: bounding.width,
      height: bounding.height,
      x: bounding.x,
      y: bounding.y,
    },
    margin: canonical?.margin ?? edges("margin"),
    padding: canonical?.padding ?? edges("padding"),
    border: edges("border"),
    typography: {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textAlign: style.textAlign,
      color: style.color,
    },
    appearance: {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      opacity: style.opacity,
    },
    layout: {
      display: style.display,
      position: style.position,
      zIndex: style.zIndex,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      flexDirection: style.flexDirection,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent,
      gap: style.gap,
      gridTemplateColumns: style.gridTemplateColumns,
      gridTemplateRows: style.gridTemplateRows,
      transform: style.transform,
    },
    scroll: {
      clientWidth: html?.clientWidth ?? 0,
      clientHeight: html?.clientHeight ?? 0,
      scrollWidth: html?.scrollWidth ?? 0,
      scrollHeight: html?.scrollHeight ?? 0,
      overflowsX: (html?.scrollWidth ?? 0) > (html?.clientWidth ?? 0) + 1,
      overflowsY: (html?.scrollHeight ?? 0) > (html?.clientHeight ?? 0) + 1,
    },
  };
}