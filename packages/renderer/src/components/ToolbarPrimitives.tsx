import { For, Show } from "solid-js";
import type { ToolContribution } from "@jhomra21/mesurer-solid-core";
import { Tooltip } from "./Tooltip";
import {
  CaretDownIcon,
  EditModeIcon,
  SelectModeIcon,
} from "./Icons";

type ToolbarButtonProps = {
  id: string;
  active: boolean;
  disabled?: boolean;
  builtin?: string;
  toolId?: string;
  label: string;
  shortcut?: string;
  shortcutsEnabled: boolean;
  onClick: () => void;
  tooltipVisible: boolean;
  tooltipInstant: boolean;
  tooltipSide: "top" | "bottom";
  onTooltipEnter: (id: string) => void;
  onTooltipLeave: () => void;
  children: any;
};

export function ToolbarButton(props: ToolbarButtonProps) {
  const inactiveClass = () => props.disabled
    ? "msr:bg-transparent msr:text-ink-500 msr:opacity-80 msr:cursor-default"
    : "msr:bg-transparent msr:text-black msr:hover:bg-black/4";

  const visibleShortcut = () => props.shortcutsEnabled ? props.shortcut : undefined;

  return (
    <div
      class="msr:relative"
      data-mesurer-builtin={props.builtin}
      data-mesurer-tool-id={props.toolId}
      onMouseEnter={() => props.onTooltipEnter(props.id)}
      onMouseLeave={() => props.onTooltipLeave()}
    >
      <button
        type="button"
        data-mesurer-builtin={props.builtin}
        data-mesurer-tool-id={props.toolId}
        aria-pressed={props.active ? "true" : "false"}
        aria-label={`${props.label}${visibleShortcut() ? ` (${visibleShortcut()})` : ""}`}
        disabled={props.disabled ?? false}
        class={`msr:flex msr:size-8 msr:select-none msr:items-center msr:justify-center msr:rounded-[8px] msr:outline-none ${props.active ? "msr:bg-[#0d99ff] msr:text-white" : inactiveClass()}`}
        onClick={() => props.onClick()}
      >
        {props.children}
      </button>
      <Tooltip label={props.label} shortcut={visibleShortcut()} visible={props.tooltipVisible} instant={props.tooltipInstant} side={props.tooltipSide} />
    </div>
  );
}

export function CompactItem(props: { visible: boolean; children: any }) {
  return (
    <div
      data-mesurer-toolbar-compact-item="true"
      data-visible={props.visible ? "true" : "false"}
      aria-hidden={props.visible ? undefined : "true"}
      inert={props.visible ? undefined : true}
      class={`msr:flex msr:min-w-0 msr:flex-none msr:transition-[max-width,opacity,transform,padding] msr:duration-150 msr:ease-[ease] msr:motion-reduce:transition-none ${props.visible ? "msr:max-w-20 msr:px-0.5 msr:translate-x-0 msr:overflow-visible msr:opacity-100" : "msr:max-w-0 msr:px-0 msr:-translate-x-1 msr:overflow-hidden msr:opacity-0 msr:pointer-events-none"}`}
    >
      {props.children}
    </div>
  );
}

export function ToolbarDivider(props: { visible?: boolean; marker?: string }) {
  const visible = () => props.visible ?? true;

  return (
    <div
      data-mesurer-toolbar-divider={props.marker ?? "true"}
      aria-hidden="true"
      class={`msr:self-stretch msr:flex-none msr:bg-black/10 msr:transition-[width,opacity] msr:duration-150 msr:ease-[ease] msr:motion-reduce:transition-none ${visible() ? "msr:w-px msr:opacity-100" : "msr:w-0 msr:opacity-0"}`}
    />
  );
}


