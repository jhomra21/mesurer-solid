import { createSignal } from "solid-js";
import type { InspectCssPart } from "../core/inspect-css";

export function InspectDetailRow(props: {
  row: InspectCssPart;
  copy(value: string): Promise<boolean>;
  passThrough?: boolean;
  onCopyResult?(success: boolean): void;
}) {
  const [status, setStatus] = createSignal("");

  const copyValue = async () => {
    const success = await props.copy(props.row.value);
    setStatus(success ? "Copied!" : "Copy failed");
    props.onCopyResult?.(success);
  };

  return (
    <div data-mesurer-inspect-css-row="true" class="msr:flex msr:w-full msr:min-w-0 msr:items-baseline msr:justify-between msr:gap-2">
      <span class="msr:shrink-0 msr:text-ink-500">{props.row.label}</span>
      {props.passThrough
        ? <span class="msr:min-w-0 msr:truncate msr:text-right msr:tabular-nums msr:text-ink-900">{props.row.value}</span>
        : <button
        type="button"
        aria-label={`Copy ${props.row.label}`}
        title={status() || "Click to copy"}
        class="msr:pointer-events-auto msr:min-w-0 msr:truncate msr:text-right msr:tabular-nums msr:text-ink-900 msr:hover:underline msr:focus-visible:outline-none msr:focus-visible:underline"
        onPointerUp={(event) => {
          event.stopPropagation();

          if (event.button === 0) void copyValue();
        }}
        onClick={(event) => {
          event.stopPropagation();

          if (event.detail === 0) void copyValue();
        }}
      >{props.row.value}</button>}
    </div>
  );
}
