// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import { getRectFromDom } from "./dom";
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
  const HTMLElementConstructor = ownerDocument.defaultView?.HTMLElement;
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
  const elements = HTMLElementConstructor
    ? ownerDocument.elementsFromPoint(params.point.x, params.point.y).filter((element): element is HTMLElement =>
        element instanceof HTMLElementConstructor
        && !params.overlayNode?.contains(element)
        && !(overlayHost && element === overlayHost),
      )
    : [];
  if (params.exact) return candidates.find((candidate) => candidate.element === elements[0])?.measurement ?? null;
  for (const html of elements) {
    for (const candidate of candidates) {
      if (candidate.element === html || candidate.element.contains(html)) return candidate.measurement;
    }
  }
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
