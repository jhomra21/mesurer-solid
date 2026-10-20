// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import type { Rect } from "../core/types";

export type InspectInfoCardPlacement = { left: number; top: number };

const intersects = (a: Rect, b: Rect) =>
  a.left < b.left + b.width
  && a.left + a.width > b.left
  && a.top < b.top + b.height
  && a.top + a.height > b.top;

/** Narrowest Inspect card that still shows its truncated selector and values legibly. */
export const INSPECT_INFO_CARD_MIN_WIDTH = 168;

/**
 * Place a Responsive preview card in the stage beside its device frame so it
 * does not cover preview content. The card narrows to fit a smaller gutter,
 * down to INSPECT_INFO_CARD_MIN_WIDTH. Returns null when no side has room.
 */
export const placeInspectInfoCardBesidePreview = (
  target: Rect,
  card: { width: number; height: number },
  preview: Rect,
  stage: Rect,
  avoidRects: Rect[] = [],
): (InspectInfoCardPlacement & { width: number }) | null => {
  const { height } = card;
  const minTop = stage.top + 8;
  const maxTop = stage.top + stage.height - height - 8;

  if (maxTop < minTop) return null;
  const top = Math.max(minTop, Math.min(target.top, maxTop));
  const rightGutter = stage.left + stage.width - 8 - (preview.left + preview.width + 8);
  const leftGutter = preview.left - 8 - (stage.left + 8);

  // Prefer the right side, but take whichever side fits a wider card.
  const sides = [
    { side: "right" as const, gutter: rightGutter },
    { side: "left" as const, gutter: leftGutter },
  ].sort((a, b) => Math.min(b.gutter, card.width) - Math.min(a.gutter, card.width));

  for (const { side, gutter } of sides) {
    const width = Math.min(card.width, gutter);

    if (width < INSPECT_INFO_CARD_MIN_WIDTH) continue;
    const left = side === "right" ? preview.left + preview.width + 8 : preview.left - width - 8;
    const bounds = { left, top, width, height };

    if (avoidRects.every((rect) => !intersects(bounds, rect))) return { left, top, width };
  }

  return null;
};

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
