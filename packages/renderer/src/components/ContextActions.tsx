import { For, Show, createMemo, createSignal, onCleanup, onSettled } from "solid-js";
import type { MesurerAnnotation, MesurerContextRequest, MesurerWorkspaceRuntime } from "../runtime/workspace-context";
import { CloseIcon, CopyIcon, NoteIcon, TrashIcon } from "./Icons";

export type ContextActionsController = {
  openNoteComposer(): void;
};

export type ContextActionsProps = {
  runtime: MesurerWorkspaceRuntime;
  onCopy: (request?: MesurerContextRequest) => Promise<void>;
  onController?: (controller: ContextActionsController | null) => void;
};

type PositionedRect = { left: number; top: number; width: number; height: number };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const annotationButtonClass = "msr:flex msr:w-6 msr:h-6 msr:items-center msr:justify-center msr:rounded-[7px] msr:border-0 msr:bg-transparent msr:text-black msr:outline-none msr:hover:bg-black/4 msr:disabled:cursor-default msr:disabled:opacity-40";

const unionRects = (rects: PositionedRect[]): PositionedRect | null => {
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
};

const placeSurfaceNear = (
  rect: PositionedRect,
  width: number,
  height: number,
  ownerWindow: Window,
  gap = 8,
) => {
  const padding = 8;
  const maxLeft = ownerWindow.innerWidth - width - padding;
  const maxTop = ownerWindow.innerHeight - height - padding;
  const right = rect.left + rect.width + gap;
  const left = rect.left - width - gap;
  const positionedLeft = right + width <= ownerWindow.innerWidth - padding
    ? right
    : left >= padding
      ? left
      : clamp(rect.left + rect.width - width, padding, maxLeft);
  const positionedTop = clamp(rect.top, padding, maxTop);
  return { left: positionedLeft, top: positionedTop };
};

