import type { InspectMeasurement, Rect } from "@jhomra21/mesurer-solid-core";

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

const parseEdge = (value: string) => Number.parseFloat(value) || 0;
let inspectionId = 0;

export function getRectFromDom(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
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
