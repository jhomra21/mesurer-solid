// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import {
  getInspectMeasurement as getDomInspectMeasurement,
  getRectFromDom as getDomRect,
} from "@jhomra21/mesurer-solid-dom";
import { denormalizeRect, getViewportSize, normalizeRect } from "./geometry";
import { getAccessibleFrameDocument, projectRect } from "./frame-geometry";
import type { InspectMeasurement, Measurement, Rect } from "./types";
import { createId } from "./utils";

export const getRectFromDom = (element: Element): Rect =>
  projectRect(getDomRect(element), element.ownerDocument);

let rectCacheFrame = -1;

const rectCache = new Map<Element, Rect>();

export const getFrameToken = () => {
  const now = globalThis.performance?.now();

  return now === undefined ? 0 : Math.floor(now / 16);
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

let cachedElements: Element[] = [];

let cachedFrame = -1;

let cachedDocument: Document | null = null;

export const getBodyElementsCached = (ownerDocument: Document = document) => {
  const frame = getFrameToken();

  if (
    frame === cachedFrame
    && cachedDocument === ownerDocument
    && cachedElements.length > 0
  ) {
    return cachedElements;
  }

  cachedFrame = frame;
  cachedDocument = ownerDocument;

  const elements: Element[] = [];
  const visitedDocuments = new Set<Document>();

  const visitDocument = (currentDocument: Document) => {
    if (visitedDocuments.has(currentDocument)) return;

    visitedDocuments.add(currentDocument);

    const ElementConstructor = currentDocument.defaultView?.Element;

    if (!ElementConstructor || !currentDocument.body) return;

    const visit = (root: Document | ShadowRoot | Element) => {
      const walker = currentDocument.createTreeWalker(root, 1);
      let node = walker.nextNode();

      while (node) {
        if (node instanceof ElementConstructor) {
          elements.push(node);

          if (node.shadowRoot) visit(node.shadowRoot);

          const childDocument = getAccessibleFrameDocument(node);

          if (childDocument) visitDocument(childDocument);
        }

        node = walker.nextNode();
      }
    };

    visit(currentDocument.body);
  };

  visitDocument(ownerDocument);
  cachedElements = elements;

  return cachedElements;
};

export const getInspectMeasurement = (
  element: Element,
  ownerWindow: Window = window,
): InspectMeasurement => {
  const elementWindow = element.ownerDocument.defaultView ?? ownerWindow;

  const measurement = getDomInspectMeasurement<Element>(
    element,
    elementWindow,
    createId(),
  );

  return {
    ...measurement,
    rect: projectRect(measurement.rect, element.ownerDocument),
    paddingRect: projectRect(measurement.paddingRect, element.ownerDocument),
    marginRect: projectRect(measurement.marginRect, element.ownerDocument),
  };
};

export const updateMeasurementForResize = (
  measurement: Measurement,
  viewport = getViewportSize(),
  _ownerDocument: Document = document,
): Measurement => {
  let rect = measurement.rect;

  if (measurement.elementRef?.isConnected) rect = getRectFromDom(measurement.elementRef);
  else if (measurement.normalizedRect) rect = denormalizeRect(measurement.normalizedRect, viewport);

  return { ...measurement, rect, normalizedRect: normalizeRect(rect, viewport), originRect: undefined };
};
