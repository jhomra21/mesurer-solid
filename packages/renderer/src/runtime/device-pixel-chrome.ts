import type { Rect } from "../core/types";

type PaintedRect = Pick<CSSStyleDeclaration, "left" | "top" | "width" | "height" | "transform" | "transformOrigin">;

type ChromeScale = { x: number; y: number };

// Chromium's layout boxes quantize CSS dimensions down to 1/64 CSS px. Keep
// the compensating transform aligned with that same rendered value.
const layoutUnit = (value: number) => Math.max(1 / 64, Math.floor(value * 64) / 64);

/**
 * Convert viewport geometry to CSS coordinates for the chrome's containing
 * block, then snap its four bounds to the owning window's device-pixel grid.
 * This reads only the chrome's positioning ancestor, never the inspected node.
 */
export function snapChromeRect(
  rect: Rect,
  chrome: HTMLElement | undefined,
  devicePixelRatio: number,
): PaintedRect {
  const view = chrome?.ownerDocument.defaultView;
  const dpr = devicePixelRatio || 1;
  const container = chrome?.offsetParent;

  if (!view || !(container instanceof view.HTMLElement)) {
    const left = Math.round(rect.left * dpr) / dpr;
    const top = Math.round(rect.top * dpr) / dpr;
    const right = Math.round((rect.left + rect.width) * dpr) / dpr;
    const bottom = Math.round((rect.top + rect.height) * dpr) / dpr;
    const scrollX = container ? 0 : view?.scrollX ?? 0;
    const scrollY = container ? 0 : view?.scrollY ?? 0;

    return {
      left: `${left + scrollX}px`,
      top: `${top + scrollY}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
      transform: `translate(${left + scrollX - layoutUnit(left + scrollX)}px, ${top + scrollY - layoutUnit(top + scrollY)}px) scale(${(right - left) / layoutUnit(right - left)}, ${(bottom - top) / layoutUnit(bottom - top)})`,
      transformOrigin: "top left",
    };
  }

  const bounds = container.getBoundingClientRect();
  const scaleX = bounds.width / (container.offsetWidth || 1) || 1;
  const scaleY = bounds.height / (container.offsetHeight || 1) || 1;
  const originX = bounds.left + container.clientLeft * scaleX;
  const originY = bounds.top + container.clientTop * scaleY;
  const left = Math.round(rect.left * dpr) / dpr;
  const top = Math.round(rect.top * dpr) / dpr;
  const right = Math.round((rect.left + rect.width) * dpr) / dpr;
  const bottom = Math.round((rect.top + rect.height) * dpr) / dpr;

  const rootScrollX = container === view.document.documentElement ? view.scrollX : 0;
  const rootScrollY = container === view.document.documentElement ? view.scrollY : 0;
  const localLeft = (left - originX) / scaleX + container.scrollLeft + rootScrollX;
  const localTop = (top - originY) / scaleY + container.scrollTop + rootScrollY;
  const localWidth = (right - left) / scaleX;
  const localHeight = (bottom - top) / scaleY;

  return {
    left: `${localLeft}px`,
    top: `${localTop}px`,
    width: `${localWidth}px`,
    height: `${localHeight}px`,
    transform: `translate(${localLeft - layoutUnit(localLeft)}px, ${localTop - layoutUnit(localTop)}px) scale(${localWidth / layoutUnit(localWidth)}, ${localHeight / layoutUnit(localHeight)})`,
    transformOrigin: "top left",
  };
}
/** Thickness in local CSS pixels for one whole, rounded device-pixel width. */
export function chromeEdgeThickness(devicePixelRatio: number, scale = 1): number {
  return Math.max(1, Math.round(devicePixelRatio)) / devicePixelRatio / scale;
}

export function chromeEdgeScale(chrome: HTMLElement | undefined): ChromeScale {
  // SAFETY: HTMLElement.offsetParent is an HTMLElement in the overlay's owner document.
  const parent = chrome?.offsetParent as HTMLElement | null | undefined;

  if (!parent) return { x: 1, y: 1 };

  const bounds = parent.getBoundingClientRect();

  return {
    x: bounds.width / (parent.offsetWidth || 1) || 1,
    y: bounds.height / (parent.offsetHeight || 1) || 1,
  } satisfies ChromeScale;
}
