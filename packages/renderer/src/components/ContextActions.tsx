import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import type { MesurerContextRequest, MesurerWorkspaceRuntime } from "../runtime/workspace-context";

export type ContextActionsProps = {
  runtime: MesurerWorkspaceRuntime;
  onCopy: (request?: MesurerContextRequest) => Promise<void>;
  onSend?: (request?: MesurerContextRequest) => Promise<void>;
  sendLabel?: string;
};

const surface = {
  background: "rgba(255,255,255,.97)",
  border: "1px solid rgba(0,0,0,.10)",
  borderRadius: "12px",
  boxShadow: "0 8px 24px rgba(0,0,0,.12)",
  color: "#111",
  fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
} as const;

const button = {
  appearance: "none",
  border: "0",
  borderRadius: "8px",
  background: "rgba(0,0,0,.055)",
  color: "#111",
  cursor: "pointer",
  font: "600 12px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  padding: "9px 11px",
} as const;

export function ContextActions(props: ContextActionsProps) {
  const [revision, setRevision] = createSignal(0);
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [note, setNote] = createSignal("");
  const [activeAnnotationId, setActiveAnnotationId] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const unsubscribe = props.runtime.subscribe(() => setRevision((value) => value + 1));
  onCleanup(unsubscribe);

  const snapshot = createMemo(() => {
    revision();
    return props.runtime.snapshot();
  });
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

  const addAnnotation = () => {
    try {
      const annotation = props.runtime.addSelectionAnnotation(note());
      setNote("");
      setComposerOpen(false);
      setActiveAnnotationId(annotation.id);
      setStatus("Note added");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <For each={annotations()}>{(annotation, index) => {
        const rect = () => props.runtime.annotationRect(annotation.id);
        return (
          <Show when={rect()}>{(value) => (
            <button
              type="button"
              data-mesurer-layer="evidence"
              aria-label={`Mesurer annotation ${index() + 1}: ${annotation.note}`}
              title={annotation.note}
              onClick={() => setActiveAnnotationId(annotation.id)}
              style={{
                position: "fixed",
                left: `${Math.max(4, value().left + value().width - 10)}px`,
                top: `${Math.max(4, value().top - 10)}px`,
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

      <Show when={snapshot()?.enabled}>
        <div
          data-mesurer-layer="chrome"
          data-mesurer-inspector-ui="true"
          style={{
            ...surface,
            position: "fixed",
            left: "50%",
            bottom: "18px",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "6px",
            padding: "5px",
            "z-index": 2147483400,
            "pointer-events": "auto",
          }}
        >
          <button type="button" style={button} disabled={busy()} onClick={() => run(() => props.onCopy(), "Context copied")}>Copy context</button>
          <Show when={selection().elements.length > 0}>
            <button type="button" style={button} disabled={busy()} onClick={() => run(() => props.onCopy({ scope: "selection" }), "Selection copied")}>Copy selection</button>
            <button type="button" style={button} onClick={() => { setComposerOpen(true); setStatus(null); }}>Add note</button>
            <Show when={props.onSend}>{(send) => (
              <button type="button" style={{ ...button, background: "#0d99ff", color: "white" }} disabled={busy()} onClick={() => run(() => send()({ scope: "selection" }), "Sent")}>{props.sendLabel ?? "Send to agent"}</button>
            )}</Show>
          </Show>
        </div>
      </Show>

      <Show when={composerOpen()}>
        <div
          data-mesurer-layer="chrome"
          data-mesurer-inspector-ui="true"
          style={{ ...surface, position: "fixed", left: "50%", bottom: "68px", width: "320px", transform: "translateX(-50%)", padding: "10px", "z-index": 2147483500 }}
        >
          <textarea
            autofocus
            value={note()}
            placeholder="Describe what should change…"
            onInput={(event) => setNote(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") addAnnotation();
              if (event.key === "Escape") setComposerOpen(false);
            }}
            style={{ width: "100%", height: "82px", resize: "vertical", border: "1px solid rgba(0,0,0,.14)", "border-radius": "8px", padding: "9px", color: "#111", background: "white", "font-family": "ui-sans-serif, system-ui, sans-serif", "font-size": "13px", outline: "none", "box-sizing": "border-box" }}
          />
          <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", gap: "8px", "margin-top": "8px" }}>
            <span style={{ "font-family": "ui-sans-serif, system-ui, sans-serif", "font-size": "11px", color: "#666" }}>⌘/Ctrl + Enter to add</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" style={button} onClick={() => setComposerOpen(false)}>Cancel</button>
              <button type="button" style={{ ...button, background: "#0d99ff", color: "white" }} onClick={addAnnotation}>Add note</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={activeAnnotation()}>{(annotation) => (
        <div
          data-mesurer-layer="chrome"
          data-mesurer-inspector-ui="true"
          style={{ ...surface, position: "fixed", right: "16px", bottom: "16px", width: "300px", padding: "12px", "z-index": 2147483500 }}
        >
          <div style={{ "font-size": "11px", "font-weight": 700, color: "#666", "margin-bottom": "6px" }}>Mesurer note</div>
          <div style={{ "font-size": "13px", "line-height": 1.45, "white-space": "pre-wrap" }}>{annotation().note}</div>
          <div style={{ display: "flex", gap: "6px", "margin-top": "10px", "flex-wrap": "wrap" }}>
            <button type="button" style={button} disabled={busy()} onClick={() => run(() => props.onCopy({ annotation: annotation().id }), "Note context copied")}>Copy context</button>
            <Show when={props.onSend}>{(send) => (
              <button type="button" style={{ ...button, background: "#0d99ff", color: "white" }} disabled={busy()} onClick={() => run(() => send()({ annotation: annotation().id }), "Sent")}>{props.sendLabel ?? "Send to agent"}</button>
            )}</Show>
            <button type="button" style={button} onClick={() => { props.runtime.removeAnnotation(annotation().id); setActiveAnnotationId(null); }}>Delete</button>
            <button type="button" style={button} onClick={() => setActiveAnnotationId(null)}>Close</button>
          </div>
        </div>
      )}</Show>

      <Show when={status()}>{(message) => (
        <div data-mesurer-layer="chrome" data-mesurer-inspector-ui="true" style={{ ...surface, position: "fixed", left: "50%", bottom: "58px", transform: "translateX(-50%)", padding: "7px 10px", "font-size": "11px", "z-index": 2147483600 }}>{message()}</div>
      )}</Show>
    </>
  );
}
