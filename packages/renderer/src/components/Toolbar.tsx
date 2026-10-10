import { For, Show, createSignal, flush, onSettled } from "solid-js";
import type { ToolContribution, ToolMenuItemContribution } from "@jhomra21/mesurer-solid-core";
import type { SelectionSpacingStyle } from "../core/persistence";
import type { MesurerModel } from "../model/create-mesurer-model";
import type { MesurerBuiltinPluginId } from "../plugins/builtins";
import { supportsColorPicker } from "../runtime/color-picker-support";
import { constrainToolbarPosition } from "../runtime/toolbar-position";
import { MotionPlayer } from "./MotionPlayer";
import { SettingsPanel } from "./SettingsPanel";
import { Tooltip, createTooltip } from "./Tooltip";
import {
  CompactItem,
  PluginIcon,
  ToolbarButton,
  ToolbarDivider,
  ToolbarModeSwitch,
} from "./ToolbarPrimitives";
import {
  CaretDownIcon,
  CheckIcon,
  ColorPickerIcon,
  CursorIcon,
  GearIcon,
  MinusIcon,
  RulerIcon,
  RulersIcon,
  TextInspectorIcon,
  XrayIcon,
} from "./Icons";

export type ToolbarProps = {
  model: MesurerModel;
  ownerWindow: Window;
  onBuiltinAction: (id: Exclude<MesurerBuiltinPluginId, "distance">) => void;
  pluginTools?: ToolContribution[];
  onPluginTool?: (tool: ToolContribution) => void;
  onPluginToolMenuItem?: (tool: ToolContribution, item: ToolMenuItemContribution) => void;
  isBuiltinActionDisabled?: (id: Exclude<MesurerBuiltinPluginId, "distance">) => boolean;
  typographyContextActive?: boolean;
  onClearWorkspace: () => void;
  onResetSettings: () => void;
  selectionSpacingStyle: SelectionSpacingStyle;
  onSelectionSpacingStyleChange: (patch: Partial<SelectionSpacingStyle>) => void;
  initialPosition?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  motion?: {
    element(): Element | null;
  };
};

const TOOLBAR_DRAG_SLOP = 6;

const TOOLBAR_DRAG_IGNORE_SELECTOR = "input, textarea, select, [contenteditable], [data-slider-container], [role='menu'], [role='dialog']";

const GUIDE_MENU_WIDTH = 176;

const TOOL_MENU_MIN_WIDTH = 224;

const TOOL_MENU_MAX_WIDTH = 360;

const TOOL_MENU_CHARACTER_WIDTH = 6.5;

const TOOL_MENU_INLINE_CHROME = 52;

const TOOL_MENU_ITEM_HEIGHT = 28;

const TOOL_MENU_CHROME_HEIGHT = 8;

const TOOL_MENU_GAP = 8;

const SETTINGS_MENU_WIDTH = 272;

const VIEWPORT_PADDING = 8;

const GUIDE_MENU_IDEAL_HEIGHT = 72;

const SETTINGS_MENU_IDEAL_HEIGHT = 360;

const MOTION_PLAYER_WIDTH = 352;

const MOTION_PLAYER_GAP = 8;

const MOTION_PLAYER_IDEAL_HEIGHT = 260;

const MOTION_DETACH_SLOP = 14;

type MotionPlayerGeometry = {
  left: number;
  top: number | null;
  bottom: number | null;
  width: number;
  maxHeight: number;
};

