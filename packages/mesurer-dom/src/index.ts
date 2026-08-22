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

export function isElectronRenderer(globalValue: unknown = globalThis): boolean {
  const value = globalValue as { process?: { type?: string; versions?: { electron?: string } } };
  return value.process?.type === "renderer" || typeof value.process?.versions?.electron === "string";
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

const parseEdge = (value: string) => Number.parseFloat(value) || 0;
let inspectionId = 0;

const escapeCss = (value: string, ownerWindow: Window) => {
  const css = (ownerWindow as Window & typeof globalThis).CSS;
  return css?.escape ? css.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
};

const normalizedFingerprintText = (element: Element) => {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  return text || null;
};

export function getRectFromDom(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
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
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((candidate) => candidate.localName === current!.localName);
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
export function getInspectMeasurement(
  element: HTMLElement,
  ownerWindow: Window = element.ownerDocument.defaultView ?? window,
  id = `dom-inspection-${++inspectionId}`,
): InspectMeasurement<HTMLElement> {
  const rect = element.getBoundingClientRect();
  const style = ownerWindow.getComputedStyle(element);
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