import { For, Show, createMemo, createSignal, onCleanup, onSettled } from "solid-js";
import type { MesurerContextRequest, MesurerWorkspaceRuntime } from "../runtime/workspace-context";
import { CloseIcon, CopyIcon, SendIcon, TrashIcon } from "./Icons";

export type ContextActionsController = {
  openNoteComposer(): void;
};

export type ContextActionsProps = {
  runtime: MesurerWorkspaceRuntime;
  onCopy: (request?: MesurerContextRequest) => Promise<void>;
  onSend?: (request?: MesurerContextRequest) => Promise<void>;
  sendLabel?: string;
  onController?: (controller: ContextActionsController | null) => void;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const annotationButtonClass = "msr:flex msr:size-7 msr:items-center msr:justify-center msr:rounded-[7px] msr:border-0 msr:bg-transparent msr:text-black msr:outline-none msr:hover:bg-black/4 msr:disabled:cursor-default msr:disabled:opacity-40";

export function ContextActions(props: ContextActionsProps) {
  const [revision, setRevision] = createSignal(0);
  const [noteAnchor, setNoteAnchor] = createSignal<HTMLElement | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = createSignal<string | null>(null);
  const [noteComposerOpen, setNoteComposerOpen] = createSignal(false);
  const [note, setNote] = createSignal("");
  const [noteError, setNoteError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  let anchorElement: HTMLSpanElement | undefined;
  let mountFrame = 0;

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
  const hasSelection = () => selection().elements.length > 0;

  const markerPosition = (annotationId: string) => {
    const value = props.runtime.annotationRect(annotationId);
    if (!value) return null;
    const currentWindow = ownerWindow();
    return {
      left: clamp(value.left + value.width - 10, 4, currentWindow.innerWidth - 26),
      top: clamp(value.top - 10, 4, currentWindow.innerHeight - 26),
    };
  };

  const notePanelPosition = () => {
    const tool = noteAnchor();
    if (!tool) return { left: 8, top: 8 };
    const currentWindow = ownerWindow();
    const rect = tool.getBoundingClientRect();
    const width = 280;
    const height = 150;
    const padding = 8;
    const gap = 8;
    const left = clamp(rect.right - width, padding, currentWindow.innerWidth - width - padding);
    const below = rect.bottom + gap;
    const top = below + height <= currentWindow.innerHeight - padding
      ? below
      : clamp(rect.top - height - gap, padding, currentWindow.innerHeight - height - padding);
    return { left, top };
  };

  const panelPosition = (annotationId: string) => {
    const value = props.runtime.annotationRect(annotationId);
    if (!value) return { left: 8, top: 8 };
    const currentWindow = ownerWindow();
    const width = 280;
    const panelHeight = 220;
    const padding = 8;
    const gap = 8;
    const left = clamp(value.left + value.width - width, padding, currentWindow.innerWidth - width - padding);
    const below = value.top + 18;
    const top = below + panelHeight <= currentWindow.innerHeight - padding
      ? below
      : clamp(value.top - panelHeight - gap, padding, currentWindow.innerHeight - panelHeight - padding);
    return { left, top };
  };

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
    setNoteComposerOpen(true);
  };

  const addNote = () => {
    try {
      const annotation = props.runtime.addSelectionAnnotation(note());
      setNote("");
      setNoteError(null);
      setNoteComposerOpen(false);
      setActiveAnnotationId(annotation.id);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : String(error));
    }
  };

  onSettled(() => {
    const currentWindow = ownerWindow();
    props.onController?.({ openNoteComposer });

    const findNoteTool = () => {
      if (!anchorElement) return;
      const root = anchorElement.getRootNode() as ParentNode;
      const tool = root.querySelector?.<HTMLElement>("[data-mesurer-tool-id='context.add-note']") ?? null;
      if (!tool) {
        mountFrame = currentWindow.requestAnimationFrame(findNoteTool);
        return;
      }
      setNoteAnchor(tool);
    };
    findNoteTool();

    return () => {
      currentWindow.cancelAnimationFrame(mountFrame);
      props.onController?.(null);
      setNoteAnchor(null);
    };
  });

  return (
    <>
      <span ref={(element) => { anchorElement = element; }} aria-hidden="true" style={{ display: "none" }} />

      <Show when={noteComposerOpen() && noteAnchor()}>
        <div
          data-mesurer-layer="chrome"
          data-mesurer-inspector-ui="true"
          class="mesurer-menu-surface msr:pointer-events-auto msr:fixed msr:z-[95] msr:w-[280px] msr:max-w-[calc(100vw-16px)] msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-2"
          style={{ left: `${notePanelPosition().left}px`, top: `${notePanelPosition().top}px` }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
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
                setNoteComposerOpen(false);
              }
            }}
            class="msr:box-border msr:h-20 msr:w-full msr:resize-y msr:rounded-md msr:border msr:border-ink-200 msr:bg-white msr:p-2 msr:text-[12px] msr:text-black msr:outline-none msr:focus:border-ink-400"
          />
          <Show when={noteError()}>{(message) => <div class="msr:mt-1.5 msr:text-[11px] msr:text-red-600">{message()}</div>}</Show>
          <div class="msr:mt-2 msr:flex msr:items-center msr:justify-between msr:gap-2">
            <span class="msr:text-[10px] msr:text-ink-500">⌘/Ctrl + Enter</span>
            <div class="msr:flex msr:gap-1">
              <button type="button" class="msr:rounded-md msr:border-0 msr:bg-transparent msr:px-2 msr:py-1.5 msr:text-[11px] msr:text-black msr:hover:bg-black/4" onClick={() => setNoteComposerOpen(false)}>Cancel</button>
              <button type="button" class="msr:rounded-md msr:border-0 msr:bg-[#0d99ff] msr:px-2 msr:py-1.5 msr:text-[11px] msr:font-medium msr:text-white" onClick={addNote}>Add note</button>
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
              aria-label={`Mesurer annotation ${index() + 1}: ${annotation.note}`}
              title={annotation.note}
              onClick={() => {
                setActiveAnnotationId(annotation.id);
                setStatus(null);
              }}
              style={{
                position: "fixed",
                left: `${value().left}px`,
                top: `${value().top}px`,
                width: "22px",
                height: "22px",
                border: "2px solid white",
                "border-radius": "999px",
                background: "#0d99ff",
                color: "white",
                cursor: "pointer",
                "font-family": "ui-sans-serif, system-ui, sans-serif",
                "font-size": "11px",
                "font-weight": 700,
                "line-height": "18px",
                padding: "0",
                "pointer-events": "auto",
                "z-index": 2147483300,
              }}
            >{index() + 1}</button>
          )}</Show>
        );
      }}</For>

      <Show when={activeAnnotation()}>{(annotation) => {
        const position = () => panelPosition(annotation().id);
        return (
          <div
            data-mesurer-layer="chrome"
            data-mesurer-inspector-ui="true"
            class="mesurer-menu-surface msr:pointer-events-auto msr:fixed msr:z-[95] msr:w-[280px] msr:max-h-[220px] msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-2 msr:text-black"
            style={{ left: `${position().left}px`, top: `${position().top}px` }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div class="msr:flex msr:items-center msr:justify-between msr:gap-2">
              <div class="msr:min-w-0 msr:flex-1 msr:text-[11px] msr:font-medium msr:text-ink-500">Note {annotations().findIndex((item) => item.id === annotation().id) + 1}</div>
              <div class="msr:flex msr:items-center msr:gap-0.5">
                <button type="button" class={annotationButtonClass} aria-label="Copy annotation context" title="Copy context" disabled={busy()} onClick={() => void run(() => props.onCopy({ annotation: annotation().id }), "Copied")}><CopyIcon size={17} /></button>
                <Show when={props.onSend}>{(send) => (
                  <button type="button" class={annotationButtonClass} aria-label={props.sendLabel ?? "Send to agent"} title={props.sendLabel ?? "Send to agent"} disabled={busy()} onClick={() => void run(() => send()({ annotation: annotation().id }), "Sent")}><SendIcon size={17} /></button>
                )}</Show>
                <button type="button" class={annotationButtonClass} aria-label="Delete annotation" title="Delete" onClick={() => {
                  props.runtime.removeAnnotation(annotation().id);
                  setActiveAnnotationId(null);
                  setStatus(null);
                }}><TrashIcon size={17} /></button>
                <button type="button" class={annotationButtonClass} aria-label="Close annotation" title="Close" onClick={() => {
                  setActiveAnnotationId(null);
                  setStatus(null);
                }}><CloseIcon size={17} /></button>
              </div>
            </div>
            <div class="msr:mt-1.5 msr:max-h-36 msr:overflow-auto msr:whitespace-pre-wrap msr:text-[12px] msr:leading-[1.45]">{annotation().note}</div>
            <Show when={status()}>{(message) => <div class="msr:mt-2 msr:text-[11px] msr:text-ink-500" role="status">{message()}</div>}</Show>
          </div>
        );
      }}</Show>
    </>
  );
}
