import { For, Show, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import type { MesurerAnnotation } from "@jhomra21/mesurer-solid-core";
import type { MesurerWorkspaceRuntime } from "../runtime/workspace-context";
import type { AnnotationRevealResult } from "../runtime/annotation-reveal";
import { CloseIcon, NoteIcon } from "./Icons";

export type ContextNotesPanelProps = {
  runtime: MesurerWorkspaceRuntime;
  ownerWindow: Window;
  rendererRoot?: HTMLElement;
  open: boolean;
  onOpenChange(open: boolean): void;
  onReveal(annotation: MesurerAnnotation): Promise<AnnotationRevealResult>;
  onCancel(): void;
  onOpenAnnotation(id: string): void;
};

const buttonStyle = {
  border: "0",
  borderRadius: "5px",
  background: "transparent",
  color: "var(--msr-content)",
  cursor: "pointer",
  font: "inherit",
};

export function ContextNotesPanel(props: ContextNotesPanelProps) {
  const [revision, setRevision] = createSignal(0);
  const [query, setQuery] = createSignal("");
  const [filter, setFilter] = createSignal<"open" | "resolved" | "all">("open");
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [statusById, setStatusById] = createSignal<Record<string, string>>({});
  let pendingPointer: { id: string; x: number; y: number } | null = null;
  let handledPointerId: string | null = null;

  const unsubscribe = props.runtime.subscribe(() => {
    setRevision((value) => value + 1);
    const requestedId = untrack(busyId);

    if (requestedId && !props.runtime.annotations().some((annotation) => annotation.id === requestedId)) {
      props.onCancel();
      setBusyId(null);
    }
  });

  onCleanup(unsubscribe);

  const annotations = createMemo(() => {
    revision();

    return props.runtime.annotations()
      .map((annotation, index) => ({ annotation, index }))
      .filter(({ annotation }) => filter() === "all"
        || (annotation.status ?? "open") === filter())
      .filter(({ annotation }) => {
        const needle = query().trim().toLocaleLowerCase();

        return !needle || [annotation.note, ...(annotation.replies ?? []).map(({ text }) => text)]
          .some((text) => text.toLocaleLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const timestamp = (item: MesurerAnnotation) => item.replies?.at(-1)?.createdAt ?? item.createdAt;

        return timestamp(b.annotation) - timestamp(a.annotation) || a.index - b.index;
      })
      .map(({ annotation }) => annotation);
  });

  const placement = () => {
    const trigger = props.rendererRoot?.querySelector<HTMLElement>('[data-mesurer-tool-id="context.notes"]');
    const rect = trigger?.getBoundingClientRect();
    const win = props.ownerWindow;
    const width = 288;
    const left = rect ? Math.max(8, Math.min(win.innerWidth - width - 8, rect.left)) : Math.max(8, win.innerWidth - width - 16);
    const top = rect ? Math.max(8, Math.min(win.innerHeight - 280, rect.bottom + 8)) : 72;

    return { left: `${left}px`, top: `${top}px` };
  };

  const reveal = async (annotation: MesurerAnnotation) => {
    setBusyId(annotation.id);
    setStatusById((current) => ({ ...current, [annotation.id]: "Opening…" }));
    let result: AnnotationRevealResult;

    try {
      result = await props.onReveal(annotation);
    } catch (error) {
      result = {
        status: "refused",
        message: error instanceof Error ? error.message : "This note could not be revealed.",
      };
    }

    if (result.status === "revealed") {
      setStatusById((current) => {
        const next = { ...current };
        delete next[annotation.id];

        return next;
      });
      props.onOpenAnnotation(annotation.id);
    } else if (result.status !== "cancelled") {
      setStatusById((current) => ({ ...current, [annotation.id]: result.message }));
    } else {
      setStatusById((current) => {
        const next = { ...current };
        delete next[annotation.id];

        return next;
      });
    }

    if (busyId() === annotation.id) setBusyId(null);
  };

  const onPointerUp = (event: PointerEvent) => {
    const pending = pendingPointer;

    if (!pending) return;
    pendingPointer = null;
    const moved = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
    const stillSaved = props.runtime.annotations().find((annotation) => annotation.id === pending.id);

    if (moved > 8 || !stillSaved) return;
    handledPointerId = pending.id;
    void reveal(stillSaved);
  };

  const dismiss = () => {
    props.onCancel();
    props.onOpenChange(false);
    props.rendererRoot?.querySelector<HTMLButtonElement>('button[data-mesurer-tool-id="context.notes"]')?.focus();
  };

  props.ownerWindow.addEventListener("pointerup", onPointerUp, true);
  onCleanup(() => props.ownerWindow.removeEventListener("pointerup", onPointerUp, true));

  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !props.open) return;

    if (props.rendererRoot?.querySelector("[data-mesurer-annotation-panel='true']")) return;
    const target = event.target;

    if (target instanceof HTMLInputElement && target.type === "search" && target.value) {
      target.value = "";
      target.dispatchEvent(new Event("input", { bubbles: true }));
      event.preventDefault();
      event.stopImmediatePropagation();

      return;
    }

    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();
    dismiss();
  };

  props.ownerWindow.addEventListener("keydown", keydown, true);
  onCleanup(() => props.ownerWindow.removeEventListener("keydown", keydown, true));

  return (
    <Show when={props.open}>
      <section
        role="dialog"
        aria-label="Notes"
        data-mesurer-inspector-ui="true"
        data-mesurer-notes-panel="true"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "fixed",
          ...placement(),
          width: "288px",
          "max-height": "min(70vh, 560px)",
          display: "flex",
          "flex-direction": "column",
          overflow: "hidden",
          "box-sizing": "border-box",
          "z-index": "2147483647",
          background: "var(--msr-surface)",
          color: "var(--msr-content)",
          border: "1px solid var(--msr-color-ink-100)",
          "border-radius": "9px",
          "box-shadow": "var(--msr-shadow-floating)",
          "font-family": "ui-sans-serif, system-ui, sans-serif",
          "font-size": "12px",
          "pointer-events": "auto",
        }}
      >
        <header style={{ display: "flex", "align-items": "center", gap: "8px", padding: "10px 12px", "border-bottom": "1px solid var(--msr-color-ink-100)" }}>
          <NoteIcon size={14} />
          <strong style={{ flex: "1", "font-size": "12px" }}>Notes</strong>
          <select aria-label="Filter notes" value={filter()} onChange={(event) => {
            const nextFilter = event.currentTarget.value;

            if (nextFilter === "open" || nextFilter === "resolved" || nextFilter === "all") setFilter(nextFilter);
            setRevision((value) => value + 1);
          }} style={{ border: "0", background: "transparent", color: "inherit", "font-size": "11px" }}>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <button type="button" aria-label="Close Notes" onClick={dismiss} style={{ ...buttonStyle, width: "24px", height: "24px" }}><CloseIcon size={12} /></button>
        </header>
        <div style={{ padding: "8px 10px" }}>
          <input
            type="search"
            aria-label="Search notes"
            placeholder="Search notes"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            style={{ width: "100%", "box-sizing": "border-box", height: "30px", padding: "0 8px", border: "1px solid var(--msr-color-ink-200)", "border-radius": "5px", background: "var(--msr-surface-raised)", color: "inherit", "font-size": "11px" }}
          />
        </div>
        <Show when={annotations().length} fallback={<p style={{ padding: "18px 12px", margin: "0", "text-align": "center", color: "var(--msr-color-ink-500)" }}>{query().trim() ? "No matching notes." : filter() === "resolved" ? "No resolved notes." : filter() === "open" ? "No open notes." : "No notes yet."}</p>}>
          <ul aria-label="Saved notes" style={{ margin: "0", padding: "0", "min-height": "0", overflow: "auto", "list-style": "none" }}>
            <For each={annotations()}>{(annotation, index) => {
              const viewport = annotation.anchor.kind === "elements"
                ? annotation.anchor.targets.find((target) => target.viewport)?.viewport
                : undefined;

              const isResolved = (annotation.status ?? "open") === "resolved";
              const resolvedTarget = props.runtime.annotation(annotation.id)?.resolvedTargets.some(({ element }) => element?.isConnected) ?? false;
              const previewIsOpen = Boolean(props.rendererRoot?.querySelector("[data-mesurer-responsive-stage]"));

              const targetState = viewport
                ? previewIsOpen ? resolvedTarget ? "" : "Target not found" : "Preview not open"
                : resolvedTarget || annotation.anchor.kind === "region" ? "" : "Target not found";

              return (
                <li style={{ padding: "8px 12px", "border-top": "1px solid var(--msr-color-ink-100)", opacity: isResolved ? "0.62" : "1" }}>
                  <button
                    type="button"
                    data-mesurer-note-id={annotation.id}
                    aria-label={`Note ${index() + 1}: ${annotation.note}`}
                    disabled={busyId() === annotation.id}
                    onPointerDown={(event) => {
                      pendingPointer = { id: annotation.id, x: event.clientX, y: event.clientY };
                      handledPointerId = null;
                    }}
                    onClick={() => {
                      if (handledPointerId === annotation.id) {
                        handledPointerId = null;

                        return;
                      }

                      void reveal(annotation);
                    }}
                    style={{ ...buttonStyle, display: "flex", width: "100%", "flex-direction": "column", "align-items": "flex-start", gap: "4px", padding: "0", "text-align": "left" }}
                  >
                    <span style={{ width: "100%", overflow: "hidden", display: "-webkit-box", "-webkit-line-clamp": "2", "-webkit-box-orient": "vertical", "overflow-wrap": "anywhere", "line-height": "16px" }}>{annotation.note}</span>
                    <span style={{ color: "var(--msr-color-ink-500)", "font-size": "10px" }}>
                      {(annotation.replies?.length ?? 0)} {(annotation.replies?.length ?? 0) === 1 ? "reply" : "replies"}
                      {viewport ? ` · ${viewport.width} × ${viewport.height} preview` : ""}
                      {isResolved ? " · Resolved" : ""}
                      {targetState ? ` · ${targetState}` : ""}
                    </span>
                  </button>
                  <Show when={statusById()[annotation.id]}>
                    <span role="status" style={{ display: "block", "margin-top": "4px", color: "var(--msr-color-ink-500)", "font-size": "10px" }}>{statusById()[annotation.id]}</span>
                  </Show>
                </li>
              );
            }}</For>
          </ul>
        </Show>
      </section>
    </Show>
  );
}
