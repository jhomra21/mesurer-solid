import type { Rect } from "../core/types";
import { projectRectToDocument } from "../core/frame-geometry";

type PreviewStageArea = { bounds: Rect; previews: Rect[] };

type PreviewGeometry = {
  visibleRect(): Rect | null;
  stageArea(): PreviewStageArea | null;
};

const previewGeometry = new WeakMap<HTMLIFrameElement, PreviewGeometry>();

/** Visible Responsive stage area around the preview that contains `source`. */
export function responsivePreviewStageArea(source: Document | undefined): PreviewStageArea | null {
  let view = source?.defaultView;

  while (view) {
    let frame: Element | null = null;

    try {
      frame = view.frameElement;
    } catch {
      return null;
    }

    if (!frame) return null;

    if (frame.hasAttribute("data-mesurer-responsive-frame")) {
      // SAFETY: This marker is written only on iframe elements by ResponsiveStage.
      return previewGeometry.get(frame as HTMLIFrameElement)?.stageArea() ?? null;
    }

    view = frame.ownerDocument.defaultView;
  }

  return null;
}

export function registerResponsivePreviewGeometry(
  frame: HTMLIFrameElement,
  geometry: PreviewGeometry,
) {
  previewGeometry.set(frame, geometry);

  return () => {
    if (previewGeometry.get(frame) === geometry) previewGeometry.delete(frame);
  };
}

export function responsivePreviewVisibleRect(source: Document | undefined): Rect | null | undefined {
  if (!source) return undefined;
  let view = source.defaultView;
  const nestedBounds: Array<{ frame: HTMLIFrameElement; document: Document }> = [];

  while (view) {
    let frame: Element | null = null;

    try {
      frame = view.frameElement;
    } catch {
      return null;
    }

    if (!frame) return undefined;

    if (frame.hasAttribute("data-mesurer-responsive-frame")) {
      // SAFETY: This marker is written only on iframe elements by ResponsiveStage.
      let visible = previewGeometry.get(frame as HTMLIFrameElement)?.visibleRect() ?? null;

      if (!visible) return null;
      const rootDocument = frame.ownerDocument;

      for (const { frame: nestedFrame, document } of nestedBounds) {
        const rect = nestedFrame.getBoundingClientRect();

        const projected = projectRectToDocument({
          left: rect.left + nestedFrame.clientLeft,
          top: rect.top + nestedFrame.clientTop,
          width: nestedFrame.clientWidth,
          height: nestedFrame.clientHeight,
        }, document, rootDocument);

        visible = intersectRect(visible, projected);
      }

      return visible;
    }

    if (frame.tagName === "IFRAME") {
      // SAFETY: The checked tagName narrows this frame to an iframe element.
      nestedBounds.push({ frame: frame as HTMLIFrameElement, document: frame.ownerDocument });
    }

    view = frame.ownerDocument.defaultView;
  }

  return undefined;
}

export function intersectRect(rect: Rect, bounds: Rect | null | undefined): Rect {
  if (bounds === undefined) return rect;

  if (!bounds) return { left: 0, top: 0, width: 0, height: 0 };
  const left = Math.max(rect.left, bounds.left);
  const top = Math.max(rect.top, bounds.top);
  const right = Math.min(rect.left + rect.width, bounds.left + bounds.width);
  const bottom = Math.min(rect.top + rect.height, bounds.top + bounds.height);

  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : { left, top, width: 0, height: 0 };
}
