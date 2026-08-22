import { Show, createSignal, onSettled } from "solid-js";
import type { ToolMode } from "../core/types";
import type { MeasurerModel } from "../model/create-measurer-model";
import type { ContextActionsProps } from "./ContextActions";
import { SettingsPanel } from "./SettingsPanel";
import { Tooltip, createTooltip } from "./Tooltip";
import {
  CaretDownIcon,
  CheckIcon,
  ColorPickerIcon,
  CopyIcon,
  CopySelectionIcon,
  CursorIcon,
  GearIcon,
  MinusIcon,
  NoteIcon,
  RulerIcon,
  RulersIcon,
  SendIcon,
  TextInspectorIcon,
  XrayIcon,
} from "./Icons";

export type ToolbarProps = {
  model: MeasurerModel;
  ownerWindow: Window;
  onColorPicker: () => void;
  onClearWorkspace: () => void;
  onResetSettings: () => void;
  contextActions?: ContextActionsProps;
};

const TOOLBAR_DRAG_SLOP = 6;
const GUIDE_MENU_WIDTH = 176;
const VIEWPORT_PADDING = 8;

type ToolbarButtonProps = {
  id: string;
  active: boolean;
  disabled?: boolean;
  label: string;
  shortcut?: string;
  onClick: () => void;
  tooltipVisible: boolean;
  tooltipInstant: boolean;
  tooltipSide: "top" | "bottom";
  onTooltipEnter: (id: string) => void;
  onTooltipLeave: () => void;
  children: any;
};

function ToolbarButton(props: ToolbarButtonProps) {
  const inactiveClass = props.disabled
    ? "msr:cursor-default msr:bg-transparent msr:text-black/30"
    : "msr:bg-transparent msr:text-black msr:hover:bg-black/4";
  return (
    <div class="msr:relative" onMouseEnter={() => props.onTooltipEnter(props.id)} onMouseLeave={() => props.onTooltipLeave()}>
      <button
        type="button"
        aria-pressed={props.active ? "true" : "false"}
        aria-label={`${props.label}${props.shortcut ? ` (${props.shortcut})` : ""}`}
        disabled={props.disabled}
        class={`msr:flex msr:size-8 msr:select-none msr:items-center msr:justify-center msr:rounded-[8px] msr:outline-none ${props.active ? "msr:bg-[#0d99ff] msr:text-white" : inactiveClass}`}
        onClick={() => props.onClick()}
      >
        {props.children}
      </button>
      <Tooltip label={props.label} shortcut={props.shortcut} visible={props.tooltipVisible} instant={props.tooltipInstant} side={props.tooltipSide} />
    </div>
  );
}

