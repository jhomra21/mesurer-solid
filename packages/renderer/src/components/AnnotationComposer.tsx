import { createSignal } from "solid-js";
import { SendIcon } from "./Icons";

export type AnnotationComposerProps = {
  label: string;
  placeholder: string;
  onSubmit(text: string): void;
  onEscape?(): void;
  onDraftChange?(text: string): void;
};

export function AnnotationComposer(props: AnnotationComposerProps) {
  const [value, setValue] = createSignal("");
  const [expanded, setExpanded] = createSignal(false);
  let textarea: HTMLTextAreaElement | undefined;

  const submit = () => {
    const text = value().trim();

    if (!text) return;
    props.onSubmit(text);
    setValue("");
    setExpanded(false);
    props.onDraftChange?.("");

    if (textarea) {
      textarea.style.height = "34px";
      textarea.scrollTop = 0;
      textarea.style.overflowY = "hidden";
      textarea.focus();
    }
  };

  const discard = () => {
    setValue("");
    setExpanded(false);
    props.onDraftChange?.("");

    if (textarea) {
      textarea.style.height = "34px";
      textarea.scrollTop = 0;
      textarea.style.overflowY = "hidden";
    }

    props.onEscape?.();
  };

  return (
    <div class="msr:relative msr:mt-2">
      <textarea
        ref={(element) => { textarea = element; }}
        aria-label={props.label}
        placeholder={props.placeholder}
        rows={1}
        value={value()}
        class="msr:block msr:box-border msr:min-h-[34px] msr:max-h-32 msr:w-full msr:resize-none msr:rounded-[5px] msr:border msr:border-ink-200 msr:px-2 msr:py-1.5 msr:text-[12px] msr:leading-5 msr:outline-none msr:placeholder:text-ink-400 msr:focus:border-[#0d99ff]"
        style={{
          height: "34px",
          "padding-right": expanded() ? "8px" : "36px",
          "padding-bottom": expanded() ? "32px" : "6px",
          "overflow-y": "auto",
          "overflow-wrap": "anywhere",
          background: "var(--msr-surface)",
          color: "var(--msr-content)",
        }}
        onInput={(event) => {
          const textarea = event.currentTarget;
          setValue(textarea.value);
          props.onDraftChange?.(textarea.value);
          textarea.style.height = "auto";
          const isExpanded = textarea.scrollHeight > 34;
          setExpanded(isExpanded);
          textarea.style.height = `${Math.min(128, Math.max(34, textarea.scrollHeight))}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.stopPropagation();
            event.preventDefault();
            submit();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            discard();
          }
        }}
      />
      <button
        type="button"
        aria-label={props.label === "Reply to note" ? "Send reply" : props.label}
        title={`${props.label === "Reply to note" ? "Send reply" : props.label} · Enter`}
        disabled={!value().trim()}
        class={`msr:absolute msr:right-1.5 msr:flex msr:size-6 msr:items-center msr:justify-center msr:rounded-full msr:bg-[#0d99ff] msr:text-white msr:outline-none msr:disabled:opacity-40 ${expanded() ? "msr:bottom-1.5" : "msr:top-1/2 msr:-translate-y-1/2"}`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          submit();
        }}
        onClick={submit}
      ><SendIcon size={16} class="mesurer-send-icon" /></button>
    </div>
  );
}
