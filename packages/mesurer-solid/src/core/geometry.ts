// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.

import type { NormalizedRect, Point, Rect } from "./types";

export const getViewportSize = (ownerWindow?: Window) => ({
  width:
    ownerWindow?.innerWidth ||
    (typeof window === "undefined" ? 1 : window.innerWidth) ||
    1,
  height:
    ownerWindow?.innerHeight ||
    (typeof window === "undefined" ? 1 : window.innerHeight) ||
    1,
});

export const normalizeRect = (
  rect: Rect,
  viewport = getViewportSize(),
): NormalizedRect => ({
  left: rect.left / viewport.width,
  top: rect.top / viewport.height,
  width: rect.width / viewport.width,
  height: rect.height / viewport.height,
});

export const denormalizeRect = (
  rect: NormalizedRect,
  viewport = getViewportSize(),
): Rect => ({
  left: rect.left * viewport.width,
  top: rect.top * viewport.height,
  width: rect.width * viewport.width,
  height: rect.height * viewport.height,
});

export const getRectFromPoints = (start: Point, end: Point): Rect => ({
  left: Math.min(start.x, end.x),
  top: Math.min(start.y, end.y),
  width: Math.abs(start.x - end.x),
  height: Math.abs(start.y - end.y),
});

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
