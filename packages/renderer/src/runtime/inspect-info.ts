// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import type { Rect } from "../core/types";

export type InspectInfoCardPlacement = { left: number; top: number };

/** Place the source-linked card beside its projected target without covering it when space permits. */
export const placeInspectInfoCard = (
  target: Rect,
  card: { width: number; height: number },
  viewport: { width: number; height: number; left?: number; top?: number },
  avoidTarget = false,
  avoidRects: Rect[] = [],
): InspectInfoCardPlacement | null => {
  if (viewport.width <= 16 || viewport.height <= 16) return null;
  const width = Math.min(card.width, viewport.width - 16);
  const height = Math.min(card.height, viewport.height - 16);
  const viewportLeft = viewport.left ?? 0;
  const viewportTop = viewport.top ?? 0;

  const left = Math.max(viewportLeft + 8, Math.min(
    target.left + target.width / 2 - width / 2,
    viewportLeft + viewport.width - width - 8,
  ));

  const below = target.top + target.height + 4;
  const above = target.top - height - 4;
  const clampedTop = Math.max(viewportTop + 8, Math.min(target.top, viewportTop + viewport.height - height - 8));

  const candidates = [
    { left, top: below },
    { left, top: above },
    { left: Math.max(viewportLeft + 8, target.left - width - 4), top: clampedTop },
    { left: Math.min(target.left + target.width + 4, viewportLeft + viewport.width - width - 8), top: clampedTop },
    { left, top: Math.max(viewportTop + 8, Math.min(below, viewportTop + viewport.height - height - 8)) },
  ];

  const intersects = (a: Rect, b: Rect) =>
    a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top;

  for (const candidate of candidates) {
    const bounds = { ...candidate, width, height };

    const withinViewport = candidate.left >= viewportLeft + 8
      && candidate.top >= viewportTop + 8
      && candidate.left + width <= viewportLeft + viewport.width - 8
      && candidate.top + height <= viewportTop + viewport.height - 8;

    const avoidsTarget = !avoidTarget || !intersects(bounds, target);
    const avoidsProtectedUi = avoidRects.every((rect) => !intersects(bounds, rect));

    if (withinViewport && avoidsTarget && avoidsProtectedUi) return candidate;
  }

  // Large targets or surfaces may leave no free region. Keep the previous
  // nearest-source fallback within viewport bounds.
  return { left, top: Math.max(viewportTop + 8, Math.min(below, viewportTop + viewport.height - height - 8)) };
};
