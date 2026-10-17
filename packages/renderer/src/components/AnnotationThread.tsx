import { For, Show, createEffect, createSignal } from "solid-js";
import type { MesurerAnnotation, MesurerAnnotationReply, MesurerWorkspaceRuntime } from "../runtime/workspace-context";
import { AnnotationComposer } from "./AnnotationComposer";

type ThreadReplyRow = {
  id: string;
  readonly text: string;
  readonly createdAt: number;
};

export function AnnotationThread(props: {
  annotation: MesurerAnnotation;
  runtime: MesurerWorkspaceRuntime;
  panelElement(): HTMLDivElement | null;
  onGlobalHandlers(handlers: {
    pointerdown(event: PointerEvent): void;
    click(event: MouseEvent): void;
    keydown(event: KeyboardEvent): void;
  }): void;
  onClose(): void;
}) {
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editText, setEditText] = createSignal("");
  const [menuId, setMenuId] = createSignal<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = createSignal<string | null>(null);
  const [replyDraft, setReplyDraft] = createSignal("");
  const [outsideWarning, setOutsideWarning] = createSignal(false);
  const [replyRows, setReplyRows] = createSignal<ThreadReplyRow[]>([]);
  const replyRowById = new Map<string, ThreadReplyRow & { update(reply: MesurerAnnotationReply): void }>();
  const actionButtons = new Map<string, HTMLButtonElement>();
  let vetoOutsideClick = false;
  const pointerActions = new WeakSet<HTMLButtonElement>();

  createEffect(
    () => ({ id: props.annotation.id, replies: props.annotation.replies }),
    (currentAnnotation, previousAnnotation) => {
      if (previousAnnotation && currentAnnotation.id !== previousAnnotation.id) {
        setEditingId(null);
        setEditText("");
        setMenuId(null);
        setConfirmDeleteId(null);
        setReplyDraft("");
        setOutsideWarning(false);
      }

      const currentIds = new Set<string>();

      const nextRows = (currentAnnotation.replies ?? []).map((reply) => {
        currentIds.add(reply.id);
        let row = replyRowById.get(reply.id);

        if (row) {
          row.update(reply);
        } else {
          const [currentReply, setCurrentReply] = createSignal({ ...reply });
          row = {
            id: reply.id,
            get text() { return currentReply().text; },
            get createdAt() { return currentReply().createdAt; },
            update: setCurrentReply,
          };
          replyRowById.set(reply.id, row);
        }

        return row;
      });

      for (const replyId of replyRowById.keys()) {
        if (!currentIds.has(replyId)) replyRowById.delete(replyId);
      }

      setReplyRows(nextRows);
    },
  );

  const focusReplyAction = (replyId: string) => {
    queueMicrotask(() => actionButtons.get(replyId)?.focus());
  };

  const focusAfterReplyRemoval = () => {
    queueMicrotask(() => {
      const nextAction = [...actionButtons.values()].find((button) => button.isConnected);

      if (nextAction) nextAction.focus();
      else props.panelElement()?.querySelector<HTMLTextAreaElement>("[aria-label='Reply to note']")?.focus();
    });
  };

  const onOutsidePointer = (event: PointerEvent) => {
    const panel = props.panelElement();
    const isInsidePanel = panel && event.composedPath().includes(panel);

    if (isInsidePanel) {
      setOutsideWarning(false);

      return;
    }

    if (!replyDraft().trim() && !(editingId() && editText().trim())) {
      props.onClose();

      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    vetoOutsideClick = true;

    if (outsideWarning()) props.onClose();
    else setOutsideWarning(true);
  };

  const onOutsideClick = (event: MouseEvent) => {
    if (!vetoOutsideClick) return;
    vetoOutsideClick = false;
    const panel = props.panelElement();

    if (panel && event.composedPath().includes(panel)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onCardKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    const panel = props.panelElement();

    event.preventDefault();
    event.stopImmediatePropagation();

    const editId = editingId();

    if (editId) {
      setEditingId(null);
      setEditText("");
      focusReplyAction(editId);

      return;
    }

    if (confirmDeleteId()) {
      const replyId = confirmDeleteId()!;
      setConfirmDeleteId(null);
      focusReplyAction(replyId);

      return;
    }

    if (menuId()) {
      const replyId = menuId()!;
      setMenuId(null);
      focusReplyAction(replyId);

      return;
    }

    const replyComposer = panel?.querySelector<HTMLTextAreaElement>("[aria-label='Reply to note']");

    if (replyComposer) {
      replyComposer.value = "";
      replyComposer.style.height = "34px";
      replyComposer.scrollTop = 0;
      replyComposer.style.overflowY = "hidden";
    }

    setReplyDraft("");
    props.onClose();
  };

  props.onGlobalHandlers({
    pointerdown: onOutsidePointer,
    click: onOutsideClick,
    keydown: onCardKeyDown,
  });

  const onPointerAction = (
    event: PointerEvent & { currentTarget: HTMLButtonElement },
    action: () => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    pointerActions.add(event.currentTarget);
    action();
  };

  const onClickAction = (
    event: MouseEvent & { currentTarget: HTMLButtonElement },
    action: () => void,
  ) => {
    event.stopPropagation();

    if (pointerActions.delete(event.currentTarget)) return;
    action();
  };

  return (
    <div class="msr:flex msr:min-h-0 msr:flex-1 msr:flex-col">
      <div class="msr:min-h-0 msr:flex-1 msr:overflow-y-auto msr:px-1 msr:pb-1" data-mesurer-annotation-thread-history="true">
        <div class="msr:whitespace-pre-wrap msr:break-words msr:px-2 msr:py-2 msr:text-[12px] msr:leading-[1.45]">{props.annotation.note}</div>
        <For each={replyRows()} keyed>{(reply) => (
          <div class="msr:mt-3 msr:rounded-[5px] msr:px-2 msr:py-1.5" data-mesurer-annotation-reply={reply.id}>
            <div class="msr:flex msr:items-center msr:gap-1 msr:text-[11px] msr:text-ink-500">
              <span class="msr:flex-1">You · {new Date(reply.createdAt).toLocaleString()}</span>
              <button
                type="button"
                aria-label={`More actions for reply ${reply.id}`}
                ref={(element) => actionButtons.set(reply.id, element)}
                onPointerDown={(event) => onPointerAction(event, () => setMenuId(menuId() === reply.id ? null : reply.id))}
                onClick={(event) => onClickAction(event, () => setMenuId(menuId() === reply.id ? null : reply.id))}
              >•••</button>
            </div>
            <Show when={editingId() === reply.id} fallback={
              <div class="msr:whitespace-pre-wrap msr:break-words msr:py-1 msr:text-[12px] msr:leading-[1.45]">{reply.text}</div>
            }>
              <textarea
                aria-label="Edit reply"
                value={editText()}
                class="msr:mt-1 msr:box-border msr:min-h-[34px] msr:max-h-32 msr:w-full msr:resize-y msr:rounded-[5px] msr:border msr:border-ink-200 msr:bg-[var(--msr-surface)] msr:px-2 msr:py-1.5 msr:text-[12px] msr:text-[var(--msr-content)]"
                onInput={(event) => setEditText(event.currentTarget.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();

                  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                    event.preventDefault();

                    if (editText().trim()) props.runtime.updateAnnotationReply(props.annotation.id, reply.id, editText());
                    setEditingId(null);
                    focusReplyAction(reply.id);
                  }

                }}
              />
            </Show>
            <Show when={menuId() === reply.id}>
              <div class="msr:flex msr:gap-2 msr:text-[11px]">
                <button type="button" onPointerDown={(event) => onPointerAction(event, () => { setEditText(reply.text); setEditingId(reply.id); setMenuId(null); queueMicrotask(() => props.panelElement()?.querySelector<HTMLTextAreaElement>("[aria-label='Edit reply']")?.focus()); })} onClick={(event) => onClickAction(event, () => { setEditText(reply.text); setEditingId(reply.id); setMenuId(null); queueMicrotask(() => props.panelElement()?.querySelector<HTMLTextAreaElement>("[aria-label='Edit reply']")?.focus()); })}>Edit</button>
                <button type="button" onPointerDown={(event) => onPointerAction(event, () => { setConfirmDeleteId(reply.id); setMenuId(null); })} onClick={(event) => onClickAction(event, () => { setConfirmDeleteId(reply.id); setMenuId(null); })}>Delete</button>
              </div>
            </Show>
            <Show when={confirmDeleteId() === reply.id}>
              <div class="msr:flex msr:items-center msr:gap-2 msr:text-[11px]" role="group" aria-label="Confirm delete reply">
                <span>Delete this reply?</span>
                <button type="button" onPointerDown={(event) => onPointerAction(event, () => { setConfirmDeleteId(null); focusReplyAction(reply.id); })} onClick={(event) => onClickAction(event, () => { setConfirmDeleteId(null); focusReplyAction(reply.id); })}>Cancel</button>
                <button type="button" onPointerDown={(event) => onPointerAction(event, () => { props.runtime.removeAnnotationReply(props.annotation.id, reply.id); setConfirmDeleteId(null); focusAfterReplyRemoval(); })} onClick={(event) => onClickAction(event, () => { props.runtime.removeAnnotationReply(props.annotation.id, reply.id); setConfirmDeleteId(null); focusAfterReplyRemoval(); })}>Confirm</button>
              </div>
            </Show>
          </div>
        )}</For>
      </div>
      <div class="msr:border-t msr:border-ink-100 msr:px-1 msr:pt-2">
        <Show when={props.annotation.id} keyed>{(annotationId) => (
          <AnnotationComposer
            label="Reply to note"
            placeholder="Reply to note"
            onSubmit={(text) => {
              if (props.annotation.id !== annotationId) return;
              props.runtime.addAnnotationReply(annotationId, text);
            }}
            onDraftChange={setReplyDraft}
            onEscape={props.onClose}
          />
        )}</Show>
        <Show when={outsideWarning()}>
          <div class="msr:px-1 msr:pt-1 msr:text-[10px] msr:text-ink-500" role="status">
            Press Enter or Send to save, or click outside again to discard.
          </div>
        </Show>
      </div>
    </div>
  );
}
