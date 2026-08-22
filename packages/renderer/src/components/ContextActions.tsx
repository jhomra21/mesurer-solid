import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import type { MesurerContextRequest, MesurerWorkspaceRuntime } from "../runtime/workspace-context";
import { CloseIcon, CopyIcon, SendIcon, TrashIcon } from "./Icons";

export type ContextActionsProps = {
  runtime: MesurerWorkspaceRuntime;
  ownerWindow: Window;
  onCopy: (request?: MesurerContextRequest) => Promise<void>;
  onSend?: (request?: MesurerContextRequest) => Promise<void>;
  sendLabel?: string;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const iconButtonClass = "msr:flex msr:size-7 msr:items-center msr:justify-center msr:rounded-[7px] msr:border-0 msr:bg-transparent msr:text-black msr:outline-none msr:hover:bg-black/4 msr:disabled:cursor-default msr:disabled:opacity-40";

export function ContextActions(props: ContextActionsProps) {
  const [revision, setRevision] = createSignal(0);
  const [activeAnnotationId, setActiveAnnotationId] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  const unsubscribe = props.runtime.subscribe(() => setRevision((value) => value + 1));
  onCleanup(unsubscribe);

  const annotations = createMemo(() => {
    revision();
    return props.runtime.annotations();
  });
  const activeAnnotation = createMemo(() => {
    const id = activeAnnotationId();
    return id ? annotations().find((annotation) => annotation.id === id) ?? null : null;
  });

  const markerPosition = (annotationId: string) => {
    const value = props.runtime.annotationRect(annotationId);
    if (!value) return null;
    return {
      left: clamp(value.left + value.width - 10, 4, props.ownerWindow.innerWidth - 26),
      top: clamp(value.top - 10, 4, props.ownerWindow.innerHeight - 26),
    };
  };

  const panelPosition = (annotationId: string) => {
    const value = props.runtime.annotationRect(annotationId);
    if (!value) return { left: 8, top: 8 };
    const width = 280;
    const estimatedHeight = 150;
    const padding = 8;
    const gap = 8;
    const left = clamp(value.left + value.width - width, padding, props.ownerWindow.innerWidth - width - padding);
    const below = value.top + 18;
    const top = below + estimatedHeight <= props.ownerWindow.innerHeight - padding
      ? below
      : clamp(value.top - estimatedHeight - gap, padding, props.ownerWindow.innerHeight - estimatedHeight - padding);
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

  return (
    <>
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
            class="mesurer-menu-surface msr:fixed msr:z-[95] msr:w-[280px] msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-2 msr:text-black"
            style={{ left: `${position().left}px`, top: `${position().top}px` }}
          >
            <div class="msr:flex msr:items-center msr:justify-between msr:gap-2">
              <div class="msr:min-w-0 msr:flex-1 msr:text-[11px] msr:font-medium msr:text-ink-500">Note {annotations().findIndex((item) => item.id === annotation().id) + 1}</div>
              <div class="msr:flex msr:items-center msr:gap-0.5">
                <button
                  type="button"
                  class={iconButtonClass}
                  aria-label="Copy annotation context"
                  title="Copy context"
                  disabled={busy()}
                  onClick={() => run(() => props.onCopy({ annotation: annotation().id }), "Copied")}
                ><CopyIcon size={17} /></button>
                <Show when={props.onSend}>{(send) => (
                  <button
                    type="button"
                    class={iconButtonClass}
                    aria-label={props.sendLabel ?? "Send to agent"}
                    title={props.sendLabel ?? "Send to agent"}
                    disabled={busy()}
                    onClick={() => run(() => send()({ annotation: annotation().id }), "Sent")}
                  ><SendIcon size={17} /></button>
                )}</Show>
                <button
                  type="button"
                  class={iconButtonClass}
                  aria-label="Delete annotation"
                  title="Delete"
                  onClick={() => {
                    props.runtime.removeAnnotation(annotation().id);
                    setActiveAnnotationId(null);
                    setStatus(null);
                  }}
                ><TrashIcon size={17} /></button>
                <button
                  type="button"
                  class={iconButtonClass}
                  aria-label="Close annotation"
                  title="Close"
                  onClick={() => {
                    setActiveAnnotationId(null);
                    setStatus(null);
                  }}
                ><CloseIcon size={17} /></button>
              </div>
            </div>
            <div class="msr:mt-1.5 msr:max-h-40 msr:overflow-auto msr:whitespace-pre-wrap msr:text-[12px] msr:leading-[1.45]">{annotation().note}</div>
            <Show when={status()}>{(message) => (
              <div class="msr:mt-2 msr:text-[11px] msr:text-ink-500" role="status">{message()}</div>
            )}</Show>
          </div>
        );
      }}</Show>
    </>
  );
}
