import { GUIDE_HITBOX_SIZE } from "../../core/constants";
import { getSnapGuidePosition } from "../../core/guides";
import { getDistanceOverlay } from "../../core/distances";
import { projectRectToDocument } from "../../core/frame-geometry";
import type { GuideStyle } from "../../core/persistence";
import type { Guide } from "../../core/types";

type PreviewGuidesOptions = {
  document: Document;
  frame: HTMLIFrameElement;
  previewId: number;
  parent: HTMLElement;
  size: () => { width: number; height: number };
  scale: () => number;
  getGuides: () => Guide[];
  setGuides: (guides: Guide[]) => void;
  active: () => boolean;
  orientation: () => Guide["orientation"];
  altPressed: () => boolean;
  hostWindow: Window;
  color: () => string;
  style: () => GuideStyle;
  snapGuidesEnabled: () => boolean;
};

const activeColor = "#0d99ff";

export function mountPreviewGuides(options: PreviewGuidesOptions) {
  const { document, frame, parent, hostWindow } = options;
  const layer = document.createElement("div");
  layer.dataset.mesurerPreviewGuides = "true";
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    zIndex: "4",
    transformOrigin: "top left",
    pointerEvents: "none",
    touchAction: "none",
  });
  parent.append(layer);

  let selected: string[] = [];
  let drag: { id: string; orientation: Guide["orientation"] } | null = null;
  let dragPointerId: number | null = null;
  let alt = false;
  let lastPointer: { clientX: number; clientY: number } | null = null;
  let disposed = false;

  const sync = () => {
    const size = options.size();
    const scale = options.scale();
    layer.style.width = `${size.width}px`;
    layer.style.height = `${size.height}px`;
    layer.style.transform = `scale(${scale})`;
    layer.style.pointerEvents = options.active() ? "auto" : "none";
    layer.style.cursor = options.active() ? "crosshair" : "";
    layer.dataset.mesurerGuidesActive = options.active() ? "true" : "false";
    layer.dataset.mesurerGuideSelection = selected.join(",");
    layer.replaceChildren();

    for (const guide of options.getGuides()) {
      const hit = document.createElement("div");
      hit.dataset.mesurerPreviewGuide = guide.id;
      hit.dataset.orientation = guide.orientation;
      hit.dataset.position = String(guide.position);
      hit.dataset.selected = String(selected.includes(guide.id));
      Object.assign(hit.style, {
        position: "absolute",
        ...(guide.orientation === "vertical"
          ? { left: `${guide.position - GUIDE_HITBOX_SIZE / 2}px`, top: "0", width: `${GUIDE_HITBOX_SIZE}px`, height: `${size.height}px` }
          : { top: `${guide.position - GUIDE_HITBOX_SIZE / 2}px`, left: "0", height: `${GUIDE_HITBOX_SIZE}px`, width: `${size.width}px` }),
        pointerEvents: "none",
      });
      const line = document.createElement("div");
      Object.assign(line.style, {
        position: "absolute",
        background: selected.includes(guide.id) ? activeColor : options.color(),
        opacity: String(options.style().opacity),
        ...(guide.orientation === "vertical"
          ? { left: `${GUIDE_HITBOX_SIZE / 2}px`, top: "0", width: `${Math.max(1, options.style().width)}px`, height: `${size.height}px` }
          : { top: `${GUIDE_HITBOX_SIZE / 2}px`, left: "0", height: `${Math.max(1, options.style().width)}px`, width: `${size.width}px` }),
      });
      hit.append(line);
      layer.append(hit);
    }
  };

  const toPoint = (event: Pick<MouseEvent, "clientX" | "clientY">) => {
    const rect = frame.getBoundingClientRect();
    const scale = options.scale() || 1;

    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };

  const nearestGuide = (point: { x: number; y: number }) => {
    const reach = GUIDE_HITBOX_SIZE / 2;

    return options.getGuides().find((guide) =>
      Math.abs((guide.orientation === "vertical" ? point.x : point.y) - guide.position) <= reach);
  };

  const snap = (orientation: Guide["orientation"], point: { x: number; y: number }, omitId?: string) => {
    const doc = frame.contentDocument;

    if (!doc) return orientation === "vertical" ? point.x : point.y;

    return getSnapGuidePosition({
      orientation,
      point,
      snapGuidesEnabled: options.snapGuidesEnabled(),
      overlayNode: null,
      guides: options.getGuides(),
      draggingGuideId: omitId ?? null,
      document: doc,
    });
  };

  const onDown = (event: PointerEvent) => {
    if (!options.active() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    options.hostWindow.dispatchEvent(new CustomEvent("mesurer:responsive-preview-guides-active", { detail: options.previewId }));
    const point = toPoint(event);
    const hit = nearestGuide(point);
    const guides = options.getGuides();

    if (hit) {
      selected = event.shiftKey
        ? selected.includes(hit.id) ? selected.filter((id) => id !== hit.id) : [...selected, hit.id]
        : selected.includes(hit.id) ? selected : [hit.id];
      drag = { id: hit.id, orientation: hit.orientation };
    } else {
      if (!event.shiftKey) selected = [];
      const orientation = options.orientation();
      const id = `preview-guide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const position = snap(orientation, point);
      options.setGuides([...guides, { id, orientation, position }]);
      selected = event.shiftKey ? [...selected, id] : [id];
      drag = { id, orientation };
    }

    dragPointerId = event.pointerId;
    layer.setPointerCapture(event.pointerId);
    sync();
  };

  const onMove = (event: MouseEvent) => {
    if (!options.active()) return;

    if (drag) {
      event.preventDefault();
      event.stopPropagation();
    }

    lastPointer = { clientX: event.clientX, clientY: event.clientY };

    const point = toPoint(event);

    if (drag) {
      const size = options.size();
      const rawPosition = drag.orientation === "vertical" ? point.x : point.y;
      const limit = drag.orientation === "vertical" ? size.width : size.height;

      const position = rawPosition < 0 || rawPosition > limit
        ? rawPosition
        : snap(drag.orientation, point, drag.id);

      options.setGuides(options.getGuides().map((guide) => guide.id === drag!.id ? { ...guide, position } : guide));
      sync();
    } else if (alt || event.altKey) {
      const guide = selected.length ? options.getGuides().find((item) => item.id === selected.at(-1)) : null;
      const targetDocument = frame.contentDocument;

      const hoveredGuide = guide
        ? nearestGuide(point)
        : null;

      const target = targetDocument?.elementFromPoint(point.x, point.y);
      let label = layer.querySelector<HTMLElement>("[data-mesurer-preview-guide-distance]");

      if (!guide || (!hoveredGuide && (!target || target === frame.contentDocument?.body || target === frame.contentDocument?.documentElement))) {
        label?.remove();

        return;
      }

      if (!label) {
        label = document.createElement("span");
        label.dataset.mesurerPreviewGuideDistance = "true";
        Object.assign(label.style, {
          position: "absolute",
          padding: "2px 4px",
          borderRadius: "3px",
          color: "white",
          background: "rgba(24,24,27,.9)",
          font: "10px ui-sans-serif,system-ui,sans-serif",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        });
        layer.append(label);
      }

      const guideRect = guide.orientation === "vertical"
        ? { left: guide.position, top: 0, width: 0, height: options.size().height }
        : { left: 0, top: guide.position, width: options.size().width, height: 0 };

      const targetRect = hoveredGuide && hoveredGuide.id !== guide.id
        ? hoveredGuide.orientation === "vertical"
          ? { left: hoveredGuide.position, top: 0, width: 0, height: options.size().height }
          : { left: 0, top: hoveredGuide.position, width: options.size().width, height: 0 }
        : targetDocument && target
          ? projectRectToDocument(target.getBoundingClientRect(), target.ownerDocument, targetDocument)
          : target?.getBoundingClientRect();

      if (!targetRect) return;

      const distance = getDistanceOverlay(guideRect, targetRect, null, target, targetDocument?.defaultView ?? window);
      const value = guide.orientation === "vertical" ? distance.horizontal?.value : distance.vertical?.value;
      label.textContent = `${Math.round(value ?? 0)}px`;
      label.style.left = `${point.x + 8}px`;
      label.style.top = `${point.y + 8}px`;
    }
  };

  const onUp = (event: MouseEvent) => {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const current = drag;
    drag = null;
    const pointerId = dragPointerId;
    dragPointerId = null;
    const point = toPoint(event);
    const size = options.size();
    const limit = current.orientation === "vertical" ? size.width : size.height;
    const releasePosition = current.orientation === "vertical" ? point.x : point.y;
    const guide = options.getGuides().find((item) => item.id === current.id);

    if (guide && (releasePosition < 0 || releasePosition > limit)) {
      options.setGuides(options.getGuides().filter((item) => item.id !== current.id));
      selected = selected.filter((id) => id !== current.id);
    }

    if (pointerId !== null && layer.hasPointerCapture(pointerId)) {
      layer.releasePointerCapture(pointerId);
    }

    sync();
  };

  const finishDrag = () => {
    if (!drag) return;
    const pointerId = dragPointerId;
    drag = null;
    dragPointerId = null;

    if (pointerId !== null && layer.hasPointerCapture(pointerId)) {
      layer.releasePointerCapture(pointerId);
    }

    sync();
  };

  const onLostPointerCapture = (event: PointerEvent) => {
    if (event.pointerId === dragPointerId) finishDrag();
  };

  const removeSelected = () => {
    if (!selected.length) return;
    options.setGuides(options.getGuides().filter((guide) => !selected.includes(guide.id)));
    selected = [];
    sync();
  };

  const onAlt = (event: Event) => {
    // SAFETY: this listener is registered only for the internal custom event whose detail is boolean.
    alt = (event as CustomEvent<boolean>).detail;

    if (lastPointer) {
      onMove(new PointerEvent("pointermove", { ...lastPointer, altKey: alt }));

      if (!alt) layer.querySelector("[data-mesurer-preview-guide-distance]")?.remove();
    }
  };

  const onMode = (event: Event) => {
    // SAFETY: this listener is registered only for the internal custom event whose detail is boolean.
    const active = (event as CustomEvent<boolean>).detail;

    if (!active) {
      selected = [];
      drag = null;
      dragPointerId = null;
      layer.dataset.mesurerAltTarget = "";
    }

    layer.querySelector("[data-mesurer-preview-guide-distance]")?.remove();
    sync();
  };

  layer.addEventListener("pointerdown", onDown);
  layer.addEventListener("lostpointercapture", onLostPointerCapture);
  hostWindow.addEventListener("pointermove", onMove, true);
  hostWindow.addEventListener("pointerup", onUp, true);
  hostWindow.addEventListener("pointercancel", onUp, true);
  hostWindow.addEventListener("mousemove", onMove, true);
  hostWindow.addEventListener("mouseup", onUp, true);
  hostWindow.addEventListener("blur", finishDrag);
  hostWindow.addEventListener("mesurer:responsive-guide-alt", onAlt);
  hostWindow.addEventListener("mesurer:responsive-guide-mode", onMode);
  sync();

  return {
    sync,
    removeSelected,
    dispose() {
      if (disposed) return;
      disposed = true;
      layer.removeEventListener("pointerdown", onDown);
      layer.removeEventListener("lostpointercapture", onLostPointerCapture);
      hostWindow.removeEventListener("pointermove", onMove, true);
      hostWindow.removeEventListener("pointerup", onUp, true);
      hostWindow.removeEventListener("pointercancel", onUp, true);
      hostWindow.removeEventListener("mousemove", onMove, true);
      hostWindow.removeEventListener("mouseup", onUp, true);
      hostWindow.removeEventListener("blur", finishDrag);
      hostWindow.removeEventListener("mesurer:responsive-guide-alt", onAlt);
      hostWindow.removeEventListener("mesurer:responsive-guide-mode", onMode);
      layer.remove();
    },
  };
}