export function ToolbarModeSwitch(props: {
  value: "select" | "edit";
  editDisabled: boolean;
  editToolId?: string;
  editOptionsAvailable: boolean;
  editOptionsOpen: boolean;
  editOptions: any;
  shortcutsEnabled: boolean;
  tooltipVisibleId: string | null;
  tooltipInstant: boolean;
  tooltipSide: "top" | "bottom";
  onTooltipEnter: (id: string) => void;
  onTooltipLeave: () => void;
  onSelect: () => void;
  onEdit: () => void;
  onEditOptions: (anchor: HTMLElement) => void;
}) {
  const shortcut = (value: string) => props.shortcutsEnabled ? value : undefined;

  return (
    <div
      class="mesurer-toolbar-mode-switch msr:flex msr:flex-none msr:self-center msr:items-center msr:gap-[2px] msr:p-[2px]"
      data-mesurer-toolbar-mode-switch="true"
      data-value={props.value}
      role="group"
      aria-label="Toolbar mode"
    >
      <span class="mesurer-toolbar-mode-switch-pill" aria-hidden="true" />
      <div
        class="msr:relative"
        onMouseEnter={() => props.onTooltipEnter("toolbar-mode-select")}
        onMouseLeave={() => props.onTooltipLeave()}
      >
        <button
          type="button"
          data-mesurer-toolbar-mode="select"
          aria-label={`Select mode${shortcut("1") ? " (1)" : ""}`}
          aria-keyshortcuts={shortcut("1")}
          aria-pressed={props.value === "select" ? "true" : "false"}
          class="mesurer-toolbar-mode-button"
          onClick={props.onSelect}
        >
          <SelectModeIcon size={20} />
        </button>
        <Tooltip
          label="Select"
          shortcut={shortcut("1")}
          visible={props.tooltipVisibleId === "toolbar-mode-select"}
          instant={props.tooltipInstant}
          side={props.tooltipSide}
        />
      </div>
      <div
        data-mesurer-plugin-menu-root="true"
        data-mesurer-tool-menu-root={props.editToolId}
        data-mesurer-toolbar-edit-control="true"
        class="msr:relative msr:flex msr:items-stretch"
      >
        <div
          class="msr:relative"
          onMouseEnter={() => props.onTooltipEnter("toolbar-mode-edit")}
          onMouseLeave={() => props.onTooltipLeave()}
        >
          <button
            type="button"
            data-mesurer-toolbar-mode="edit"
            data-mesurer-tool-id={props.editToolId}
            aria-label={`Edit mode${shortcut("2") ? " (2)" : ""}`}
            aria-keyshortcuts={shortcut("2")}
            aria-pressed={props.value === "edit" ? "true" : "false"}
            disabled={props.editDisabled}
            class="mesurer-toolbar-mode-button"
            onClick={props.onEdit}
          >
            <EditModeIcon size={20} />
          </button>
          <Tooltip
            label="Edit"
            shortcut={shortcut("2")}
            visible={!props.editDisabled && props.tooltipVisibleId === "toolbar-mode-edit"}
            instant={props.tooltipInstant}
            side={props.tooltipSide}
          />
        </div>
        <Show when={props.editOptionsAvailable}>
          <button
            type="button"
            data-mesurer-tool-menu-trigger={props.editToolId}
            aria-label="Edit options"
            aria-haspopup="menu"
            aria-expanded={props.editOptionsOpen ? "true" : "false"}
            disabled={props.editDisabled}
            class={`msr:relative msr:flex msr:h-7 msr:w-4 msr:items-center msr:justify-center msr:self-center msr:rounded-[3px] msr:outline-none ${props.editOptionsOpen ? "msr:bg-black/10 msr:text-black" : "msr:text-black msr:hover:bg-black/10"}`}
            onMouseEnter={() => props.onTooltipEnter("toolbar-mode-edit-options")}
            onMouseLeave={() => props.onTooltipLeave()}
            onClick={(event) => props.onEditOptions(
              event.currentTarget.parentElement ?? event.currentTarget,
            )}
          >
            <CaretDownIcon size={8} />
            <Tooltip
              label="Edit options"
              visible={!props.editDisabled && props.tooltipVisibleId === "toolbar-mode-edit-options"}
              instant={props.tooltipInstant}
              side={props.tooltipSide}
            />
          </button>
        </Show>
        {props.editOptions}
      </div>
    </div>
  );
}

export function PluginIcon(props: { tool: ToolContribution }) {
  return (
    <Show
      when={props.tool.icon}
      fallback={<span class="msr:text-[12px] msr:font-semibold">{props.tool.label.slice(0, 1).toUpperCase()}</span>}
    >
      {(icon) => (
        <svg width="20" height="20" viewBox={icon().viewBox ?? "0 0 24 24"} aria-hidden="true">
          <For each={icon().paths}>{(path) => <path d={path} fill="currentColor" />}</For>
        </svg>
      )}
    </Show>
  );
}

