import { createSignal, onCleanup } from "solid-js";

const TOOLTIP_DELAY_MS = 800;

export function Tooltip(props: {
  label: string;
  shortcut?: string;
  visible?: boolean;
  instant?: boolean;
  side?: "top" | "bottom";
  class?: string;
}) {
  const side = () => props.side ?? "top";
  return (
    <span
      role="tooltip"
      class={`msr:pointer-events-none msr:absolute msr:left-1/2 msr:-translate-x-1/2 msr:whitespace-nowrap msr:rounded msr:bg-black msr:px-2 msr:py-1 msr:text-[11px] msr:text-white msr:transition-opacity msr:duration-150 msr:select-none ${props.instant ? "msr:transition-none" : ""} ${side() === "top" ? "msr:bottom-full msr:mb-2" : "msr:top-full msr:mt-2"} ${props.visible === undefined ? "" : props.visible ? "msr:opacity-100" : "msr:opacity-0"} ${props.class ?? ""}`}
    >
      {props.label}{props.shortcut ? <> <kbd class="msr:text-white/60">{props.shortcut}</kbd></> : null}
    </span>
  );
}

export function createTooltip(ownerWindow: Window) {
  const [visibleTooltipId, setVisibleTooltipId] = createSignal<string | null>(null);
  const [tooltipInstant, setTooltipInstant] = createSignal(false);
  let timer: number | null = null;
  let instant = false;

  const clearTimer = () => {
    if (timer === null) return;
    ownerWindow.clearTimeout(timer);
    timer = null;
  };
  const onTooltipEnter = (id: string) => {
    clearTimer();
    if (instant) {
      setTooltipInstant(true);
      setVisibleTooltipId(id);
      return;
    }
    setTooltipInstant(false);
    timer = ownerWindow.setTimeout(() => {
      setVisibleTooltipId(id);
      instant = true;
      timer = null;
    }, TOOLTIP_DELAY_MS);
  };
  const onTooltipLeave = () => {
    clearTimer();
    setVisibleTooltipId(null);
  };
  const onTooltipContainerLeave = () => {
    clearTimer();
    setVisibleTooltipId(null);
    instant = false;
    setTooltipInstant(false);
  };
  onCleanup(clearTimer);
  return { visibleTooltipId, tooltipInstant, onTooltipEnter, onTooltipLeave, onTooltipContainerLeave };
}
