import { onCleanup } from "solid-js";

export function AnnotationDeleteConfirmation(props: {
  message: string;
  owner: HTMLElement;
  focusTarget: HTMLButtonElement | undefined;
  ariaLabel: string;
  onCancel(): void;
  onConfirm(): void;
}) {
  let dialog: HTMLDivElement | undefined;
  let firstButton: HTMLButtonElement | undefined;
  const pointerActions = new WeakSet<HTMLButtonElement>();
  const doc = props.owner.ownerDocument;

  const cancelOutside = (event: PointerEvent) => {
    if (dialog && event.composedPath().includes(dialog)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    props.onCancel();
    queueMicrotask(() => props.focusTarget?.focus());
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    props.onCancel();
    queueMicrotask(() => props.focusTarget?.focus());
  };

  const onPointerAction = (event: PointerEvent & { currentTarget: HTMLButtonElement }, action: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    pointerActions.add(event.currentTarget);
    action();
  };

  const onClickAction = (event: MouseEvent & { currentTarget: HTMLButtonElement }, action: () => void) => {
    event.stopPropagation();

    if (pointerActions.delete(event.currentTarget)) return;

    action();
  };

  doc.defaultView?.addEventListener("pointerdown", cancelOutside, true);
  doc.defaultView?.addEventListener("keydown", onKeyDown, true);
  queueMicrotask(() => firstButton?.focus());
  onCleanup(() => {
    doc.defaultView?.removeEventListener("pointerdown", cancelOutside, true);
    doc.defaultView?.removeEventListener("keydown", onKeyDown, true);
  });

  return (
    <div
      ref={(element) => { dialog = element; }}
      role="dialog"
      aria-label={props.ariaLabel}
      class="mesurer-context-floating-surface msr:absolute msr:right-0 msr:top-full msr:z-[110] msr:mt-1 msr:w-48 msr:rounded-lg msr:p-3 msr:text-[12px] msr:text-[var(--msr-content)]"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p>{props.message}</p>
      <div class="msr:mt-3 msr:flex msr:justify-end msr:gap-2">
        <button ref={(element) => { firstButton = element; }} type="button" class="msr:rounded-control msr:px-2 msr:py-1 msr:text-[11px] msr:text-ink-700 msr:hover:bg-ink-200" onPointerDown={(event) => onPointerAction(event, () => { props.onCancel(); queueMicrotask(() => props.focusTarget?.focus()); })} onClick={(event) => onClickAction(event, () => { props.onCancel(); queueMicrotask(() => props.focusTarget?.focus()); })}>No</button>
        <button type="button" class="msr:rounded-control msr:bg-[var(--msr-danger-bg)] msr:px-2 msr:py-1 msr:text-[11px] msr:text-[var(--msr-danger-text)] msr:hover:brightness-95" onPointerDown={(event) => onPointerAction(event, props.onConfirm)} onClick={(event) => onClickAction(event, props.onConfirm)}>Yes</button>
      </div>
    </div>
  );
}
