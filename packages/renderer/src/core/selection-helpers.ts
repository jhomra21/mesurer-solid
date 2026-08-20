// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import { getRectFromDom } from "./dom";
import type { InspectMeasurement, Point } from "./types";
const getOverlayHost = (overlayNode: HTMLDivElement | null) => { if (!overlayNode) return null; const root = overlayNode.getRootNode(); return root.nodeType === 11 ? (root as ShadowRoot).host : null; };
export const getPrimarySelectedMeasurement = (selectedMeasurements: InspectMeasurement[], selectedMeasurement: InspectMeasurement | null) => selectedMeasurements.length ? selectedMeasurements[selectedMeasurements.length - 1] : selectedMeasurement;
export const getSelectedMeasurementHit = (params: { point: Point; selectedMeasurements: InspectMeasurement[]; overlayNode: HTMLDivElement | null; document?: Document }) => {
  const ownerDocument = params.document ?? document; const HTMLElementConstructor = ownerDocument.defaultView?.HTMLElement ?? HTMLElement; const overlayHost = getOverlayHost(params.overlayNode);
  const candidates = params.selectedMeasurements.map((measurement) => { const element = measurement.elementRef; if (!element || !element.isConnected) return null; const rect = getRectFromDom(element); return { measurement, element, rect, area: rect.width * rect.height }; }).filter((item): item is NonNullable<typeof item> => item !== null).sort((a, b) => a.area - b.area);
  for (const element of ownerDocument.elementsFromPoint(params.point.x, params.point.y)) { if (!(element instanceof HTMLElementConstructor)) continue; const html = element as HTMLElement; if (params.overlayNode?.contains(html) || (overlayHost && html === overlayHost)) continue; for (const candidate of candidates) if (candidate.element === html || candidate.element.contains(html)) return candidate.measurement; }
  for (const candidate of candidates) { const r = candidate.rect; if (params.point.x >= r.left && params.point.x <= r.left + r.width && params.point.y >= r.top && params.point.y <= r.top + r.height) return candidate.measurement; }
  return null;
};
