import { For, Show } from "solid-js";
import type { ToolContribution } from "@jhomra21/mesurer-solid-core";
import { CursorIcon } from "./Icons";
import { Tooltip } from "./Tooltip";

export type ToolbarMode = "inspect" | "arrange";

export type ToolbarModeSwitchProps = {
  value: ToolbarMode;
  arrangeTool: ToolContribution;
  onChange: (value: ToolbarMode) => void;
  tooltipVisibleId: string | null;
  tooltipInstant: boolean;
  tooltipSide: "top" | "bottom";
  tooltipsEnabled: boolean;
  onTooltipEnter: (id: string) => void;
  onTooltipLeave: () => void;
};

function ArrangeIcon(props: { tool: ToolContribution }) {
  return (
    <Show
      when={props.tool.icon}
      fallback={<span class="msr:text-[12px] msr:font-semibold">A</span>}
    >
      {(icon) => (
        <svg width="20" height="20" viewBox={icon().viewBox ?? "0 0 24 24"} aria-hidden="true">
          <For each={icon().paths}>{(path) => <path d={path} fill="currentColor" />}</For>
        </svg>
      )}
    </Show>
  );
}

function ModeButton(props: {
  id: string;
  label: string;
  shortcut?: string;
  pressed: boolean;
  onClick: () => void;
  tooltipVisible: boolean;
  tooltipInstant: boolean;
  tooltipSide: "top" | "bottom";
  onTooltipEnter: (id: string) => void;
  onTooltipLeave: () => void;
  children: any;
}) {
  return (
    <div
      class="msr:relative"
      onMouseEnter={() => props.onTooltipEnter(props.id)}
      onMouseLeave={props.onTooltipLeave}
    >
      <button
        type="button"
        aria-label={`${props.label}${props.shortcut ? ` (${props.shortcut})` : ""}`}
        aria-pressed={props.pressed ? "true" : "false"}
        class={`msr:flex msr:size-7 msr:items-center msr:justify-center msr:rounded-[6px] msr:text-[11px] msr:font-medium msr:outline-none msr:focus-visible:outline msr:focus-visible:outline-1 msr:focus-visible:outline-ink-500 msr:focus-visible:outline-offset-1 ${props.pressed ? "msr:bg-transparent msr:text-ink-900" : "msr:text-ink-700 msr:hover:bg-ink-200/50"}`}
        onClick={props.onClick}
      >
        {props.children}
      </button>
      <Tooltip
        label={props.label}
        shortcut={props.shortcut}
        visible={props.tooltipVisible}
        instant={props.tooltipInstant}
        side={props.tooltipSide}
      />
    </div>
  );
}

export function ToolbarModeSwitch(props: ToolbarModeSwitchProps) {
  return (
    <div
      data-mesurer-toolbar-mode-switch="true"
      data-value={props.value}
      class="mesurer-toolbar-mode-switch msr:flex msr:flex-none msr:self-center msr:items-center msr:gap-[2px] msr:rounded-[8px] msr:bg-ink-50 msr:p-[2px]"
      role="group"
      aria-label="Toolbar mode"
    >
      <span class="mesurer-toolbar-mode-switch-pill" aria-hidden="true" />
      <ModeButton
        id="toolbar-mode-inspect"
        label="Select & Inspect"
        pressed={props.value === "inspect"}
        onClick={() => props.onChange("inspect")}
        tooltipVisible={props.tooltipsEnabled && props.tooltipVisibleId === "toolbar-mode-inspect"}
        tooltipInstant={props.tooltipInstant}
        tooltipSide={props.tooltipSide}
        onTooltipEnter={props.onTooltipEnter}
        onTooltipLeave={props.onTooltipLeave}
      >
        <CursorIcon size={20} />
      </ModeButton>
      <ModeButton
        id="toolbar-mode-arrange"
        label="Edit & Arrange"
        shortcut={props.arrangeTool.shortcut}
        pressed={props.value === "arrange"}
        onClick={() => props.onChange("arrange")}
        tooltipVisible={props.tooltipsEnabled && props.tooltipVisibleId === "toolbar-mode-arrange"}
        tooltipInstant={props.tooltipInstant}
        tooltipSide={props.tooltipSide}
        onTooltipEnter={props.onTooltipEnter}
        onTooltipLeave={props.onTooltipLeave}
      >
        <ArrangeIcon tool={props.arrangeTool} />
      </ModeButton>
    </div>
  );
}