export function ContextActions(props: ContextActionsProps) {
  const [revision, setRevision] = createSignal(0);
  const [activeAnnotationId, setActiveAnnotationId] = createSignal<string | null>(null);
  const [panelPositions, setPanelPositions] = createSignal<Record<string, { left: number; top: number }>>({});
  const [composerPosition, setComposerPosition] = createSignal<{ left: number; top: number } | null>(null);
  const [noteComposerOpen, setNoteComposerOpen] = createSignal(false);
  const [note, setNote] = createSignal("");
  const [noteError, setNoteError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  const [draggingSurfaceId, setDraggingSurfaceId] = createSignal<string | null>(null);
  let surfaceDrag: {
    surfaceId: string;
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    width: number;
    height: number;
  } | null = null;
  let surfaceDragCleanup: (() => void) | null = null;
  let anchorElement: HTMLSpanElement | undefined;

  const ownerWindow = () => anchorElement?.ownerDocument.defaultView ?? window;
  const unsubscribe = props.runtime.subscribe(() => setRevision((value) => value + 1));
  onCleanup(unsubscribe);

  const selection = createMemo(() => {
    revision();
    return props.runtime.currentSelection();
  });
  const annotations = createMemo(() => {
    revision();
    return props.runtime.annotations();
  });
  const activeAnnotation = createMemo(() => {
    const id = activeAnnotationId();
    return id ? annotations().find((annotation) => annotation.id === id) ?? null : null;
  });
  const hasSelection = () => selection().elements.length > 0 || selection().region !== null;
  const selectionRect = createMemo(() => {
    const value = selection();
    const elementRects = value.elements
      .filter((element) => element.isConnected)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      });
    return unionRects(elementRects) ?? value.region;
  });

  const selectionLabel = () => {
    const count = selection().elements.length;
    if (count > 1) return `${count} selected elements`;
    if (count === 1) return "Selected element";
    return "Selected region";
  };

  const annotationSelectionLabel = (value: MesurerAnnotation) => {
    if (value.anchor.kind !== "elements") return "Selected region";
    return `${value.anchor.targets.length} selected ${value.anchor.targets.length === 1 ? "element" : "elements"}`;
  };

  const selectionTriggerElement = () => {
    const elements = selection().elements;
    if (!elements.length) return null;
    const hovered = props.runtime.hoveredElement();
    return elements.find((element) => element === hovered)
      ?? elements.find((element) => hovered && element.contains(hovered))
      ?? elements[0];
  };

  const selectionTriggerPosition = () => {
    const element = selectionTriggerElement();
    if (!element?.isConnected) return null;
    const rect = element.getBoundingClientRect();
    const value = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const currentWindow = ownerWindow();
    const size = 24;
    const gap = 6;
    const padding = 4;
    const right = value.left + value.width;
    const bottom = value.top + value.height;
    const candidates = [
      { space: currentWindow.innerWidth - right, points: [
        { left: right + gap, top: value.top },
        { left: right + gap, top: bottom - size },
      ] },
      { space: value.left, points: [
        { left: value.left - size - gap, top: value.top },
        { left: value.left - size - gap, top: bottom - size },
      ] },
      { space: currentWindow.innerHeight - bottom, points: [
        { left: right - size, top: bottom + gap },
        { left: value.left, top: bottom + gap },
      ] },
      { space: value.top, points: [
        { left: right - size, top: value.top - size - gap },
        { left: value.left, top: value.top - size - gap },
      ] },
    ].sort((a, b) => b.space - a.space);
    const fitsViewport = (point: { left: number; top: number }) =>
      point.left >= padding && point.top >= padding
      && point.left + size <= currentWindow.innerWidth - padding
      && point.top + size <= currentWindow.innerHeight - padding;
    const fitted = candidates.flatMap((candidate) => candidate.points).find(fitsViewport);
    const fallback = { left: right + gap, top: value.top };
    return {
      left: clamp((fitted ?? fallback).left, padding, currentWindow.innerWidth - size - padding),
      top: clamp((fitted ?? fallback).top, padding, currentWindow.innerHeight - size - padding),
    };
  };

  const annotationLayout = (annotationId: string) => {
    const value = props.runtime.annotationRect(annotationId);
    if (!value) return null;
    const currentWindow = ownerWindow();
    const padding = 8;
    const markerSize = 24;
    const targetGap = 6;
    const panelGap = 8;
    const panelWidth = 272;
    const panelHeight = 176;
    const rightMarkerLeft = value.left + value.width + targetGap;
    const rightPanelLeft = rightMarkerLeft + markerSize + panelGap;
    const leftMarkerLeft = value.left - targetGap - markerSize;
    const leftPanelLeft = leftMarkerLeft - panelGap - panelWidth;
    const fitsRight = rightPanelLeft + panelWidth <= currentWindow.innerWidth - padding;
    const fitsLeft = leftPanelLeft >= padding;
    const markerLeft = fitsRight
      ? rightMarkerLeft
      : fitsLeft
        ? leftMarkerLeft
        : clamp(rightMarkerLeft, padding, currentWindow.innerWidth - markerSize - padding);
    const panelLeft = fitsRight
      ? rightPanelLeft
      : fitsLeft
        ? leftPanelLeft
        : placeSurfaceNear(value, panelWidth, panelHeight, currentWindow).left;
    const draggedPanel = panelPositions()[annotationId];
    return {
      marker: {
        left: markerLeft,
        top: clamp(value.top - markerSize / 2, 4, currentWindow.innerHeight - markerSize - 4),
      },
      panel: {
        left: draggedPanel
          ? clamp(draggedPanel.left, padding, currentWindow.innerWidth - panelWidth - padding)
          : panelLeft,
        top: draggedPanel
          ? clamp(draggedPanel.top, padding, currentWindow.innerHeight - panelHeight - padding)
          : clamp(value.top, padding, currentWindow.innerHeight - panelHeight - padding),
      },
    };
  };

  const markerPosition = (annotationId: string) => annotationLayout(annotationId)?.marker ?? null;

  const notePanelPosition = () => {
    const value = selectionRect();
    const currentWindow = ownerWindow();
    const width = 272;
    const height = 154;
    const dragged = composerPosition();
    if (dragged) {
      return {
        left: clamp(dragged.left, 8, currentWindow.innerWidth - width - 8),
        top: clamp(dragged.top, 8, currentWindow.innerHeight - height - 8),
      };
    }
    if (!value) return { left: 8, top: 8 };
    return placeSurfaceNear(value, width, height, currentWindow);
  };

  const panelPosition = (annotationId: string) => annotationLayout(annotationId)?.panel ?? { left: 8, top: 8 };

  const openAnnotation = (annotationId: string) => {
    setNoteComposerOpen(false);
    setActiveAnnotationId(annotationId);
    setStatus(null);
  };

  const startSurfaceDrag = (event: PointerEvent & { currentTarget: HTMLDivElement }, surfaceId: string) => {
    const ElementCtor = event.currentTarget.ownerDocument.defaultView?.Element;
    const target = event.target;
    if (event.button !== 0 || (ElementCtor && target instanceof ElementCtor && target.closest("button"))) return;
    const panel = event.currentTarget.parentElement;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const currentWindow = ownerWindow();
    const root = currentWindow.document.documentElement;
    const previousUserSelect = root.style.userSelect;
    root.style.setProperty("user-select", "none", "important");
    surfaceDrag = {
      surfaceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      width: rect.width,
      height: rect.height,
    };
    setDraggingSurfaceId(surfaceId);
    event.preventDefault();
    event.stopPropagation();

    const move = (next: PointerEvent) => {
      if (!surfaceDrag || next.pointerId !== surfaceDrag.pointerId) return;
      const drag = surfaceDrag;
      const maxLeft = Math.max(8, currentWindow.innerWidth - drag.width - 8);
      const maxTop = Math.max(8, currentWindow.innerHeight - drag.height - 8);
      const position = {
        left: clamp(drag.originLeft + next.clientX - drag.startX, 8, maxLeft),
        top: clamp(drag.originTop + next.clientY - drag.startY, 8, maxTop),
      };
      if (surfaceId === "composer") {
        setComposerPosition(position);
      } else {
        setPanelPositions((positions) => ({ ...positions, [surfaceId]: position }));
      }
    };
    const end = (next: PointerEvent) => {
      if (!surfaceDrag || next.pointerId !== surfaceDrag.pointerId) return;
      root.style.userSelect = previousUserSelect;
      currentWindow.removeEventListener("pointermove", move);
      currentWindow.removeEventListener("pointerup", end);
      currentWindow.removeEventListener("pointercancel", end);
      surfaceDrag = null;
      setDraggingSurfaceId(null);
      surfaceDragCleanup = null;
    };
    currentWindow.addEventListener("pointermove", move);
    currentWindow.addEventListener("pointerup", end);
    currentWindow.addEventListener("pointercancel", end);
    surfaceDragCleanup = () => {
      root.style.userSelect = previousUserSelect;
      currentWindow.removeEventListener("pointermove", move);
      currentWindow.removeEventListener("pointerup", end);
      currentWindow.removeEventListener("pointercancel", end);
      setDraggingSurfaceId(null);
    };
  };

  onCleanup(() => {
    surfaceDragCleanup?.();
    surfaceDragCleanup = null;
    surfaceDrag = null;
  });

  const run = async (action: () => Promise<void>, success: string) => {
    if (busy()) return;
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const openNoteComposer = () => {
    if (!hasSelection()) return;
    setNoteError(null);
    setStatus(null);
    setActiveAnnotationId(null);
    setComposerPosition(null);
    setNoteComposerOpen(true);
  };

  const closeNoteComposer = () => {
    setNoteComposerOpen(false);
    setNoteError(null);
    setComposerPosition(null);
  };

  const addNote = () => {
    try {
      const annotation = props.runtime.addSelectionAnnotation(note());
      setNote("");
      setNoteError(null);
      setNoteComposerOpen(false);
      setComposerPosition(null);
      setActiveAnnotationId(annotation.id);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : String(error));
    }
  };

  onSettled(() => {
    props.onController?.({ openNoteComposer });
    return () => props.onController?.(null);
  });

  return (
    <>
      <span ref={(element) => { anchorElement = element; }} aria-hidden="true" style={{ display: "none" }} />

      <Show when={selection().elements.length > 0 && !noteComposerOpen() && !activeAnnotation()}>
        <Show when={selectionTriggerPosition()}>{(position) => (
          <button
            type="button"
            data-mesurer-layer="chrome"
            data-mesurer-inspector-ui="true"
            data-mesurer-annotation-trigger="true"
            aria-label="Annotate selection"
            title="Annotate selection"
            class="msr:pointer-events-auto msr:fixed msr:z-[95] msr:flex msr:w-6 msr:h-6 msr:items-center msr:justify-center msr:rounded-[7px] msr:border msr:border-ink-200 msr:bg-white msr:text-black msr:outline-none msr:hover:bg-ink-50 msr:focus-visible:border-[#0d99ff]"
            style={{ left: `${position().left}px`, top: `${position().top}px` }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); openNoteComposer(); }}
          >
            <NoteIcon size={14} />
          </button>
        )}</Show>
      </Show>

      <Show when={noteComposerOpen() && selectionRect()}>
        <div
          data-mesurer-layer="chrome"
          data-mesurer-inspector-ui="true"
          data-mesurer-annotation-composer="true"
          class="mesurer-menu-surface msr:pointer-events-auto msr:fixed msr:z-[95] msr:w-[272px] msr:max-w-[calc(100vw-16px)] msr:rounded-[10px] msr:border msr:border-ink-200 msr:bg-white msr:p-1.5 msr:text-black"
          style={{ left: `${notePanelPosition().left}px`, top: `${notePanelPosition().top}px` }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            class="msr:flex msr:h-7 msr:items-center msr:gap-1.5 msr:px-1"
            style={{ cursor: draggingSurfaceId() === "composer" ? "grabbing" : "grab" }}
            aria-label="Drag note composer"
            onPointerDown={(event) => startSurfaceDrag(event, "composer")}
          >
            <NoteIcon size={14} class="msr:text-ink-700" />
            <div class="msr:min-w-0 msr:flex-1">
              <div class="msr:text-[11px] msr:font-medium msr:text-ink-900">Add note</div>
              <div class="msr:text-[9px] msr:text-ink-500">{selectionLabel()}</div>
            </div>
            <button type="button" class={annotationButtonClass} aria-label="Close note composer" title="Close" onClick={closeNoteComposer}><CloseIcon size={14} /></button>
          </div>
          <textarea
            autofocus
            value={note()}
            placeholder="Describe what should change…"
            onInput={(event) => {
              setNote(event.currentTarget.value);
              setNoteError(null);
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                addNote();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeNoteComposer();
              }
            }}
            class="msr:box-border msr:mt-1 msr:h-20 msr:w-full msr:resize-none msr:rounded-[7px] msr:border msr:border-ink-200 msr:bg-white msr:p-2 msr:text-[12px] msr:leading-[1.4] msr:text-black msr:outline-none msr:placeholder:text-ink-400 msr:focus:border-[#0d99ff]"
          />
          <Show when={noteError()}>{(message) => <div class="msr:mt-1.5 msr:px-1 msr:text-[10px] msr:text-red-600">{message()}</div>}</Show>
          <div class="msr:mt-1.5 msr:flex msr:h-7 msr:items-center msr:justify-between msr:gap-2 msr:px-1">
            <span class="msr:text-[9px] msr:text-ink-400">⌘/Ctrl ↵</span>
            <div class="msr:flex msr:gap-1">
              <button type="button" class="msr:h-7 msr:rounded-[7px] msr:border-0 msr:bg-transparent msr:px-2 msr:text-[11px] msr:text-ink-700 msr:hover:bg-black/4" onClick={closeNoteComposer}>Cancel</button>
              <button type="button" class="msr:h-7 msr:rounded-[7px] msr:border-0 msr:bg-[#0d99ff] msr:px-2.5 msr:text-[11px] msr:font-medium msr:text-white msr:hover:bg-[#0b8eea]" onClick={addNote}>Add note</button>
            </div>
          </div>
        </div>
      </Show>

      <For each={annotations()}>{(annotation, index) => {
        const position = () => markerPosition(annotation.id);
        return (
          <Show when={position()}>{(value) => (
            <button
              type="button"
              data-mesurer-layer="evidence"
              data-mesurer-annotation-marker="true"
              aria-label={`Mesurer annotation ${index() + 1}: ${annotation.note}`}
              title={annotation.note}
              aria-expanded={activeAnnotationId() === annotation.id ? "true" : "false"}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openAnnotation(annotation.id);
              }}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openAnnotation(annotation.id);
              }}
              class="msr:pointer-events-auto msr:fixed msr:z-[94] msr:flex msr:w-6 msr:h-6 msr:items-center msr:justify-center msr:rounded-[7px] msr:border msr:border-[#0d99ff] msr:bg-white msr:text-[#0d99ff] msr:outline-none msr:hover:bg-[#0d99ff]/8"
              style={{ left: `${value().left}px`, top: `${value().top}px` }}
            ><NoteIcon size={14} /></button>
          )}</Show>
        );
      }}</For>

      <Show when={activeAnnotation()}>{(annotation) => {
        const position = () => panelPosition(annotation().id);
        return (
          <div
            data-mesurer-layer="chrome"
            data-mesurer-inspector-ui="true"
            data-mesurer-annotation-panel="true"
            class="mesurer-menu-surface msr:pointer-events-auto msr:fixed msr:z-[95] msr:w-[272px] msr:max-h-[220px] msr:rounded-[10px] msr:border msr:border-ink-200 msr:bg-white msr:p-1.5 msr:text-black"
            style={{ left: `${position().left}px`, top: `${position().top}px` }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              class="msr:flex msr:h-7 msr:items-center msr:gap-1.5 msr:px-1"
              style={{ cursor: draggingSurfaceId() === annotation().id ? "grabbing" : "grab" }}
              aria-label="Drag annotation panel"
              onPointerDown={(event) => startSurfaceDrag(event, annotation().id)}
            >
              <NoteIcon size={14} class="msr:text-[#0d99ff]" />
              <div class="msr:min-w-0 msr:flex-1">
                <div class="msr:text-[11px] msr:font-medium msr:text-ink-700">Note {annotations().findIndex((item) => item.id === annotation().id) + 1}</div>
                <div class="msr:text-[9px] msr:text-ink-500">{annotationSelectionLabel(annotation())}</div>
              </div>
              <div class="msr:flex msr:items-center msr:gap-0.5">
                <button type="button" class={annotationButtonClass} aria-label="Copy annotation context" title="Copy context" disabled={busy()} onClick={() => void run(() => props.onCopy({ annotation: annotation().id }), "Copied")}><CopyIcon size={14} /></button>
                <button type="button" class={annotationButtonClass} aria-label="Delete annotation" title="Delete" onClick={() => {
                  props.runtime.removeAnnotation(annotation().id);
                  setPanelPositions((positions) => {
                    const next = { ...positions };
                    delete next[annotation().id];
                    return next;
                  });
                  setActiveAnnotationId(null);
                  setStatus(null);
                }}><TrashIcon size={14} /></button>
                <button type="button" class={annotationButtonClass} aria-label="Close annotation" title="Close" onClick={() => {
                  setActiveAnnotationId(null);
                  setStatus(null);
                }}><CloseIcon size={14} /></button>
              </div>
            </div>
            <div class="msr:mx-1 msr:mt-1 msr:max-h-36 msr:overflow-auto msr:whitespace-pre-wrap msr:rounded-[7px] msr:bg-ink-50 msr:px-2 msr:py-2 msr:text-[12px] msr:leading-[1.45] msr:text-ink-800">{annotation().note}</div>
            <Show when={status()}>{(message) => <div class="msr:mt-1.5 msr:px-1 msr:text-[10px] msr:text-ink-500" role="status">{message()}</div>}</Show>
          </div>
        );
      }}</Show>
    </>
  );
}
