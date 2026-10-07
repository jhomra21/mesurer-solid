// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import { getRectFromDom } from "./dom";
import { isMesurerUiNode } from "./events";
import { projectPoint } from "./frame-geometry";
import type { InspectMeasurement, Point } from "./types";

const isShadowRoot = (value: Node): value is ShadowRoot => value.nodeType === 11;

const getOverlayHost = (overlayNode: HTMLDivElement | null) => {
  if (!overlayNode) return null;
  const root = overlayNode.getRootNode();

  return isShadowRoot(root) ? root.host : null;
};

export const getPrimarySelectedMeasurement = (
  selectedMeasurements: InspectMeasurement[],
  selectedMeasurement: InspectMeasurement | null,
) => selectedMeasurements.length ? selectedMeasurements[selectedMeasurements.length - 1] : selectedMeasurement;

export const getSelectedMeasurementHit = (params: {
  point: Point;
  selectedMeasurements: InspectMeasurement[];
  overlayNode: HTMLDivElement | null;
  document?: Document;
  exact?: boolean;
}) => {
  const ownerDocument = params.document ?? document;
  const ownerWindow = ownerDocument.defaultView;
  const ElementConstructor = ownerWindow?.Element;
  const overlayHost = getOverlayHost(params.overlayNode);

  const candidates = params.selectedMeasurements
    .map((measurement) => {
      const element = measurement.elementRef;

      if (!element || !element.isConnected) return null;
      const rect = getRectFromDom(element);

      return { measurement, element, rect, area: rect.width * rect.height };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.area - b.area);

  const elements: Element[] = [];

  if (ElementConstructor && ownerWindow) {
    for (const element of ownerDocument.elementsFromPoint(params.point.x, params.point.y)) {
      if (!(element instanceof ElementConstructor)) continue;

      if (params.overlayNode?.contains(element)) continue;

      if (overlayHost && element === overlayHost) continue;

      // Mesurer-owned UI is a hard visual/input boundary. Never look through an
      // inspector card, annotation surface, or Mesurer island to an already
      // selected page element underneath it.
      if (isMesurerUiNode(element, ownerWindow)) return null;
      elements.push(element);
    }
  }

  const hitCandidate = (
    candidate: (typeof candidates)[number],
  ) => {
    if (candidate.element.ownerDocument === ownerDocument) {
      const hits = params.exact ? elements.slice(0, 1) : elements;

      return hits.some((hit) =>
        candidate.element === hit || candidate.element.contains(hit));
    }

    const localPoint = projectPoint(
      params.point,
      ownerDocument,
      candidate.element.ownerDocument,
    );

    if (localPoint.x < 0 || localPoint.y < 0) return false;

    const localHits = candidate.element.ownerDocument.elementsFromPoint(
      localPoint.x,
      localPoint.y,
    );

    const hits = params.exact ? localHits.slice(0, 1) : localHits;

    return hits.some((hit) =>
      candidate.element === hit || candidate.element.contains(hit));
  };

  const hit = candidates.find(hitCandidate);

  if (hit) return hit.measurement;

  for (const candidate of candidates) {
    const rect = candidate.rect;

    if (
      params.point.x >= rect.left
      && params.point.x <= rect.left + rect.width
      && params.point.y >= rect.top
      && params.point.y <= rect.top + rect.height
    ) return candidate.measurement;
  }

  return null;
};
