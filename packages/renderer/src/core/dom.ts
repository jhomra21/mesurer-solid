// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import {
  getInspectMeasurement as getDomInspectMeasurement,
  getRectFromDom as getDomRect,
} from "@jhomra21/mesurer-solid-dom";
import { denormalizeRect, getViewportSize, normalizeRect } from "./geometry";
import type { InspectMeasurement, Measurement, Rect } from "./types";
import { createId } from "./utils";

export const getRectFromDom = (element: Element): Rect => getDomRect(element);

let rectCacheFrame = -1;
const rectCache = new Map<Element, Rect>();

export const getFrameToken = () => {
  if (typeof performance === "undefined") return 0;
  return Math.floor(performance.now() / 16);
};

export const getRectFromDomCached = (element: Element) => {
  const frame = getFrameToken();
  if (frame !== rectCacheFrame) {
    rectCacheFrame = frame;
    rectCache.clear();
  }
  const cached = rectCache.get(element);
  if (cached) return cached;
  const rect = getRectFromDom(element);
  rectCache.set(element, rect);
  return rect;
};

let cachedElements: HTMLElement[] = [];
let cachedFrame = -1;
let cachedDocument: Document | null = null;

export const getBodyElementsCached = (ownerDocument: Document = document) => {
  const frame = getFrameToken();
  if (frame === cachedFrame && cachedDocument === ownerDocument && cachedElements.length > 0) return cachedElements;
  cachedFrame = frame;
  cachedDocument = ownerDocument;
  const elements: HTMLElement[] = [];
  const HTMLElementConstructor = ownerDocument.defaultView?.HTMLElement ?? HTMLElement;
  const visit = (root: Document | ShadowRoot | HTMLElement) => {
    const walker = ownerDocument.createTreeWalker(root, 1);
    let node = walker.nextNode();
    while (node) {
      if (node instanceof HTMLElementConstructor) {
        elements.push(node as HTMLElement);
        if ((node as HTMLElement).shadowRoot) visit((node as HTMLElement).shadowRoot!);
      }
      node = walker.nextNode();
    }
  };
  if (ownerDocument.body) visit(ownerDocument.body);
  cachedElements = elements;
  return cachedElements;
};

export const getInspectMeasurement = (
  element: HTMLElement,
  ownerWindow: Window = window,
): InspectMeasurement => getDomInspectMeasurement(element, ownerWindow, createId());

export const updateMeasurementForResize = (
  measurement: Measurement,
  viewport = getViewportSize(),
  ownerDocument: Document = document,
): Measurement => {
  let rect = measurement.rect;
  if (measurement.elementRef && ownerDocument.contains(measurement.elementRef)) rect = getRectFromDom(measurement.elementRef);
  else if (measurement.normalizedRect) rect = denormalizeRect(measurement.normalizedRect, viewport);
  return { ...measurement, rect, normalizedRect: normalizeRect(rect, viewport), originRect: undefined };
};
