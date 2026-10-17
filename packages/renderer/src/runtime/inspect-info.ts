// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import type { Rect } from "../core/types";

export type InspectInfoCardPlacement = { left: number; top: number };

/** Place the source-linked card beside its projected target without covering it when space permits. */
export const placeInspectInfoCard = (
  target: Rect,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  avoidTarget = false,
  avoidRects: Rect[] = [],
): InspectInfoCardPlacement => {
  const left = Math.max(8, Math.min(
    target.left + target.width / 2 - card.width / 2,
    viewport.width - card.width - 8,
  ));

  const below = target.top + target.height + 4;
  const above = target.top - card.height - 4;
  const clampedTop = Math.max(8, Math.min(target.top, viewport.height - card.height - 8));

  const candidates = [
    { left, top: below },
    { left, top: above },
    { left: Math.max(8, target.left - card.width - 4), top: clampedTop },
    { left: Math.min(target.left + target.width + 4, viewport.width - card.width - 8), top: clampedTop },
    { left, top: Math.max(8, Math.min(below, viewport.height - card.height - 8)) },
  ];

  const intersects = (a: Rect, b: Rect) =>
    a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top;

  for (const candidate of candidates) {
    const bounds = { ...candidate, width: card.width, height: card.height };

    const withinViewport = candidate.left >= 8
      && candidate.top >= 8
      && candidate.left + card.width <= viewport.width - 8
      && candidate.top + card.height <= viewport.height - 8;

    const avoidsTarget = !avoidTarget || !intersects(bounds, target);
    const avoidsProtectedUi = avoidRects.every((rect) => !intersects(bounds, rect));

    if (withinViewport && avoidsTarget && avoidsProtectedUi) return candidate;
  }

  // Large targets or surfaces may leave no free region. Keep the previous
  // nearest-source fallback within viewport bounds.
  return { left, top: Math.max(8, Math.min(below, viewport.height - card.height - 8)) };
};