export function Toolbar(props: ToolbarProps) {
  const [position, setPosition] = createSignal(props.initialPosition ?? { x: 16, y: 16 });
  const [detachedMotionPosition, setDetachedMotionPosition] = createSignal<{ x: number; y: number } | null>(null);
  const [motionSuspended, setMotionSuspended] = createSignal(false);
  const [guideMenuOpen, setGuideMenuOpen] = createSignal(false);
  const [pluginMenuOpenId, setPluginMenuOpenId] = createSignal<string | null>(null);
  const [activeMenuIndex, setActiveMenuIndex] = createSignal(0);
  const [menuAlign, setMenuAlign] = createSignal<"left" | "right">("right");
  const [compact, setCompact] = createSignal(false);
  const [viewportRevision, setViewportRevision] = createSignal(0);
  const tooltip = createTooltip(props.ownerWindow);
  let toolbarElement: HTMLDivElement | undefined;
  let motionSurfaceElement: HTMLDivElement | undefined;
  let cancelMotionDrag: (() => void) | null = null;
  let suppressMotionClick = false;
  let settingsElement: HTMLDivElement | undefined;
  let guideMenuElement: HTMLDivElement | undefined;
  let modeStageElement: HTMLDivElement | undefined;
  let selectModePanelElement: HTMLDivElement | undefined;
  let editModePanelElement: HTMLDivElement | undefined;
  let pluginMenuAnchorElement: HTMLElement | undefined;
  let suppressClick = false;
  let previousUserSelect: string | null = null;
  let cancelActiveDrag: (() => void) | null = null;
  const [colorPickerSupported, setColorPickerSupported] = createSignal(false);
  let colorPickerConfirmTimer = 0;
  let compactMotionTimer = 0;
  let modeMotionTimer = 0;
  let colorPickerCapabilityRevision = 0;
  const colorPickerOwnerWindow = () => toolbarElement?.ownerDocument.defaultView ?? props.ownerWindow;

  const recordingActive = () => (props.pluginTools ?? []).some(
    (tool) => tool.id === "recording" && (tool.active?.() ?? false),
  );

  const visibleMotionElement = () =>
    recordingActive() ? null : props.motion?.element() ?? null;

  let previousMotionElement: Element | null = null;

  createEffect(() => {
    const element = visibleMotionElement();

    if (element !== previousMotionElement) {
      previousMotionElement = element;
      setDetachedMotionPosition(null);
    }
  });

  const commitColorPickerCapability = (supported: boolean, revision: number) => {
    colorPickerOwnerWindow().queueMicrotask(() => {
      if (revision !== colorPickerCapabilityRevision) return;
      setColorPickerSupported(supported);
      flush();
    });
  };

  const refreshColorPickerCapability = () => {
    const candidateWindow = colorPickerOwnerWindow();
    const revision = ++colorPickerCapabilityRevision;

    if (colorPickerConfirmTimer) {
      candidateWindow.clearTimeout(colorPickerConfirmTimer);
      colorPickerConfirmTimer = 0;
    }

    if (!supportsColorPicker(candidateWindow)) {
      commitColorPickerCapability(false, revision);

      return;
    }

    colorPickerConfirmTimer = candidateWindow.setTimeout(() => {
      colorPickerConfirmTimer = 0;

      if (revision !== colorPickerCapabilityRevision) return;
      commitColorPickerCapability(
        supportsColorPicker(colorPickerOwnerWindow()),
        revision,
      );
    }, 100);
  };

  const selectActive = () => props.model.state.toolMode === "select";
  const xrayActive = () => props.model.state.xrayVisible;
  const colorPickerActive = () => props.model.state.colorPickerActive;
  const rulersActive = () => props.model.state.rulersVisible;
  const typographyActive = () => props.model.state.toolMode === "text-inspector" || (props.typographyContextActive ?? false);
  const guidesActive = () => props.model.state.toolMode === "guides";
  const settingsActive = () => props.model.state.settingsOpen;

  const editModeTool = () => (props.pluginTools ?? []).find(
    (tool) => tool.modeSwitch === true && tool.toolbarMode === "edit",
  );

  const toolbarMode = (): "select" | "edit" =>
    editModeTool()?.active?.() ? "edit" : "select";

  const selectPluginTools = () => (props.pluginTools ?? []).filter(
    (tool) => tool.toolbarMode === "select" && !tool.modeSwitch,
  );

  const editPluginTools = () => (props.pluginTools ?? []).filter(
    (tool) => tool.toolbarMode === "edit" && !tool.modeSwitch,
  );

  const alwaysPluginTools = () => (props.pluginTools ?? []).filter(
    (tool) => tool.toolbarMode === "always" || tool.toolbarMode === undefined,
  );

  const pluginActive = () => alwaysPluginTools().some((tool) => tool.active?.() ?? false);

  const builtinActive = () => selectActive() || xrayActive() || colorPickerActive() || rulersActive() || typographyActive() || guidesActive();
  const visibleInToolbar = (active: boolean, pinned = false) => pinned || !compact() || active;

  const alwaysPluginDividerVisible = () =>
    alwaysPluginTools().length > 0
    && (!compact() || builtinActive() || pluginActive());

  const compactDividerVisible = () =>
    !compact() || builtinActive() || pluginActive() || settingsActive();

  const tooltipsEnabled = () => !guideMenuOpen() && !pluginMenuOpenId() && !props.model.state.settingsOpen;

  const toolbarMenuOpen = () =>
    guideMenuOpen()
    || pluginMenuOpenId() !== null
    || props.model.state.settingsOpen;

  const builtinDisabled = (id: Exclude<MesurerBuiltinPluginId, "distance">) => props.isBuiltinActionDisabled?.(id) ?? false;
  const viewportHeight = () => props.ownerWindow.innerHeight || 0;
  const nearTop = () => position().y < 56;
  const nearBottom = () => viewportHeight() > 0 && position().y > viewportHeight() - 56;
  const tooltipSide = (): "top" | "bottom" => nearTop() && !nearBottom() ? "bottom" : "top";

  const guideMenuSide = (): "top" | "bottom" => {
    position();
    const rect = guideMenuElement?.getBoundingClientRect();

    if (!rect) return nearBottom() ? "top" : "bottom";
    const below = Math.max(0, viewportHeight() - rect.bottom - VIEWPORT_PADDING);
    const above = Math.max(0, rect.top - VIEWPORT_PADDING);

    return below >= GUIDE_MENU_IDEAL_HEIGHT || below >= above ? "bottom" : "top";
  };

  const settingsMenuSide = (): "top" | "bottom" => {
    position();
    const rect = toolbarElement?.getBoundingClientRect();

    if (!rect) return nearBottom() ? "top" : "bottom";
    const below = Math.max(0, viewportHeight() - rect.bottom - VIEWPORT_PADDING);
    const above = Math.max(0, rect.top - VIEWPORT_PADDING);

    return below >= SETTINGS_MENU_IDEAL_HEIGHT || below >= above ? "bottom" : "top";
  };

  const settingsMenuLeft = () => {
    position();
    compact();
    settingsActive();
    viewportRevision();
    const anchor = settingsElement?.getBoundingClientRect();

    if (!anchor) return 0;
    const viewportWidth = props.ownerWindow.innerWidth || SETTINGS_MENU_WIDTH + VIEWPORT_PADDING * 2;
    const width = Math.min(SETTINGS_MENU_WIDTH, Math.max(0, viewportWidth - VIEWPORT_PADDING * 2));
    const idealViewportLeft = anchor.right + 4 - width;
    const maxViewportLeft = Math.max(VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - width);
    const viewportLeft = Math.min(maxViewportLeft, Math.max(VIEWPORT_PADDING, idealViewportLeft));

    return viewportLeft - anchor.left;
  };

  const motionPlayerGeometry = (): MotionPlayerGeometry => {
    position();
    compact();
    viewportRevision();

    const toolbar = toolbarElement?.getBoundingClientRect();
    const viewportWidth = props.ownerWindow.innerWidth || MOTION_PLAYER_WIDTH + VIEWPORT_PADDING * 2;
    const viewportHeightValue = props.ownerWindow.innerHeight || MOTION_PLAYER_IDEAL_HEIGHT + VIEWPORT_PADDING * 2;

    const width = Math.min(
      MOTION_PLAYER_WIDTH,
      Math.max(0, viewportWidth - VIEWPORT_PADDING * 2),
    );

    if (!toolbar) {
      return {
        left: VIEWPORT_PADDING,
        top: VIEWPORT_PADDING,
        bottom: null,
        width,
        maxHeight: Math.max(0, viewportHeightValue - VIEWPORT_PADDING * 2),
      };
    }

    const left = Math.min(
      Math.max(VIEWPORT_PADDING, toolbar.left),
      Math.max(VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - width),
    );

    const below = Math.max(
      0,
      viewportHeightValue - toolbar.bottom - MOTION_PLAYER_GAP - VIEWPORT_PADDING,
    );

    const above = Math.max(
      0,
      toolbar.top - MOTION_PLAYER_GAP - VIEWPORT_PADDING,
    );

    if (below >= MOTION_PLAYER_IDEAL_HEIGHT || below >= above) {
      return {
        left,
        top: toolbar.bottom + MOTION_PLAYER_GAP,
        bottom: null,
        width,
        maxHeight: below,
      };
    }

    return {
      left,
      top: null,
      bottom: viewportHeightValue - toolbar.top + MOTION_PLAYER_GAP,
      width,
      maxHeight: above,
    };
  };

  const motionSurfaceGeometry = (): MotionPlayerGeometry => {
    const attached = motionPlayerGeometry();
    const detached = detachedMotionPosition();

    if (!detached) return attached;

    const maxX = Math.max(VIEWPORT_PADDING, props.ownerWindow.innerWidth - attached.width - VIEWPORT_PADDING);
    const maxY = Math.max(VIEWPORT_PADDING, props.ownerWindow.innerHeight - MOTION_PLAYER_IDEAL_HEIGHT - VIEWPORT_PADDING);

    return {
      ...attached,
      left: Math.min(maxX, Math.max(VIEWPORT_PADDING, detached.x)),
      top: Math.min(maxY, Math.max(VIEWPORT_PADDING, detached.y)),
      bottom: null,
      maxHeight: Math.max(0, props.ownerWindow.innerHeight - VIEWPORT_PADDING * 2),
    };
  };

  const onMotionPointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (event.button !== 0) return;

    const target = event.target;
    const realm = props.ownerWindow as Window & typeof globalThis;

    if (!(target instanceof realm.Element)) return;

    // Preview pixels are a drag handle after a deliberate gesture. Playback,
    // timeline, speed and inspector controls retain their native interactions.
    if (target.closest("button, input, select, textarea, [role='slider']")
      && !target.closest('button[aria-label="Motion preview"]')) return;

    const surface = event.currentTarget;
    const rect = surface.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const originalTransform = surface.style.transform;
    const originalWillChange = surface.style.willChange;
    let frame = 0;
    let dragging = false;
    let nextX = rect.left;
    let nextY = rect.top;

    cancelMotionDrag?.();
    suppressMotionClick = false;

    const paint = () => {
      frame = 0;
      surface.style.transform = `translate3d(${nextX - rect.left}px, ${nextY - rect.top}px, 0)`;
    };

    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const dx = next.clientX - startX;
      const dy = next.clientY - startY;

      if (!dragging && Math.hypot(dx, dy) < MOTION_DETACH_SLOP) return;

      if (!dragging) {
        dragging = true;
        setMotionSuspended(true);
        surface.style.willChange = "transform";
      }

      const maxX = Math.max(VIEWPORT_PADDING, props.ownerWindow.innerWidth - rect.width - VIEWPORT_PADDING);
      const maxY = Math.max(VIEWPORT_PADDING, props.ownerWindow.innerHeight - rect.height - VIEWPORT_PADDING);
      nextX = Math.min(maxX, Math.max(VIEWPORT_PADDING, rect.left + dx));
      nextY = Math.min(maxY, Math.max(VIEWPORT_PADDING, rect.top + dy));

      if (!frame) frame = props.ownerWindow.requestAnimationFrame(paint);
    };

    const finish = (commit: boolean) => {
      if (frame) props.ownerWindow.cancelAnimationFrame(frame);
      frame = 0;
      if (dragging && commit) setDetachedMotionPosition({ x: nextX, y: nextY });
      surface.style.transform = originalTransform;
      surface.style.willChange = originalWillChange;
      setMotionSuspended(false);
      props.ownerWindow.removeEventListener("pointermove", move);
      props.ownerWindow.removeEventListener("pointerup", end);
      props.ownerWindow.removeEventListener("pointercancel", end);
      cancelMotionDrag = null;
    };

    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      suppressMotionClick = dragging;
      finish(next.type === "pointerup");
    };

    cancelMotionDrag = () => finish(false);
    props.ownerWindow.addEventListener("pointermove", move);
    props.ownerWindow.addEventListener("pointerup", end);
    props.ownerWindow.addEventListener("pointercancel", end);
  };

  const updateMenuAlign = () => {
    const anchorRect = guideMenuElement?.getBoundingClientRect();

    if (!anchorRect) return;
    const rightAlignedLeft = anchorRect.right - GUIDE_MENU_WIDTH;
    const leftAlignedRight = anchorRect.left + GUIDE_MENU_WIDTH;

    if (rightAlignedLeft < VIEWPORT_PADDING) { setMenuAlign("left");

 return; }

    if (leftAlignedRight > props.ownerWindow.innerWidth - VIEWPORT_PADDING) { setMenuAlign("right");

 return; }

    setMenuAlign("right");
  };

  const pluginMenuIdealWidth = (tool: ToolContribution) => {
    const longest = (tool.menu?.items ?? []).reduce((length, item) => {
      const shortcut = props.model.state.settings.shortcutsEnabled && item.shortcut
        ? item.shortcut.length + 2
        : 0;

      return Math.max(length, item.label.length + shortcut);
    }, 0);

    return Math.min(
      TOOL_MENU_MAX_WIDTH,
      Math.max(
        TOOL_MENU_MIN_WIDTH,
        Math.ceil(longest * TOOL_MENU_CHARACTER_WIDTH + TOOL_MENU_INLINE_CHROME),
      ),
    );
  };

  const pluginMenuGeometry = (tool: ToolContribution) => {
    position();
    viewportRevision();
    const anchor = pluginMenuAnchorElement?.getBoundingClientRect();
    const viewportWidth = props.ownerWindow.innerWidth || TOOL_MENU_MIN_WIDTH + VIEWPORT_PADDING * 2;
    const height = viewportHeight();

    const width = Math.min(
      pluginMenuIdealWidth(tool),
      Math.max(0, viewportWidth - VIEWPORT_PADDING * 2),
    );

    if (!anchor) {
      return {
        side: nearBottom() ? "top" as const : "bottom" as const,
        left: 0,
        width,
        maxHeight: Math.max(0, height - VIEWPORT_PADDING * 2),
      };
    }

    const itemCount = tool.menu?.items.length ?? 0;
    const idealHeight = itemCount * TOOL_MENU_ITEM_HEIGHT + TOOL_MENU_CHROME_HEIGHT;

    const below = Math.max(
      0,
      height - anchor.bottom - VIEWPORT_PADDING - TOOL_MENU_GAP,
    );

    const above = Math.max(
      0,
      anchor.top - VIEWPORT_PADDING - TOOL_MENU_GAP,
    );

    const side = below >= idealHeight || below >= above ? "bottom" as const : "top" as const;
    const maxHeight = side === "bottom" ? below : above;
    const idealViewportLeft = anchor.right - width;

    const maxViewportLeft = Math.max(
      VIEWPORT_PADDING,
      viewportWidth - VIEWPORT_PADDING - width,
    );

    const viewportLeft = Math.min(
      maxViewportLeft,
      Math.max(VIEWPORT_PADDING, idealViewportLeft),
    );

    return {
      side,
      left: viewportLeft - anchor.left,
      width,
      maxHeight,
    };
  };

  const togglePluginMenu = (toolId: string, anchor: HTMLElement) => {
    if (pluginMenuOpenId() === toolId) {
      setPluginMenuOpenId(null);
      pluginMenuAnchorElement = undefined;

      return;
    }

    pluginMenuAnchorElement = anchor;
    setPluginMenuOpenId(toolId);
  };

  const onToolbarPointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (event.button !== 0) return;
    // SAFETY: props.ownerWindow owns the event target and therefore its Element constructor.
    const ElementConstructor = (props.ownerWindow as Window & typeof globalThis).Element;
    const target = event.target;

    if (target instanceof ElementConstructor && target.closest(TOOLBAR_DRAG_IGNORE_SELECTOR)) return;
    const root = props.ownerWindow.document.documentElement;

    if (previousUserSelect === null) {
      previousUserSelect = root.style.userSelect;
      root.style.setProperty("user-select", "none", "important");
    }

    const startX = event.clientX;
    const startY = event.clientY;
    cancelActiveDrag?.();
    const origin = position();
    const surface = event.currentTarget;
    const rect = surface.getBoundingClientRect();
    const previousTransform = surface.style.transform;
    const previousWillChange = surface.style.willChange;
    const attachedMotion = detachedMotionPosition() ? null : motionSurfaceElement;
    const previousMotionTransform = attachedMotion?.style.transform ?? "";
    let active = false;
    let didDrag = false;
    let dragFrame = 0;
    let nextPosition = origin;
    const pointerId = event.pointerId;

    // Drag the painted surface on the compositor. Commit reactive position and
    // persistence only once, on release; nearby previews must not rerender for
    // every pointer event.
    const paint = () => {
      dragFrame = 0;
      const delta = `translate3d(${nextPosition.x - origin.x}px, ${nextPosition.y - origin.y}px, 0)`;

      surface.style.transform = delta;

      if (attachedMotion) attachedMotion.style.transform = delta;
    };

    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const dx = next.clientX - startX;
      const dy = next.clientY - startY;

      if (!active) {
        active = Math.abs(dx) > TOOLBAR_DRAG_SLOP || Math.abs(dy) > TOOLBAR_DRAG_SLOP;

        if (!active) return;
        setGuideMenuOpen(false);
        setPluginMenuOpenId(null);
        pluginMenuAnchorElement = undefined;
        surface.style.willChange = "transform";
        if (attachedMotion) attachedMotion.style.willChange = "transform";
        setMotionSuspended(true);

        if (props.model.current.settingsOpen) props.model.setTransient({ settingsOpen: false });
      }

      didDrag = true;
      nextPosition = constrainToolbarPosition(
        props.ownerWindow,
        { x: origin.x + dx, y: origin.y + dy },
        { width: rect.width, height: rect.height },
        { width: props.ownerWindow.innerWidth, height: props.ownerWindow.innerHeight },
      );

      if (!dragFrame) dragFrame = props.ownerWindow.requestAnimationFrame(paint);
    };

    const finish = (commit: boolean) => {
      if (dragFrame) props.ownerWindow.cancelAnimationFrame(dragFrame);
      dragFrame = 0;

      surface.style.transform = previousTransform;
      surface.style.willChange = previousWillChange;
      if (attachedMotion) {
        attachedMotion.style.transform = previousMotionTransform;
        attachedMotion.style.willChange = "";
      }

      // Clear the transient transform BEFORE the Solid position commit. The
      // attached player measures the toolbar rect and must never see both.
      if (didDrag && commit) {
        setPosition(nextPosition);
        props.onPositionChange?.(nextPosition);
      }

      setMotionSuspended(false);

      if (previousUserSelect !== null) {
        root.style.userSelect = previousUserSelect;
        previousUserSelect = null;
      }

      props.ownerWindow.removeEventListener("pointermove", move);
      props.ownerWindow.removeEventListener("pointerup", end);
      props.ownerWindow.removeEventListener("pointercancel", end);
      cancelActiveDrag = null;
    };

    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      suppressClick = didDrag;
      finish(next.type === "pointerup");
    };

    cancelActiveDrag = () => finish(false);
    props.ownerWindow.addEventListener("pointermove", move);
    props.ownerWindow.addEventListener("pointerup", end);
    props.ownerWindow.addEventListener("pointercancel", end);
  };

  const selectGuideOrientation = (orientation: "vertical" | "horizontal") => {
    props.model.setEnabled(true);

    if (props.model.current.toolMode !== "guides") props.model.toggleToolMode("guides");
    props.model.setGuideOrientation(orientation, true);
    setGuideMenuOpen(false);
  };

  const toggleCompact = () => {
    const next = !compact();

    if (next) {
      setGuideMenuOpen(false);
      setPluginMenuOpenId(null);
    }

    if (compactMotionTimer) props.ownerWindow.clearTimeout(compactMotionTimer);

    if (modeStageElement) modeStageElement.dataset.compactMotion = "true";
    setCompact(next);
    compactMotionTimer = props.ownerWindow.setTimeout(() => {
      compactMotionTimer = 0;

      if (modeStageElement) delete modeStageElement.dataset.compactMotion;
      setViewportRevision((value) => value + 1);
    }, 170);
  };


  const markModeMotion = () => {
    if (modeMotionTimer) props.ownerWindow.clearTimeout(modeMotionTimer);

    if (modeStageElement) modeStageElement.dataset.modeMotion = "true";
    modeMotionTimer = props.ownerWindow.setTimeout(() => {
      modeMotionTimer = 0;

      if (modeStageElement) delete modeStageElement.dataset.modeMotion;
    }, 170);
  };

  const selectToolbarMode = () => {
    const edit = editModeTool();

    if (!edit?.active?.()) return;
    setPluginMenuOpenId(null);
    markModeMotion();
    props.onPluginTool?.(edit);
  };

  const editToolbarMode = () => {
    const edit = editModeTool();

    if (!edit || edit.disabled?.()) return;
    setGuideMenuOpen(false);
    setPluginMenuOpenId(null);
    markModeMotion();
    props.onPluginTool?.(edit);
  };

  const buttonProps = (id: string) => ({
    shortcutsEnabled: props.model.state.settings.shortcutsEnabled,
    tooltipVisible: tooltipsEnabled() && tooltip.visibleTooltipId() === id,
    tooltipInstant: tooltip.tooltipInstant(),
    tooltipSide: tooltipSide(),
    onTooltipEnter: tooltip.onTooltipEnter,
    onTooltipLeave: tooltip.onTooltipLeave,
  });

  const renderPluginMenu = (tool: ToolContribution) => (
    <Show when={pluginMenuOpenId() === tool.id}>
      <div
        data-mesurer-tool-menu={tool.id}
        data-mesurer-menu-side={pluginMenuGeometry(tool).side}
        class={`mesurer-menu-surface msr:absolute msr:z-[70] msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-1 msr:outline-none msr:flex msr:flex-col msr:gap-px msr:overflow-x-hidden msr:overflow-y-auto ${pluginMenuGeometry(tool).side === "top" ? "msr:bottom-full msr:mb-2" : "msr:top-full msr:mt-2"}`}
        style={{
          left: `${pluginMenuGeometry(tool).left}px`,
          right: "auto",
          width: `${pluginMenuGeometry(tool).width}px`,
          "max-height": `${pluginMenuGeometry(tool).maxHeight}px`,
        }}
        role="menu"
        aria-label={tool.menu?.label ?? `${tool.label} options`}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          setPluginMenuOpenId(null);
        }}
      >
        <For each={tool.menu?.items ?? []}>{(item) => (
          <button
            type="button"
            role={item.checked ? "menuitemcheckbox" : "menuitem"}
            aria-checked={item.checked ? (item.checked() ? "true" : "false") : undefined}
            data-mesurer-tool-menu-item={item.id}
            disabled={item.disabled?.() ?? false}
            class="msr:flex msr:h-7 msr:w-full msr:min-w-0 msr:shrink-0 msr:items-center msr:gap-2 msr:overflow-hidden msr:rounded-md msr:px-2 msr:text-left msr:text-[12px] msr:text-ink-700 msr:outline-none msr:whitespace-nowrap msr:hover:bg-[#0d99ff] msr:hover:text-white msr:focus-visible:bg-[#0d99ff] msr:focus-visible:text-white msr:disabled:opacity-40"
            onClick={() => {
              props.onPluginToolMenuItem?.(tool, item);
              setPluginMenuOpenId(null);
            }}
          >
            <span class="msr:flex msr:w-3 msr:shrink-0 msr:justify-center">
              <CheckIcon size={12} class={item.checked?.() ? "msr:opacity-100" : "msr:opacity-0"} />
            </span>
            <span class="msr:min-w-0 msr:flex-1 msr:overflow-hidden msr:text-ellipsis msr:whitespace-nowrap">{item.label}</span>
            <Show when={props.model.state.settings.shortcutsEnabled && item.shortcut}><span class="msr:shrink-0 msr:text-[10px] msr:opacity-60">{item.shortcut}</span></Show>
          </button>
        )}</For>
      </div>
    </Show>
  );


  const renderPluginTool = (tool: ToolContribution, pinned = false) => (
    <CompactItem visible={visibleInToolbar(tool.active?.() ?? false, pinned)}>
      <Show
        when={(tool.menu?.items.length ?? 0) > 0}
        fallback={
          <ToolbarButton
            id={`plugin:${tool.id}`}
            toolId={tool.id}
            active={tool.active?.() ?? false}
            disabled={tool.disabled?.() ?? false}
            label={tool.label}
            shortcut={tool.shortcut}
            onClick={() => props.onPluginTool?.(tool)}
            {...buttonProps(`plugin:${tool.id}`)}
          >
            <PluginIcon tool={tool} />
          </ToolbarButton>
        }
      >
        <div
          data-mesurer-plugin-menu-root="true"
          data-mesurer-tool-menu-root={tool.id}
          class="msr:relative msr:flex msr:items-stretch"
        >
          <ToolbarButton
            id={`plugin:${tool.id}`}
            toolId={tool.id}
            active={tool.active?.() ?? false}
            disabled={tool.disabled?.() ?? false}
            label={tool.label}
            shortcut={tool.shortcut}
            onClick={() => props.onPluginTool?.(tool)}
            {...buttonProps(`plugin:${tool.id}`)}
          >
            <PluginIcon tool={tool} />
          </ToolbarButton>
          <button
            type="button"
            data-mesurer-tool-menu-trigger={tool.id}
            aria-label={`${tool.label} options`}
            aria-expanded={pluginMenuOpenId() === tool.id ? "true" : "false"}
            class={`msr:relative msr:flex msr:h-8 msr:w-4 msr:items-center msr:justify-center msr:rounded-[6px] msr:outline-none msr:hover:bg-black/10 ${pluginMenuOpenId() === tool.id ? "msr:bg-black/10 msr:text-black" : "msr:text-black"}`}
            onMouseEnter={() => tooltip.onTooltipEnter(`plugin-menu:${tool.id}`)}
            onMouseLeave={tooltip.onTooltipLeave}
            onClick={(event) => togglePluginMenu(
              tool.id,
              event.currentTarget.parentElement ?? event.currentTarget,
            )}
          >
            <CaretDownIcon size={8} />
            <Tooltip
              label={`${tool.label} options`}
              visible={tooltipsEnabled() && tooltip.visibleTooltipId() === `plugin-menu:${tool.id}`}
              instant={tooltip.tooltipInstant()}
              side={tooltipSide()}
            />
          </button>
          {renderPluginMenu(tool)}
        </div>
      </Show>
    </CompactItem>
  );

  onSettled(() => {
    refreshColorPickerCapability();
    const handleCapabilityRefresh = () => refreshColorPickerCapability();

    const handlePointerDown = (event: PointerEvent) => {
      const path = event.composedPath();

      if (guideMenuOpen() && guideMenuElement && !path.includes(guideMenuElement)) setGuideMenuOpen(false);

      const insidePluginMenu = path.some((entry) =>
        entry instanceof Element
        && entry.getAttribute("data-mesurer-plugin-menu-root") === "true");

      if (pluginMenuOpenId() && !insidePluginMenu) setPluginMenuOpenId(null);

      if (props.model.current.settingsOpen && settingsElement && !path.includes(settingsElement)) props.model.setTransient({ settingsOpen: false });
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !pluginMenuOpenId()) return;
      event.preventDefault();
      event.stopPropagation();
      setPluginMenuOpenId(null);
    };

    const resize = () => {
      if (guideMenuOpen()) updateMenuAlign();
      setViewportRevision((value) => value + 1);
    };

    const keyboardTarget = props.ownerWindow.document;
    props.ownerWindow.addEventListener("pointerdown", handlePointerDown);
    props.ownerWindow.addEventListener("focus", handleCapabilityRefresh);
    props.ownerWindow.addEventListener("pageshow", handleCapabilityRefresh);
    props.ownerWindow.document.addEventListener("visibilitychange", handleCapabilityRefresh);
    keyboardTarget.addEventListener("keydown", handleKeyDown, true);
    props.ownerWindow.addEventListener("resize", resize);
    toolbarElement?.addEventListener("click", handleClickCapture, true);

    return () => {
      colorPickerCapabilityRevision += 1;

      if (colorPickerConfirmTimer) {
        colorPickerOwnerWindow().clearTimeout(colorPickerConfirmTimer);
        colorPickerConfirmTimer = 0;
      }

      if (compactMotionTimer) {
        props.ownerWindow.clearTimeout(compactMotionTimer);
        compactMotionTimer = 0;
      }

      if (modeMotionTimer) {
        props.ownerWindow.clearTimeout(modeMotionTimer);
        modeMotionTimer = 0;
      }

      props.ownerWindow.removeEventListener("pointerdown", handlePointerDown);
      props.ownerWindow.removeEventListener("focus", handleCapabilityRefresh);
      props.ownerWindow.removeEventListener("pageshow", handleCapabilityRefresh);
      props.ownerWindow.document.removeEventListener("visibilitychange", handleCapabilityRefresh);
      keyboardTarget.removeEventListener("keydown", handleKeyDown, true);
      props.ownerWindow.removeEventListener("resize", resize);
      toolbarElement?.removeEventListener("click", handleClickCapture, true);

      cancelActiveDrag?.();
      cancelMotionDrag?.();

      if (previousUserSelect !== null) props.ownerWindow.document.documentElement.style.userSelect = previousUserSelect;
    };
  });

  onSettled(() => {
    const stage = modeStageElement;
    const selectPanel = selectModePanelElement;
    const editPanel = editModePanelElement;

    if (!stage || !selectPanel || !editPanel) return;

    const syncWidths = () => {
      stage.style.setProperty("--msr-select-mode-w", `${selectPanel.offsetWidth}px`);
      stage.style.setProperty("--msr-edit-mode-w", `${editPanel.offsetWidth}px`);
    };

    syncWidths();

    // SAFETY: ownerWindow is the Window instance that owns this toolbar's document and browser APIs.
    const Resize = (props.ownerWindow as Window & typeof globalThis).ResizeObserver;

    const observer = Resize ? new Resize(syncWidths) : null;

    observer?.observe(selectPanel);
    observer?.observe(editPanel);

    const frame = props.ownerWindow.requestAnimationFrame(() => {
      stage.dataset.ready = "true";
      syncWidths();
    });

    return () => {
      props.ownerWindow.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  });

  return (
    <>
      {(() => {
        const motionElement = visibleMotionElement();

        if (!motionElement) return null;

        const geometry = motionSurfaceGeometry();

        return (
          <div
            ref={(element) => { motionSurfaceElement = element; }}
            data-mesurer-motion-surface="true"
            data-mesurer-motion-detached={detachedMotionPosition() ? "true" : "false"}
            onPointerDownCapture={onMotionPointerDown}
            onClickCapture={(event) => {
              if (!suppressMotionClick) return;
              suppressMotionClick = false;
              event.preventDefault();
              event.stopPropagation();
            }}
            data-mesurer-inspector-ui="true"
            class="msr:pointer-events-auto msr:absolute msr:z-[80] msr:overflow-visible"
            style={{
              left: `${geometry.left}px`,
              top: geometry.top === null ? "auto" : `${geometry.top}px`,
              bottom: geometry.bottom === null ? "auto" : `${geometry.bottom}px`,
              width: `${geometry.width}px`,
              "max-height": `${Math.max(0, geometry.maxHeight)}px`,
            }}
          >
            <MotionPlayer
              element={motionElement}
              ownerWindow={motionElement.ownerDocument.defaultView ?? props.ownerWindow}
              suspended={motionSuspended}
            />
            {detachedMotionPosition() && <button
              type="button"
              data-mesurer-motion-reattach="true"
              aria-label="Attach Motion preview to toolbar"
              title="Attach to toolbar"
              class="msr:absolute msr:right-3 msr:top-3 msr:z-[3] msr:rounded msr:bg-white/85 msr:px-1.5 msr:py-0.5 msr:text-[10px] msr:text-ink-700 msr:hover:bg-white"
              onClick={(event) => { event.stopPropagation(); setDetachedMotionPosition(null); }}
            >↗</button>}
          </div>
        );
      })()}

      <div
      ref={(element) => { toolbarElement = element; }}
      data-mesurer-toolbar="true"
      data-mesurer-toolbar-compact={compact() ? "true" : "false"}
      data-mesurer-toolbar-mode={toolbarMode()}
      data-mesurer-inspector-ui="true"
      class={`mesurer-toolbar-surface msr:pointer-events-auto msr:absolute msr:flex msr:items-stretch msr:rounded-[12px] msr:bg-[#fff] msr:outline msr:outline-transparent ${toolbarMenuOpen() ? "msr:z-[110]" : "msr:z-[90]"}`}
      style={{ left: `${position().x}px`, top: `${position().y}px` }}
      onPointerDown={(event) => { event.stopPropagation(); props.model.setTransient({ toolbarActive: true }); onToolbarPointerDown(event); }}
      onClick={(event) => event.stopPropagation()}
      onMouseEnter={refreshColorPickerCapability}
      onMouseLeave={tooltip.onTooltipContainerLeave}
    >
      <ToolbarModeSwitch
        value={toolbarMode()}
        editDisabled={!editModeTool() || (editModeTool()?.disabled?.() ?? false)}
        editToolId={editModeTool()?.id}
        editOptionsAvailable={(editModeTool()?.menu?.items.length ?? 0) > 0}
        editOptionsOpen={pluginMenuOpenId() === editModeTool()?.id}
        editOptions={editModeTool() ? renderPluginMenu(editModeTool()!) : null}
        shortcutsEnabled={props.model.state.settings.shortcutsEnabled}
        tooltipVisibleId={tooltipsEnabled() ? tooltip.visibleTooltipId() : null}
        tooltipInstant={tooltip.tooltipInstant()}
        tooltipSide={tooltipSide()}
        onTooltipEnter={tooltip.onTooltipEnter}
        onTooltipLeave={tooltip.onTooltipLeave}
        onSelect={selectToolbarMode}
        onEdit={editToolbarMode}
        onEditOptions={(anchor) => {
          const edit = editModeTool();

          if (!edit || edit.disabled?.()) return;
          togglePluginMenu(edit.id, anchor);
        }}
      />

      <ToolbarDivider marker="mode" />

      <div
        ref={(element) => { modeStageElement = element; }}
        class="mesurer-toolbar-mode-stage"
        data-mode={toolbarMode()}
      >
        <div class="mesurer-toolbar-mode-track">
          <div
            class="mesurer-toolbar-mode-slot"
            data-mode="select"
            data-open={toolbarMode() === "select" ? "true" : "false"}
            aria-hidden={toolbarMode() === "select" ? undefined : "true"}
            inert={toolbarMode() === "select" ? undefined : true}
          >
            <div ref={(element) => { selectModePanelElement = element; }} class="mesurer-toolbar-mode-panel">
              <div role="group" aria-label="Select tools" class="msr:flex msr:items-stretch msr:px-0.5 msr:py-1">
                <CompactItem visible={visibleInToolbar(selectActive())}>
                  <ToolbarButton id="select" builtin="select" active={selectActive()} label="Select" shortcut="S" onClick={() => props.onBuiltinAction("select")} {...buttonProps("select")}><CursorIcon size={20} /></ToolbarButton>
                </CompactItem>
                <CompactItem visible={visibleInToolbar(xrayActive())}>
                  <ToolbarButton id="xray" builtin="xray" active={xrayActive()} label="X-ray" shortcut="X" onClick={() => props.onBuiltinAction("xray")} {...buttonProps("xray")}><XrayIcon size={20} /></ToolbarButton>
                </CompactItem>
                <Show when={colorPickerSupported()}>
                  <CompactItem visible={visibleInToolbar(colorPickerActive())}>
                    <ToolbarButton id="color-picker" builtin="color-picker" active={colorPickerActive()} disabled={builtinDisabled("color-picker")} label="Color picker" shortcut="P" onClick={() => props.onBuiltinAction("color-picker")} {...buttonProps("color-picker")}><ColorPickerIcon size={20} /></ToolbarButton>
                  </CompactItem>
                </Show>
                <CompactItem visible={visibleInToolbar(typographyActive())}>
                  <ToolbarButton id="text-inspector" builtin="text-inspector" active={typographyActive()} disabled={builtinDisabled("text-inspector")} label="Typography" shortcut="A" onClick={() => props.onBuiltinAction("text-inspector")} {...buttonProps("text-inspector")}><TextInspectorIcon size={20} /></ToolbarButton>
                </CompactItem>
              </div>

              <Show when={selectPluginTools().length > 0}>
                <ToolbarDivider marker="select-plugins" />
                <div role="group" aria-label="Select plugin tools" class="msr:flex msr:items-stretch msr:px-0.5 msr:py-1">
                  <For each={selectPluginTools()}>{(tool) => renderPluginTool(tool, tool.compactPinned ?? false)}</For>
                </div>
              </Show>
            </div>
          </div>

          <div
            class="mesurer-toolbar-mode-slot"
            data-mode="edit"
            data-open={toolbarMode() === "edit" ? "true" : "false"}
            aria-hidden={toolbarMode() === "edit" ? undefined : "true"}
            inert={toolbarMode() === "edit" ? undefined : true}
          >
            <div ref={(element) => { editModePanelElement = element; }} class="mesurer-toolbar-mode-panel">
              <Show when={editPluginTools().length > 0}>
                <div role="group" aria-label="Edit tools" class="msr:flex msr:items-stretch msr:px-0.5 msr:py-1">
                  <For each={editPluginTools()}>{(tool) => renderPluginTool(tool)}</For>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </div>

      <div role="group" aria-label="Shared guide tools" class="msr:flex msr:items-stretch msr:py-1">
        <CompactItem visible={visibleInToolbar(rulersActive(), true)}>
          <ToolbarButton id="rulers" builtin="rulers" active={rulersActive()} label="Rulers" shortcut="R" onClick={() => props.onBuiltinAction("rulers")} {...buttonProps("rulers")}><RulersIcon size={20} /></ToolbarButton>
        </CompactItem>
        <CompactItem visible={visibleInToolbar(guidesActive(), true)}>
          <ToolbarButton id="guides" builtin="guides" active={guidesActive()} disabled={builtinDisabled("guides")} label="Guides" shortcut="G" onClick={() => props.onBuiltinAction("guides")} {...buttonProps("guides")}><RulerIcon size={20} class={props.model.state.guideOrientation === "vertical" ? "msr:rotate-[135deg]" : "msr:rotate-[45deg]"} /></ToolbarButton>
          <div data-mesurer-builtin="guides-menu" ref={(element) => { guideMenuElement = element; }} class="msr:group msr:relative msr:-ml-1 msr:flex msr:items-stretch" onMouseEnter={() => tooltip.onTooltipEnter("guide-menu")} onMouseLeave={tooltip.onTooltipLeave}>
            <button
              type="button"
              aria-label="Guide orientation menu"
              aria-haspopup="menu"
              aria-expanded={guideMenuOpen() ? "true" : "false"}
              disabled={builtinDisabled("guides")}
              class={`msr:flex msr:h-8 msr:w-4 msr:items-center msr:justify-center msr:rounded-[6px] msr:outline-none ${builtinDisabled("guides") ? "msr:cursor-default msr:text-black/30" : "msr:hover:bg-black/10"} ${guideMenuOpen() ? "msr:bg-black/10 msr:text-black" : "msr:text-black"}`}
              onClick={() => { setGuideMenuOpen((open) => { if (!open) { setActiveMenuIndex(props.model.state.guideOrientation === "horizontal" ? 0 : 1); updateMenuAlign(); }

 return !open; }); }}
            ><CaretDownIcon size={8} /></button>
            <Tooltip
              label="Orientation Guide"
              visible={tooltipsEnabled() && tooltip.visibleTooltipId() === "guide-menu"}
              instant={tooltip.tooltipInstant()}
              side={tooltipSide()}
            />
            <Show when={guideMenuOpen()}>
              <div
                class={`mesurer-menu-surface msr:absolute msr:z-[70] msr:w-44 msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-1 msr:outline-none msr:focus:outline-none msr:flex msr:flex-col msr:gap-px ${guideMenuSide() === "bottom" ? "msr:top-full msr:mt-2" : "msr:bottom-full msr:mb-2"} ${menuAlign() === "left" ? "msr:left-0" : "msr:right-0"}`}
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
        </CompactItem>
      </div>

      <Show when={alwaysPluginTools().length > 0}>
        <ToolbarDivider visible={alwaysPluginDividerVisible()} marker="plugins" />
        <div role="group" aria-label="Always available tools" class="msr:flex msr:items-stretch msr:px-0.5 msr:py-1">
          <For each={alwaysPluginTools()}>{(tool) => renderPluginTool(tool, tool.toolbarMode === "always")}</For>
        </div>
      </Show>

      <div class="msr:flex msr:items-stretch msr:px-0.5 msr:py-1">
        <CompactItem visible={visibleInToolbar(settingsActive())}>
          <div data-mesurer-builtin="settings" ref={(element) => { settingsElement = element; }} class="msr:relative msr:flex">
            <ToolbarButton id="settings" builtin="settings" active={settingsActive()} label="Settings" shortcut="⌘/Ctrl+," onClick={() => props.onBuiltinAction("settings")} {...buttonProps("settings")}><GearIcon size={20} /></ToolbarButton>
            <Show when={props.model.state.settingsOpen}>
              <div
                class={`mesurer-menu-surface msr:absolute msr:z-[70] msr:box-border msr:w-[272px] msr:max-w-[calc(100vw-16px)] msr:max-h-[calc(100vh-16px)] msr:overflow-y-auto msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-3 ${settingsMenuSide() === "bottom" ? "msr:top-full msr:mt-2" : "msr:bottom-full msr:mb-2"}`}
                style={{ left: `${settingsMenuLeft()}px`, right: "auto" }}
                data-mesurer-inspector-ui="true"
                role="dialog"
                aria-label="Settings"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <SettingsPanel model={props.model} ownerWindow={props.ownerWindow} onResetSettings={props.onResetSettings} onClearWorkspace={props.onClearWorkspace} selectionSpacingStyle={props.selectionSpacingStyle} onSelectionSpacingStyleChange={props.onSelectionSpacingStyleChange} />
              </div>
            </Show>
          </div>
        </CompactItem>
      </div>

      <ToolbarDivider visible={compactDividerVisible()} marker="compact" />
      <div class="msr:flex msr:items-center msr:p-1">
        <button
          type="button"
          data-mesurer-toolbar-compact-toggle="true"
          aria-label={compact() ? "Expand toolbar" : "Compact toolbar"}
          aria-pressed={compact() ? "true" : "false"}
          class="msr:flex msr:size-7 msr:select-none msr:items-center msr:justify-center msr:rounded-[7px] msr:text-black msr:outline-none msr:hover:bg-black/4"
          onClick={toggleCompact}
        >
          <CaretDownIcon size={10} class={compact() ? "msr:-rotate-90" : "msr:rotate-90"} />
        </button>
      </div>
    </div>
    </>
  );
}
