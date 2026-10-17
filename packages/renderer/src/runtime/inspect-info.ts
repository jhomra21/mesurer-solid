// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import type { Rect } from "../core/types";

export type InspectInfoCardPlacement = { left: number; top: number };

/** Place the source-linked card beside its projected target without covering it when space permits. */
export const placeInspectInfoCard = (
  target: Rect,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): InspectInfoCardPlacement => {
  const left = Math.max(8, Math.min(
    target.left + target.width / 2 - card.width / 2,
    viewport.width - card.width - 8,
  ));

  const below = target.top + target.height + 4;

  const top = below + card.height <= viewport.height - 8
    ? below
    : target.top - card.height - 4 >= 8
      ? target.top - card.height - 4
      : Math.max(8, Math.min(below, viewport.height - card.height - 8));

  return { left, top };
};
