import { Portal } from "@solidjs/web";
import { For, Show, createMemo, createSignal, onCleanup, onSettled } from "solid-js";
import type { MesurerContextRequest, MesurerWorkspaceRuntime } from "../runtime/workspace-context";
import { CloseIcon, CopyIcon, CopySelectionIcon, NoteIcon, SendIcon, TrashIcon } from "./Icons";
import { Tooltip, createTooltip } from "./Tooltip";

export type ContextActionsProps = {
  runtime: MesurerWorkspaceRuntime;
  onCopy: (request?: MesurerContextRequest) => Promise<void>;
  onSend?: (request?: MesurerContextRequest) => Promise<void>;
  sendLabel?: string;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const annotationButtonClass = "msr:flex msr:size-7 msr:items-center msr:justify-center msr:rounded-[7px] msr:border-0 msr:bg-transparent msr:text-black msr:outline-none msr:hover:bg-black/4 msr:disabled:cursor-default msr:disabled:opacity-40";

type ContextToolbarButtonProps = {
  id: string;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  tooltipVisible: boolean;
  tooltipInstant: boolean;
  tooltipSide: "top" | "bottom";
  onTooltipEnter: (id: string) => void;
  onTooltipLeave: () => void;
  onClick: () => void;
  children: any;
};

function ContextToolbarButton(props: ContextToolbarButtonProps) {
  const inactiveClass = () => props.disabled
    ? "msr:cursor-default msr:bg-transparent msr:text-black/30"
    : "msr:bg-transparent msr:text-black msr:hover:bg-black/4";
  return (
    <div class="msr:relative" onMouseEnter={() => props.onTooltipEnter(props.id)} onMouseLeave={props.onTooltipLeave}>
      <button
        type="button"
        aria-pressed={props.active ? "true" : "false"}
        aria-label={`${props.label}${props.shortcut ? ` (${props.shortcut})` : ""}`}
        disabled={props.disabled}
        class={`msr:flex msr:size-8 msr:select-none msr:items-center msr:justify-center msr:rounded-[8px] msr:border-0 msr:outline-none ${props.active ? "msr:bg-[#0d99ff] msr:text-white" : inactiveClass()}`}
        onClick={props.onClick}
      >
        {props.children}
      </button>
      <Tooltip label={props.label} shortcut={props.shortcut} visible={props.tooltipVisible} instant={props.tooltipInstant} side={props.tooltipSide} />
    </div>
  );
}

export function ContextActions(props: ContextActionsProps) {
  const [revision, setRevision] = createSignal(0);
  const [toolbarMount, setToolbarMount] = createSignal<HTMLDivElement | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = createSignal<string | null>(null);
  const [noteComposerOpen, setNoteComposerOpen] = createSignal(false);
  const [note, setNote] = createSignal("");
  const [noteError, setNoteError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [flash, setFlash] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<string | null>(null);
  let anchorElement: HTMLSpanElement | undefined;
  let toolbarHost: HTMLDivElement | null = null;
  let mountFrame = 0;
  let flashTimer = 0;

  const ownerWindow = () =>
    toolbarMount()?.ownerDocument.defaultView ?? anchorElement?.ownerDocument.defaultView ?? window;
  const tooltip = createTooltip(ownerWindow());
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
  const tooltipSide = (): "top" | "bottom" => {
    const toolbar = toolbarMount()?.parentElement;
    if (!toolbar) return "bottom";
    return toolbar.getBoundingClientRect().top < 56 ? "bottom" : "top";
  };
  const buttonProps = (id: string) => ({
    tooltipVisible: !noteComposerOpen() && tooltip.visibleTooltipId() === id,
    tooltipInstant: tooltip.tooltipInstant(),
    tooltipSide: tooltipSide(),
    onTooltipEnter: tooltip.onTooltipEnter,
    onTooltipLeave: tooltip.onTooltipLeave,
  });

  const markerPosition = (annotationId: string) => {
    const value = props.runtime.annotationRect(annotationId);
    if (!value) return null;
    const currentWindow = ownerWindow();
    return {
      left: clamp(value.left + value.width - 10, 4, currentWindow.innerWidth - 26),
      top: clamp(value.top - 10, 4, currentWindow.innerHeight - 26),
    };
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

  const flashAction = (id: string) => {
    const currentWindow = ownerWindow();
    currentWindow.clearTimeout(flashTimer);
    setFlash(id);
    flashTimer = currentWindow.setTimeout(() => setFlash(null), 800);
  };

  const run = async (id: string, action: () => Promise<void>, success: string) => {
    if (busy()) return;
    setBusy(true);
    setStatus(null);
    try {
      await action();
      flashAction(id);
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
      flashAction("add-note");
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : String(error));
    }
  };

  onSettled(() => {
    const currentWindow = ownerWindow();
    const findToolbar = () => {
      if (!anchorElement) return;
      const root = anchorElement.getRootNode();
      if (!(root instanceof Document || root instanceof ShadowRoot)) return;
      const toolbar = root.querySelector<HTMLElement>("[data-mesurer-toolbar='true']");
      if (!toolbar) {
        mountFrame = currentWindow.requestAnimationFrame(findToolbar);
        return;
      }
      const settingsButton = toolbar.querySelector<HTMLButtonElement>("button[aria-label^='Settings']");
      const settingsWrapper = settingsButton?.parentElement?.parentElement ?? null;
      toolbarHost = toolbar.ownerDocument.createElement("div");
      toolbarHost.dataset.mesurerContextToolbar = "true";
      toolbarHost.dataset.mesurerInspectorUi = "true";
      toolbarHost.style.display = "contents";
      toolbar.insertBefore(toolbarHost, settingsWrapper);
      setToolbarMount(toolbarHost);
    };
    findToolbar();

    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement && (
        target.isContentEditable ||
        target.matches("input, textarea, select")
      );
    const handleShortcut = (event: KeyboardEvent) => {
      if (isEditable(event.target) || event.altKey) return;
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (!mod && key === "c") {
        if (event.shiftKey && !hasSelection()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.shiftKey) void run("copy-selection", () => props.onCopy({ scope: "selection" }), "Selection copied");
        else void run("copy-context", () => props.onCopy(), "Context copied");
        return;
      }
      if (!mod && !event.shiftKey && key === "n" && hasSelection()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openNoteComposer();
        return;
      }
      const send = props.onSend;
      if (mod && !event.shiftKey && event.key === "Enter" && send && hasSelection()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void run("send-selection", () => send({ scope: "selection" }), "Sent");
      }
    };
    currentWindow.addEventListener("keydown", handleShortcut, true);

    return () => {
      currentWindow.cancelAnimationFrame(mountFrame);
      currentWindow.clearTimeout(flashTimer);
      currentWindow.removeEventListener("keydown", handleShortcut, true);
      toolbarHost?.remove();
      toolbarHost = null;
      setToolbarMount(null);
    };
  });

  return (
    <>
      <span ref={(element) => { anchorElement = element; }} aria-hidden="true" style={{ display: "none" }} />

      <Show when={toolbarMount()}>{(mount) => (
        <Portal mount={mount()}>
          <div class="msr:mx-0.5 msr:h-5 msr:w-px msr:bg-black/10" aria-hidden="true" />
          <ContextToolbarButton id="copy-context" label="Copy context" shortcut="C" active={flash() === "copy-context"} disabled={busy()} onClick={() => void run("copy-context", () => props.onCopy(), "Context copied")} {...buttonProps("copy-context")}><CopyIcon size={20} /></ContextToolbarButton>
          <ContextToolbarButton id="copy-selection" label="Copy selection" shortcut="⇧C" active={flash() === "copy-selection"} disabled={busy() || !hasSelection()} onClick={() => void run("copy-selection", () => props.onCopy({ scope: "selection" }), "Selection copied")} {...buttonProps("copy-selection")}><CopySelectionIcon size={20} /></ContextToolbarButton>
          <div class="msr:relative">
            <ContextToolbarButton id="add-note" label="Add note" shortcut="N" active={noteComposerOpen() || flash() === "add-note"} disabled={!hasSelection()} onClick={openNoteComposer} {...buttonProps("add-note")}><NoteIcon size={20} /></ContextToolbarButton>
            <Show when={noteComposerOpen()}>
              <div
                data-mesurer-layer="chrome"
                data-mesurer-inspector-ui="true"
                class={`mesurer-menu-surface msr:absolute msr:right-0 msr:z-[70] msr:w-[280px] msr:max-w-[calc(100vw-16px)] msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-2 ${tooltipSide() === "bottom" ? "msr:top-full msr:mt-2" : "msr:bottom-full msr:mb-2"}`}
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
          </div>
          <Show when={props.onSend}>{(send) => (
            <ContextToolbarButton id="send-selection" label={props.sendLabel ?? "Send to agent"} shortcut="⌘/Ctrl+Enter" active={flash() === "send-selection"} disabled={busy() || !hasSelection()} onClick={() => void run("send-selection", () => send()({ scope: "selection" }), "Sent")} {...buttonProps("send-selection")}><SendIcon size={20} /></ContextToolbarButton>
          )}</Show>
        </Portal>
      )}</Show>

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
            class="mesurer-menu-surface msr:fixed msr:z-[95] msr:w-[280px] msr:max-h-[220px] msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-2 msr:text-black"
            style={{ left: `${position().left}px`, top: `${position().top}px` }}
          >
            <div class="msr:flex msr:items-center msr:justify-between msr:gap-2">
              <div class="msr:min-w-0 msr:flex-1 msr:text-[11px] msr:font-medium msr:text-ink-500">Note {annotations().findIndex((item) => item.id === annotation().id) + 1}</div>
              <div class="msr:flex msr:items-center msr:gap-0.5">
                <button type="button" class={annotationButtonClass} aria-label="Copy annotation context" title="Copy context" disabled={busy()} onClick={() => void run("copy-annotation", () => props.onCopy({ annotation: annotation().id }), "Copied")}><CopyIcon size={17} /></button>
                <Show when={props.onSend}>{(send) => (
                  <button type="button" class={annotationButtonClass} aria-label={props.sendLabel ?? "Send to agent"} title={props.sendLabel ?? "Send to agent"} disabled={busy()} onClick={() => void run("send-annotation", () => send()({ annotation: annotation().id }), "Sent")}><SendIcon size={17} /></button>
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