export function Toolbar(props: ToolbarProps) {
  const [position, setPosition] = createSignal({ x: 16, y: 16 });
  const [guideMenuOpen, setGuideMenuOpen] = createSignal(false);
  const [activeMenuIndex, setActiveMenuIndex] = createSignal(0);
  const [menuAlign, setMenuAlign] = createSignal<"left" | "right">("right");
  const [noteComposerOpen, setNoteComposerOpen] = createSignal(false);
  const [note, setNote] = createSignal("");
  const [noteError, setNoteError] = createSignal<string | null>(null);
  const [contextBusy, setContextBusy] = createSignal(false);
  const [contextFlash, setContextFlash] = createSignal<string | null>(null);
  const tooltip = createTooltip(props.ownerWindow);
  let toolbarElement: HTMLDivElement | undefined;
  let settingsElement: HTMLDivElement | undefined;
  let guideMenuElement: HTMLDivElement | undefined;
  let noteComposerElement: HTMLDivElement | undefined;
  let contextFlashTimer = 0;
  let suppressClick = false;
  let previousUserSelect: string | null = null;

  const tooltipsEnabled = () => !guideMenuOpen() && !props.model.state.settingsOpen && !noteComposerOpen();
  const viewportHeight = () => props.ownerWindow.innerHeight || 0;
  const nearTop = () => position().y < 56;
  const nearBottom = () => viewportHeight() > 0 && position().y > viewportHeight() - 56;
  const tooltipSide = (): "top" | "bottom" => nearTop() && !nearBottom() ? "bottom" : "top";
  const menuSide = (): "top" | "bottom" => nearBottom() ? "top" : "bottom";
  const hasSelection = () => props.model.state.selectedMeasurements.length > 0 || Boolean(props.model.state.selectedMeasurement);

  const updateMenuAlign = () => {
    const anchorRect = guideMenuElement?.getBoundingClientRect();
    if (!anchorRect) return;
    const rightAlignedLeft = anchorRect.right - GUIDE_MENU_WIDTH;
    const leftAlignedRight = anchorRect.left + GUIDE_MENU_WIDTH;
    if (rightAlignedLeft < VIEWPORT_PADDING) { setMenuAlign("left"); return; }
    if (leftAlignedRight > props.ownerWindow.innerWidth - VIEWPORT_PADDING) { setMenuAlign("right"); return; }
    setMenuAlign("right");
  };

  const onToolbarPointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (event.button !== 0) return;
    const root = props.ownerWindow.document.documentElement;
    if (previousUserSelect === null) {
      previousUserSelect = root.style.userSelect;
      root.style.setProperty("user-select", "none", "important");
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = position();
    const rect = event.currentTarget.getBoundingClientRect();
    let active = false;
    let didDrag = false;
    const pointerId = event.pointerId;

    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const dx = next.clientX - startX;
      const dy = next.clientY - startY;
      if (!active) active = Math.abs(dx) > TOOLBAR_DRAG_SLOP || Math.abs(dy) > TOOLBAR_DRAG_SLOP;
      if (!active) return;
      didDrag = true;
      const maxX = Math.max(8, props.ownerWindow.innerWidth - rect.width - 8);
      const maxY = Math.max(8, props.ownerWindow.innerHeight - rect.height - 8);
      setPosition({ x: Math.min(maxX, Math.max(8, origin.x + dx)), y: Math.min(maxY, Math.max(8, origin.y + dy)) });
    };
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      suppressClick = didDrag;
      if (previousUserSelect !== null) {
        root.style.userSelect = previousUserSelect;
        previousUserSelect = null;
      }
      props.ownerWindow.removeEventListener("pointermove", move);
      props.ownerWindow.removeEventListener("pointerup", end);
      props.ownerWindow.removeEventListener("pointercancel", end);
    };
    props.ownerWindow.addEventListener("pointermove", move);
    props.ownerWindow.addEventListener("pointerup", end);
    props.ownerWindow.addEventListener("pointercancel", end);
  };

  const activate = (mode: ToolMode) => {
    props.model.setEnabled(true, !props.model.current.enabled);
    props.model.setTransient({ colorPickerActive: false, toolbarActive: true });
    props.model.toggleToolMode(mode);
  };
  const selectGuideOrientation = (orientation: "vertical" | "horizontal") => {
    props.model.setEnabled(true);
    if (props.model.current.toolMode !== "guides") props.model.toggleToolMode("guides");
    props.model.setGuideOrientation(orientation, true);
    setGuideMenuOpen(false);
  };
  const toggleSettings = () => {
    const open = !props.model.current.settingsOpen;
    const settingsTab = props.model.current.colorPickerActive ? "color-picker"
      : props.model.current.rulersVisible ? "rulers"
      : props.model.current.toolMode === "guides" ? "guides"
      : props.model.current.toolMode === "select" || props.model.current.toolMode === "text-inspector" ? "select" : "general";
    props.model.setTransient({ settingsOpen: open, settingsTab: open ? settingsTab : props.model.current.settingsTab });
  };

  const flashContextAction = (id: string) => {
    props.ownerWindow.clearTimeout(contextFlashTimer);
    setContextFlash(id);
    contextFlashTimer = props.ownerWindow.setTimeout(() => setContextFlash(null), 800);
  };
  const runContextAction = async (id: string, action: () => Promise<void>) => {
    if (contextBusy()) return;
    setContextBusy(true);
    try {
      await action();
      flashContextAction(id);
    } finally {
      setContextBusy(false);
    }
  };
  const openNoteComposer = () => {
    if (!props.contextActions || !hasSelection()) return;
    setNoteError(null);
    setNoteComposerOpen(true);
  };
  const addNote = () => {
    const contextActions = props.contextActions;
    if (!contextActions) return;
    try {
      contextActions.runtime.addSelectionAnnotation(note());
      setNote("");
      setNoteError(null);
      setNoteComposerOpen(false);
      flashContextAction("add-note");
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : String(error));
    }
  };

  onSettled(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const path = event.composedPath();
      if (guideMenuOpen() && guideMenuElement && !path.includes(guideMenuElement)) setGuideMenuOpen(false);
      if (props.model.current.settingsOpen && settingsElement && !path.includes(settingsElement)) props.model.setTransient({ settingsOpen: false });
      if (noteComposerOpen() && noteComposerElement && !path.includes(noteComposerElement)) setNoteComposerOpen(false);
    };
    const handleClickCapture = (event: MouseEvent) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    };
    const isEditable = (target: EventTarget | null) => {
      const realm = props.ownerWindow as Window & typeof globalThis;
      return target instanceof realm.HTMLElement && (
        target.isContentEditable ||
        target instanceof realm.HTMLInputElement ||
        target instanceof realm.HTMLTextAreaElement ||
        target instanceof realm.HTMLSelectElement
      );
    };
    const handleContextShortcut = (event: KeyboardEvent) => {
      const contextActions = props.contextActions;
      if (!contextActions || isEditable(event.target) || event.altKey) return;
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (!mod && key === "c") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey && hasSelection()) {
          void runContextAction("copy-selection", () => contextActions.onCopy({ scope: "selection" }));
        } else if (!event.shiftKey) {
          void runContextAction("copy-context", () => contextActions.onCopy());
        }
        return;
      }
      if (!mod && !event.shiftKey && key === "n" && hasSelection()) {
        event.preventDefault();
        event.stopPropagation();
        openNoteComposer();
        return;
      }
      if (mod && !event.shiftKey && event.key === "Enter" && contextActions.onSend && hasSelection()) {
        event.preventDefault();
        event.stopPropagation();
        void runContextAction("send-selection", () => contextActions.onSend!({ scope: "selection" }));
      }
    };
    const resize = () => { if (guideMenuOpen()) updateMenuAlign(); };
    props.ownerWindow.addEventListener("pointerdown", handlePointerDown);
    props.ownerWindow.addEventListener("keydown", handleContextShortcut);
    props.ownerWindow.addEventListener("resize", resize);
    toolbarElement?.addEventListener("click", handleClickCapture, true);
    return () => {
      props.ownerWindow.clearTimeout(contextFlashTimer);
      props.ownerWindow.removeEventListener("pointerdown", handlePointerDown);
      props.ownerWindow.removeEventListener("keydown", handleContextShortcut);
      props.ownerWindow.removeEventListener("resize", resize);
      toolbarElement?.removeEventListener("click", handleClickCapture, true);
      if (previousUserSelect !== null) props.ownerWindow.document.documentElement.style.userSelect = previousUserSelect;
    };
  });

  const buttonProps = (id: string) => ({
    tooltipVisible: tooltipsEnabled() && tooltip.visibleTooltipId() === id,
    tooltipInstant: tooltip.tooltipInstant(),
    tooltipSide: tooltipSide(),
    onTooltipEnter: tooltip.onTooltipEnter,
    onTooltipLeave: tooltip.onTooltipLeave,
  });

  return (
    <div
      ref={(element) => { toolbarElement = element; }}
      data-mesurer-toolbar="true"
      data-mesurer-inspector-ui="true"
      class="mesurer-toolbar-surface msr:pointer-events-auto msr:absolute msr:z-[90] msr:flex msr:items-center msr:gap-1 msr:rounded-[12px] msr:bg-[#fff] msr:p-1 msr:outline msr:outline-transparent"
      style={{ left: `${position().x}px`, top: `${position().y}px` }}
      onPointerDown={(event) => { event.stopPropagation(); props.model.setTransient({ toolbarActive: true }); onToolbarPointerDown(event); }}
      onClick={(event) => event.stopPropagation()}
      onMouseLeave={tooltip.onTooltipContainerLeave}
    >
      <ToolbarButton id="select" active={props.model.state.toolMode === "select"} label="Select" shortcut="S" onClick={() => activate("select")} {...buttonProps("select")}><CursorIcon size={20} /></ToolbarButton>
      <ToolbarButton id="xray" active={props.model.state.xrayVisible} label="X-ray" shortcut="X" onClick={() => { props.model.setEnabled(true); props.model.setTransient({ colorPickerActive: false }); props.model.toggleXray(); }} {...buttonProps("xray")}><XrayIcon size={20} /></ToolbarButton>
      <ToolbarButton
        id="color-picker"
        active={props.model.state.colorPickerActive}
        label="Color picker"
        shortcut="P"
        onClick={() => {
          if (props.model.current.colorPickerActive) props.model.setTransient({ colorPickerActive: false });
          else props.onColorPicker();
        }}
        {...buttonProps("color-picker")}
      ><ColorPickerIcon size={20} /></ToolbarButton>
      <ToolbarButton id="rulers" active={props.model.state.rulersVisible} label="Rulers" shortcut="R" onClick={() => { props.model.setEnabled(true); props.model.setTransient({ colorPickerActive: false }); props.model.toggleRulers(); }} {...buttonProps("rulers")}><RulersIcon size={20} /></ToolbarButton>
      <ToolbarButton id="text-inspector" active={props.model.state.toolMode === "text-inspector"} label="Text inspector" shortcut="A" onClick={() => activate("text-inspector")} {...buttonProps("text-inspector")}><TextInspectorIcon size={20} /></ToolbarButton>
      <ToolbarButton id="guides" active={props.model.state.toolMode === "guides"} label="Guides" shortcut="G" onClick={() => activate("guides")} {...buttonProps("guides")}><RulerIcon size={20} class={props.model.state.guideOrientation === "vertical" ? "msr:rotate-[135deg]" : "msr:rotate-[45deg]"} /></ToolbarButton>

      <div ref={(element) => { guideMenuElement = element; }} class="msr:group msr:relative msr:-ml-1 msr:flex msr:items-stretch" onMouseEnter={() => tooltip.onTooltipEnter("guide-menu")} onMouseLeave={tooltip.onTooltipLeave}>
        <button
          type="button"
          aria-label="Guide orientation menu"
          class={`msr:flex msr:h-8 msr:w-4 msr:items-center msr:justify-center msr:rounded-[6px] msr:outline-none msr:hover:bg-black/10 ${guideMenuOpen() ? "msr:bg-black/10 msr:text-black" : "msr:text-black"}`}
          onClick={() => { setGuideMenuOpen((open) => { if (!open) { setActiveMenuIndex(props.model.state.guideOrientation === "horizontal" ? 0 : 1); updateMenuAlign(); } return !open; }); }}
        ><CaretDownIcon size={8} /></button>
        <span class={`msr:pointer-events-none msr:absolute msr:left-1/2 msr:-translate-x-1/2 msr:whitespace-nowrap msr:rounded msr:bg-black msr:px-2 msr:py-1 msr:text-[11px] msr:text-white msr:transition-opacity msr:duration-150 msr:select-none ${tooltipSide() === "top" ? "msr:bottom-full msr:mb-2" : "msr:top-full msr:mt-2"} ${tooltip.visibleTooltipId() === "guide-menu" && tooltipsEnabled() ? "msr:opacity-100" : "msr:opacity-0"}`}>Orientation Guide</span>
        <Show when={guideMenuOpen()}>
          <div
            class={`mesurer-menu-surface msr:absolute msr:z-[70] msr:w-44 msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-1 msr:outline-none msr:focus:outline-none msr:flex msr:flex-col msr:gap-px ${menuSide() === "bottom" ? "msr:top-full msr:mt-2" : "msr:bottom-full msr:mb-2"} ${menuAlign() === "left" ? "msr:left-0" : "msr:right-0"}`}
            role="menu"
            tabindex={0}
            onKeyDown={(event) => {
              const key = event.key.toLowerCase();
              if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActiveMenuIndex((index) => (index + 1) % 2); }
              else if (event.key === "Enter") { event.preventDefault(); selectGuideOrientation(activeMenuIndex() === 0 ? "horizontal" : "vertical"); }
              else if (key === "h" || key === "v") { event.preventDefault(); selectGuideOrientation(key === "h" ? "horizontal" : "vertical"); }
              else if (event.key === "Escape") { event.preventDefault(); setGuideMenuOpen(false); }
            }}
          >
            <button type="button" class={`msr:group msr:flex msr:w-full msr:items-center msr:gap-2 msr:rounded-md msr:px-2 msr:py-1.5 msr:text-left msr:text-[12px] ${activeMenuIndex() === 0 || props.model.state.guideOrientation === "horizontal" ? "msr:bg-[#0d99ff] msr:text-white" : "msr:text-ink-700 msr:hover:bg-[#0d99ff] msr:hover:text-white"}`} onClick={() => selectGuideOrientation("horizontal")}><CheckIcon size={12} class={props.model.state.guideOrientation === "horizontal" ? "msr:opacity-100" : "msr:opacity-0"} /><MinusIcon size={12} /><span class="msr:flex-1">Horizontal</span><span>H</span></button>
            <button type="button" class={`msr:group msr:flex msr:w-full msr:items-center msr:gap-2 msr:rounded-md msr:px-2 msr:py-1.5 msr:text-left msr:text-[12px] ${activeMenuIndex() === 1 || props.model.state.guideOrientation === "vertical" ? "msr:bg-[#0d99ff] msr:text-white" : "msr:text-ink-700 msr:hover:bg-[#0d99ff] msr:hover:text-white"}`} onClick={() => selectGuideOrientation("vertical")}><CheckIcon size={12} class={props.model.state.guideOrientation === "vertical" ? "msr:opacity-100" : "msr:opacity-0"} /><MinusIcon size={12} class="msr:rotate-90" /><span class="msr:flex-1">Vertical</span><span>V</span></button>
          </div>
        </Show>
      </div>

      <Show when={props.contextActions}>{(contextActions) => (
        <>
          <div class="msr:mx-0.5 msr:h-5 msr:w-px msr:bg-black/10" aria-hidden="true" />
          <ToolbarButton id="copy-context" active={contextFlash() === "copy-context"} disabled={contextBusy()} label="Copy context" shortcut="C" onClick={() => void runContextAction("copy-context", () => contextActions().onCopy())} {...buttonProps("copy-context")}><CopyIcon size={20} /></ToolbarButton>
          <ToolbarButton id="copy-selection" active={contextFlash() === "copy-selection"} disabled={contextBusy() || !hasSelection()} label="Copy selection" shortcut="⇧C" onClick={() => void runContextAction("copy-selection", () => contextActions().onCopy({ scope: "selection" }))} {...buttonProps("copy-selection")}><CopySelectionIcon size={20} /></ToolbarButton>
          <div class="msr:relative">
            <ToolbarButton id="add-note" active={noteComposerOpen() || contextFlash() === "add-note"} disabled={!hasSelection()} label="Add note" shortcut="N" onClick={openNoteComposer} {...buttonProps("add-note")}><NoteIcon size={20} /></ToolbarButton>
            <Show when={noteComposerOpen()}>
              <div
                ref={(element) => { noteComposerElement = element; }}
                data-mesurer-layer="chrome"
                data-mesurer-inspector-ui="true"
                class={`mesurer-menu-surface msr:absolute msr:left-0 msr:z-[70] msr:w-[280px] msr:max-w-[calc(100vw-16px)] msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-2 ${menuSide() === "bottom" ? "msr:top-full msr:mt-2" : "msr:bottom-full msr:mb-2"}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <textarea
                  autofocus
                  value={note()}
                  placeholder="Describe what should change…"
                  onInput={(event) => {
                    setNote(event.currentTarget.value);
                    setNoteError(null);
                  }}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      addNote();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setNoteComposerOpen(false);
                    }
                  }}
                  class="msr:box-border msr:h-20 msr:w-full msr:resize-y msr:rounded-md msr:border msr:border-ink-200 msr:bg-white msr:p-2 msr:text-[12px] msr:text-black msr:outline-none msr:focus:border-ink-400"
                />
                <Show when={noteError()}>{(message) => <div class="msr:mt-1.5 msr:text-[11px] msr:text-red-600">{message()}</div>}</Show>
                <div class="msr:mt-2 msr:flex msr:items-center msr:justify-between msr:gap-2">
                  <span class="msr:text-[10px] msr:text-ink-500">⌘/Ctrl + Enter</span>
                  <div class="msr:flex msr:gap-1">
                    <button type="button" class="msr:rounded-md msr:border-0 msr:bg-transparent msr:px-2 msr:py-1.5 msr:text-[11px] msr:text-black msr:hover:bg-black/4" onClick={() => setNoteComposerOpen(false)}>Cancel</button>
                    <button type="button" class="msr:rounded-md msr:border-0 msr:bg-[#0d99ff] msr:px-2 msr:py-1.5 msr:text-[11px] msr:font-medium msr:text-white" onClick={addNote}>Add note</button>
                  </div>
                </div>
              </div>
            </Show>
          </div>
          <Show when={contextActions().onSend}>{(send) => (
            <ToolbarButton id="send-selection" active={contextFlash() === "send-selection"} disabled={contextBusy() || !hasSelection()} label={contextActions().sendLabel ?? "Send to agent"} shortcut="⌘/Ctrl+Enter" onClick={() => void runContextAction("send-selection", () => send()({ scope: "selection" }))} {...buttonProps("send-selection")}><SendIcon size={20} /></ToolbarButton>
          )}</Show>
        </>
      )}</Show>

      <div ref={(element) => { settingsElement = element; }} class="msr:relative msr:flex">
        <ToolbarButton id="settings" active={props.model.state.settingsOpen} label="Settings" shortcut="⌘/Ctrl+," onClick={toggleSettings} {...buttonProps("settings")}><GearIcon size={20} /></ToolbarButton>
        <Show when={props.model.state.settingsOpen}>
          <div
            class={`mesurer-menu-surface msr:absolute msr:-right-1 msr:z-[70] msr:box-border msr:w-[272px] msr:max-w-[calc(100vw-16px)] msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-3 ${menuSide() === "bottom" ? "msr:top-full msr:mt-2" : "msr:bottom-full msr:mb-2"}`}
            data-mesurer-inspector-ui="true"
            role="dialog"
            aria-label="Settings"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <SettingsPanel model={props.model} ownerWindow={props.ownerWindow} onResetSettings={props.onResetSettings} onClearWorkspace={props.onClearWorkspace} />
          </div>
        </Show>
      </div>
    </div>
  );
}