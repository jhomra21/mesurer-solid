import type { Rect } from "../core/types";

type PaintedRect = Pick<CSSStyleDeclaration, "left" | "top" | "width" | "height">;

/** Snap final painted bounds in the coordinate space used by the chrome. */
export function snapChromeRect(
  rect: Rect,
  devicePixelRatio: number,
  offsetX = 0,
  offsetY = 0,
): PaintedRect {
  const dpr = devicePixelRatio || 1;
  const left = Math.round((rect.left + offsetX) * dpr) / dpr;
  const top = Math.round((rect.top + offsetY) * dpr) / dpr;
  const right = Math.round((rect.left + rect.width + offsetX) * dpr) / dpr;
  const bottom = Math.round((rect.top + rect.height + offsetY) * dpr) / dpr;

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${right - left}px`,
    height: `${bottom - top}px`,
  };
}

/**
 * Reports the window's current device pixel ratio, then again whenever it
 * changes (zoom, display move). The ratio is read from the browser, never from
 * previously reported state, so callers do not have to read their own signal.
 * Returns the stop function.
 */
export function watchDevicePixelRatio(
  ownerWindow: Window,
  report: (devicePixelRatio: number) => void,
): () => void {
  let resolution: MediaQueryList | undefined;

  const arm = () => {
    resolution = ownerWindow.matchMedia(`(resolution: ${ownerWindow.devicePixelRatio}dppx)`);
    resolution.addEventListener("change", onChange, { once: true });
  };

  const onChange = () => {
    report(ownerWindow.devicePixelRatio || 1);
    arm();
  };

  report(ownerWindow.devicePixelRatio || 1);
  arm();

  return () => resolution?.removeEventListener("change", onChange);
}

/** Whole-device-pixel edge thickness expressed in CSS pixels. */
export function chromeEdgeThickness(devicePixelRatio: number): number {
  const dpr = devicePixelRatio || 1;

  return Math.max(1, Math.round(dpr)) / dpr;
}
