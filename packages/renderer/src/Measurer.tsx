import { Show, createEffect, createMemo, createSignal, onSettled, untrack } from "solid-js";
import { Portal } from "@solidjs/web";
import type { ToolContribution } from "@jhomra21/mesurer-solid-core";
import { ColorPicker } from "./components/ColorPicker";
import { MeasurerOverlay } from "./components/MeasurerOverlay";
import { RulersOverlay } from "./components/RulersOverlay";
import { Toolbar } from "./components/Toolbar";
import type { ColorPickerFormat } from "./core/colors";
import { GUIDE_DRAG_HOLD_MS } from "./core/constants";
import { getDistanceOverlay, updateDistanceForResize } from "./core/distances";
import { getInspectMeasurement, updateMeasurementForResize } from "./core/dom";
import { isEditableKeyboardEvent, trySetPointerCapture } from "./core/events";
import { getRectFromPoints, getViewportSize } from "./core/geometry";
import { getGuideRect, getSnapGuidePosition } from "./core/guides";
import {
  getHoveredGuide,
  getOptionContainerLines,
  getOptionPairOverlay,
  getSelectedGuide,
} from "./core/option-measurements";
import {
  createLocalStoragePersistence,
  DEFAULT_GUIDE_STYLE,
  DEFAULT_RULER_SETTINGS,
  type GuideStyle,
  type MesurerPersistence,
  type MesurerPersistenceSnapshot,
  type MesurerStoredSettings,
  type PersistenceChangeSource,
  type RulerSettings,
} from "./core/persistence";
import {
  getElementsInRectCached,
  getSnappedClickTarget,
  getTargetElement,
  type SelectionEntriesCache,
} from "./core/selection";
import { getSelectedMeasurementHit } from "./core/selection-helpers";
import type { Guide, InspectMeasurement, Point, Rect } from "./core/types";
import { createId } from "./core/utils";
import {
  createMeasurerModel,
  type MeasurerModel,
  type MeasurerSettings,
} from "./model/create-measurer-model";
import {
  createMeasurerBuiltinController,
  type MeasurerBuiltinController,
} from "./runtime/builtin-actions";
import { ensureMeasurerStyles } from "./runtime/style-inject";
import { createTextInspector, type TextInspectorAPI } from "./runtime/text-inspector";
import { createXrayScope } from "./runtime/xray-scope";
import { MESURER_STYLES } from "./styles.generated";

export type MeasurerProps = {
  highlightColor?: string;
  guideColor?: string;
  hoverHighlightEnabled?: boolean;
  persistOnReload?: boolean;
  portalTarget?: HTMLElement | ShadowRoot;
  /** Host-page scope for page-facing visual effects such as X-ray. Defaults to document.body. */
  pageTarget?: HTMLElement | ShadowRoot;
  persistKey?: string;
  colorPickerFormats?: ColorPickerFormat[];
  colorPickerClickFormat?: ColorPickerFormat;
  snapEnabled?: boolean;
  snapGuidesEnabled?: boolean;
  selectNewGuideEnabled?: boolean;
  multiMeasureEnabled?: boolean;
  guideStyle?: Partial<GuideStyle>;
  rulerSettings?: Partial<RulerSettings>;
  persistence?: MesurerPersistence;
  onPersistenceError?: (error: unknown) => void;
  /** Internal composable-runtime contributions rendered by the canonical toolbar. */
  pluginTools?: ToolContribution[];
  onPluginTool?: (tool: ToolContribution) => void;
  onBuiltinController?: (controller: MeasurerBuiltinController | null) => void;
};

type Environment = {
  ownerDocument: Document;
  ownerWindow: Window;
  portalTarget: HTMLElement | ShadowRoot;
  portalMount: HTMLElement;
  ownedPortalMount: boolean;
};

let instanceCount = 0;
const TAB_ID_KEY = "mesurer:tab-id";
const SETTINGS_STORAGE_KEY = "mesurer-settings";
const LEGACY_STORAGE_KEY = "mesurer-state";

const getTabId = (ownerWindow: Window) => {
  try {
    const existing = ownerWindow.sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const id = ownerWindow.crypto.randomUUID();
    ownerWindow.sessionStorage.setItem(TAB_ID_KEY, id);
    return id;
  } catch {
    return "session";
  }
};

const sanitizeStoredSettings = (ownerWindow: Window, settings: MesurerStoredSettings): MesurerStoredSettings => {
  const supportsColor = (value: string | undefined) =>
    value !== undefined &&
    (ownerWindow as Window & { CSS?: { supports: (property: string, value: string) => boolean } }).CSS?.supports("color", value) === true;
  return {
    ...settings,
    ...(supportsColor(settings.highlightColor) ? {} : { highlightColor: undefined }),
    ...(supportsColor(settings.guideColor) ? {} : { guideColor: undefined }),
  };
};

const unionSelection = (items: InspectMeasurement[], origin: Rect | null): InspectMeasurement | null => {
  if (items.length <= 1) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const item of items) {
    left = Math.min(left, item.rect.left);
    top = Math.min(top, item.rect.top);
    right = Math.max(right, item.rect.left + item.rect.width);
    bottom = Math.max(bottom, item.rect.top + item.rect.height);
  }
  const rect = { left, top, width: right - left, height: bottom - top };
  const base = items[items.length - 1];
  return {
    ...base,
    id: `group-${items.map((item) => item.id).join("|")}`,
    label: `${items.length} elements`,
    rect,
    paddingRect: rect,
    marginRect: rect,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    elementRef: undefined,
    originRect: origin ?? undefined,
  };
};

function MeasurerClient(props: { model: MeasurerModel; env: Environment; input: MeasurerProps }) {
  const model = untrack(() => props.model);
  const env = untrack(() => props.env);
  const input = untrack(() => props.input);
  const { ownerDocument, ownerWindow } = env;
  const pageTarget = input.pageTarget ?? ownerDocument.body;
  const instanceId = ++instanceCount;
  const storageKey = input.persistKey ?? `mesurer-state:${getTabId(ownerWindow)}${instanceId === 1 ? "" : `:${instanceId}`}`;
  const selectionCache: SelectionEntriesCache = { key: "", entries: [], overlayNode: null, frame: -1 };
  let rootElement: HTMLDivElement | null = null;
  let textInspector: TextInspectorAPI | null = null;
  let activePersistence: MesurerPersistence | null = null;
  let persistenceReady = false;
  let persistTimer = 0;
  let hoverFrame = 0;
  let hoverPoint: Point | null = null;
  let shiftToggleElement: HTMLElement | null = null;
  let shiftDrag = false;
  let guideDragHoldTimer = 0;
  let guideDragHoldId: string | null = null;
  let scrollPosition = { x: ownerWindow.scrollX, y: ownerWindow.scrollY };
  const builtinController = createMeasurerBuiltinController({ model, ownerWindow });
  const xrayScope = createXrayScope({
    ownerDocument,
    target: input.pageTarget ?? ownerDocument.body,
    instanceId,
  });
  input.onBuiltinController?.(builtinController);

  const activeRect = createMemo(() => {
    const start = model.state.start, end = model.state.end;
    return start && end ? getRectFromPoints(start, end) : null;
  });
  const groupedSelection = createMemo(() => unionSelection(model.state.selectedMeasurements, model.state.selectionOriginRect));
  const displayedSelectedMeasurements = createMemo(() => groupedSelection()
    ? [groupedSelection()!]
    : model.state.selectedMeasurements.length
      ? model.state.selectedMeasurements
      : model.state.selectedMeasurement ? [model.state.selectedMeasurement] : []);
  const selectedGuide = createMemo(() => getSelectedGuide(model.state.guides, model.state.selectedGuideIds));
  const hoverGuide = createMemo(() => getHoveredGuide(model.state.hoverPointer, model.state.guides));
  const primarySelection = createMemo(() => groupedSelection() ?? model.state.selectedMeasurement ?? model.state.selectedMeasurements.at(-1) ?? null);
  const optionPairOverlay = createMemo(() => getOptionPairOverlay({
    document: ownerDocument,
    window: ownerWindow,
    altPressed: model.state.altPressed,
    primarySelectedMeasurement: primarySelection(),
    selectedGuide: selectedGuide(),
    hoverGuide: hoverGuide(),
    hoverElement: model.state.hoverElement,
    selectedElementRef: primarySelection()?.elementRef ?? null,
  }));
  const optionContainerLines = createMemo(() => getOptionContainerLines({
    document: ownerDocument,
    window: ownerWindow,
    altPressed: model.state.altPressed,
    primarySelectedMeasurement: primarySelection(),
    optionPairOverlay: optionPairOverlay(),
    selectedGuideIds: model.state.selectedGuideIds,
    selectedElement: primarySelection()?.elementRef ?? null,
    hoverElement: model.state.hoverElement,
  }));
  const guideDistanceOverlay = createMemo(() => {
    if (!model.state.altPressed || model.state.toolMode !== "guides") return null;
    const selected = selectedGuide(), hovered = hoverGuide();
    if (selected && hovered && selected.id !== hovered.id) {
      return getDistanceOverlay(getGuideRect(selected, ownerWindow), getGuideRect(hovered, ownerWindow), null, null, ownerWindow);
    }
    const preview = model.state.guidePreview;
    if (!preview) return null;
    const nearest = model.state.guides
      .filter((guide) => guide.orientation === preview.orientation)
      .sort((a, b) => Math.abs(a.position - preview.position) - Math.abs(b.position - preview.position))[0];
    if (!nearest) return null;
    return getDistanceOverlay(
      getGuideRect({ id: "preview", ...preview }, ownerWindow),
      getGuideRect(nearest, ownerWindow), null, null, ownerWindow,
    );
  });

  const updateHover = (point: Point) => {
    const target = getTargetElement(point, rootElement, ownerDocument, pageTarget);
    if (!target) {
      model.setHoverTarget(null, null);
      return;
    }
    const rect = target.getBoundingClientRect();
    model.setHoverTarget(target, model.current.settings.hoverHighlightEnabled
      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      : null);
  };

  const scheduleHover = (point: Point) => {
    hoverPoint = point;
    if (hoverFrame) return;
    hoverFrame = ownerWindow.requestAnimationFrame(() => {
      hoverFrame = 0;
      const latest = hoverPoint;
      if (!latest) return;
      if (model.current.toolMode === "select" && !model.current.draggingGuideId) updateHover(latest);
      model.setTransient({ hoverPointer: model.current.guides.length ? latest : null });
      if (model.current.toolMode === "guides" && !model.current.draggingGuideId) {
        model.setTransient({ guidePreview: {
          orientation: model.current.guideOrientation,
          position: getSnapGuidePosition({
            orientation: model.current.guideOrientation,
            point: latest,
            snapGuidesEnabled: model.current.settings.snapGuidesEnabled,
            overlayNode: rootElement,
            guides: model.current.guides,
            draggingGuideId: null,
            document: ownerDocument,
          }),
        }});
      }
    });
  };

  const clearGuideDragHold = () => {
    if (guideDragHoldTimer) ownerWindow.clearTimeout(guideDragHoldTimer);
    guideDragHoldTimer = 0;
    guideDragHoldId = null;
  };

  const scheduleGuideDragHold = (id: string) => {
    clearGuideDragHold();
    guideDragHoldId = id;
    guideDragHoldTimer = ownerWindow.setTimeout(() => {
      guideDragHoldTimer = 0;
      if (guideDragHoldId === id) model.setTransient({ draggingGuideId: id });
    }, GUIDE_DRAG_HOLD_MS);
  };

  const resetDrag = () => {
    model.setTransient({ start: null, end: null, isDragging: false, draggingGuideId: null, guidePreview: null });
    shiftToggleElement = null; shiftDrag = false; selectionCache.key = "";
    model.endAction();
  };

  const pointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (model.current.settingsOpen || !model.current.enabled || event.button !== 0) return;
    if (model.current.toolMode === "none") return;
    const point = { x: event.clientX, y: event.clientY };
    const commit = model.beginAction();

    if (model.current.altPressed && optionPairOverlay()) {
      event.preventDefault(); commit();
      model.addHeldDistance({ ...optionPairOverlay()!, id: createId() });
      model.endAction();
      return;
    }

    if (model.current.toolMode === "guides") {
      event.preventDefault(); commit();
      const id = createId();
      const position = getSnapGuidePosition({
        orientation: model.current.guideOrientation,
        point,
        snapGuidesEnabled: model.current.settings.snapGuidesEnabled,
        overlayNode: rootElement,
        guides: model.current.guides,
        draggingGuideId: null,
        document: ownerDocument,
      });
      model.addGuide({ id, orientation: model.current.guideOrientation, position });
      model.setSelectedGuideIds(model.current.settings.selectNewGuideEnabled ? [id] : []);
      model.setTransient({ guidePreview: null });
      scheduleGuideDragHold(id);
      trySetPointerCapture(event.currentTarget, event.pointerId);
      return;
    }

    if (model.current.selectedGuideIds.length > 0) {
      commit();
      model.setSelectedGuideIds([]);
    }

    shiftDrag = event.shiftKey;
    shiftToggleElement = event.shiftKey
      ? (getSelectedMeasurementHit({ point, selectedMeasurements: model.current.selectedMeasurements, overlayNode: rootElement, document: ownerDocument, exact: true })?.elementRef ?? null)
      : null;
    model.setTransient({ start: point, end: point, isDragging: false, selectionOriginRect: null });
    trySetPointerCapture(event.currentTarget, event.pointerId);
  };

  const pointerMove = (event: PointerEvent) => {
    if (!model.current.enabled || model.current.settingsOpen) return;
    const point = { x: event.clientX, y: event.clientY };
    if (event.altKey !== model.current.altPressed) model.setTransient({ altPressed: event.altKey });
    scheduleHover(point);

    if (model.current.draggingGuideId) {
      const guide = model.current.guides.find((item) => item.id === model.current.draggingGuideId);
      if (guide) {
        const position = getSnapGuidePosition({
          orientation: guide.orientation,
          point,
          snapGuidesEnabled: model.current.settings.snapGuidesEnabled,
          overlayNode: rootElement,
          guides: model.current.guides,
          draggingGuideId: guide.id,
          document: ownerDocument,
        });
        model.updateGuide(guide.id, { position });
      }
      return;
    }
    if (model.current.toolMode === "guides") return;
    const start = model.current.start;
    if (!start) return;
    const threshold = shiftDrag ? 12 : 4;
    const isDragging = model.current.isDragging || Math.abs(point.x - start.x) > threshold || Math.abs(point.y - start.y) > threshold;
    model.setTransient({ end: point, isDragging });
  };

  const pointerUp = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (!model.current.enabled) return;
    if (model.current.toolMode === "guides") {
      clearGuideDragHold();
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
      resetDrag();
      return;
    }
    if (model.current.toolMode !== "select") { resetDrag(); return; }
    const start = model.current.start;
    if (!start) { resetDrag(); return; }
    const point = { x: event.clientX, y: event.clientY };

    if (model.current.isDragging) {
      const rect = getRectFromPoints(start, point);
      const elements = getElementsInRectCached(rect, rootElement, selectionCache, ownerDocument, pageTarget);
      const next = elements.map((element) => ({ ...getInspectMeasurement(element, ownerWindow), originRect: rect }));
      let merged: InspectMeasurement[] = next;
      if (event.shiftKey) {
        const map = new Map<HTMLElement, InspectMeasurement>();
        for (const item of [...model.current.selectedMeasurements, ...next]) if (item.elementRef) map.set(item.elementRef, item);
        merged = [...map.values()];
      }
      model.checkpoint();
      model.setSelectedMeasurements(merged, merged.at(-1) ?? null);
      model.setTransient({ selectionOriginRect: rect });
      resetDrag();
      return;
    }

    const selectedHit = shiftToggleElement
      ? model.current.selectedMeasurements.find((item) => item.elementRef === shiftToggleElement) ?? null
      : getSelectedMeasurementHit({ point, selectedMeasurements: model.current.selectedMeasurements, overlayNode: rootElement, document: ownerDocument, exact: event.shiftKey });

    if ((event.shiftKey || !model.current.settings.hoverHighlightEnabled) && selectedHit) {
      model.checkpoint();
      const next = model.current.selectedMeasurements.filter((item) => item.elementRef !== selectedHit.elementRef);
      model.setSelectedMeasurements(next, next.at(-1) ?? null);
      resetDrag();
      return;
    }

    const target = event.shiftKey
      ? (getTargetElement(point, rootElement, ownerDocument, pageTarget) ??
        getSnappedClickTarget(point, rootElement, model.current.settings.snapEnabled, ownerDocument, pageTarget))
      : getSnappedClickTarget(point, rootElement, model.current.settings.snapEnabled, ownerDocument, pageTarget);
    if (target) {
      const measurement = getInspectMeasurement(target, ownerWindow);
      model.checkpoint();
      if (event.shiftKey || model.current.settings.multiMeasureEnabled) {
        const exists = model.current.selectedMeasurements.some((item) => item.elementRef === target);
        const next = exists
          ? model.current.selectedMeasurements.filter((item) => item.elementRef !== target)
          : [...model.current.selectedMeasurements, measurement];
        model.setSelectedMeasurements(next, next.at(-1) ?? null);
      } else {
        model.setSelectedMeasurements([measurement], measurement);
      }
    } else if (!event.shiftKey) {
      model.checkpoint(); model.setSelectedMeasurements([], null);
    }
    resetDrag();
  };

  const pointerLeave = () => {
    clearGuideDragHold();
    if (!model.current.draggingGuideId) resetDrag();
    model.setTransient({ guidePreview: null });
  };

  const guidePointerDown = (guide: Guide, event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (!model.current.enabled || event.button !== 0 || model.current.settingsOpen) return;
    event.preventDefault(); event.stopPropagation();
    model.checkpoint();
    if (event.shiftKey) {
      const next = model.current.selectedGuideIds.includes(guide.id)
        ? model.current.selectedGuideIds.filter((id) => id !== guide.id)
        : [...model.current.selectedGuideIds, guide.id];
      model.setSelectedGuideIds(next);
      return;
    }
    model.setSelectedGuideIds([guide.id]);
    model.setTransient({ draggingGuideId: guide.id });
    trySetPointerCapture(event.currentTarget, event.pointerId);
  };
  const guidePointerUp = (_guide: Guide, event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    event.stopPropagation();
    model.setTransient({ draggingGuideId: null });
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const snapGuide = (orientation: Guide["orientation"], position: number, id: string | null = null) =>
    getSnapGuidePosition({
      orientation,
      point: orientation === "vertical" ? { x: position, y: 0 } : { x: 0, y: position },
      snapGuidesEnabled: model.current.settings.snapGuidesEnabled,
      overlayNode: rootElement,
      guides: model.current.guides,
      draggingGuideId: id,
      document: ownerDocument,
    });
  const startGuideFromRuler = (orientation: Guide["orientation"], position: number) => {
    model.checkpoint();
    const id = createId();
    model.addGuide({ id, orientation, position: snapGuide(orientation, position) });
    model.setSelectedGuideIds([]);
    return id;
  };
  const moveGuideFromRuler = (id: string, position: number) => {
    const guide = model.current.guides.find((item) => item.id === id);
    if (guide) model.updateGuide(id, { position: snapGuide(guide.orientation, position, id) });
  };
  const finishGuideFromRuler = (id: string) => {
    if (model.current.settings.selectNewGuideEnabled) model.setSelectedGuideIds([id]);
  };
  const cancelGuideFromRuler = (id: string) => model.setGuides(model.current.guides.filter((item) => item.id !== id));

  const clearWorkspace = () => {
    model.clearWorkspace();
    textInspector?.clear();
    activePersistence?.clearWorkspace();
  };

  createEffect(
    () => [model.state.toolMode, model.state.enabled] as const,
    ([mode, enabled]) => {
      if (!textInspector) return;
      if (mode === "text-inspector" && enabled) textInspector.enable();
      else textInspector.disable();
    },
  );

  createEffect(
    () => model.state.xrayVisible,
    (visible) => xrayScope.setVisible(visible),
  );

  createEffect(
    () => [
      model.state.settings.highlightColor, model.state.settings.guideColor,
      model.state.settings.hoverHighlightEnabled, model.state.settings.persistOnReload,
      model.state.settings.colorPickerClickFormat, model.state.settings.snapEnabled,
      model.state.settings.snapGuidesEnabled, model.state.settings.selectNewGuideEnabled,
      model.state.settings.multiMeasureEnabled, model.state.settings.colorPickerFormats.join("|"),
      JSON.stringify(model.state.settings.guideStyle), JSON.stringify(model.state.settings.rulerSettings),
    ],
    () => {
      if (!persistenceReady || !activePersistence) return;
      activePersistence.saveSettings(model.serializeSettings());
    },
  );

  createEffect(
    () => [
      model.state.enabled, model.state.toolMode, model.state.rulersVisible, model.state.xrayVisible,
      model.state.guideOrientation, model.state.settings.persistOnReload,
      model.state.guides.map((guide) => `${guide.id}:${guide.orientation}:${guide.position}`).join("|"),
      model.state.selectedGuideIds.join("|"), model.state.heldDistances.map((distance) => distance.id).join("|"),
      model.state.measurements.map((measurement) => measurement.id).join("|"), model.state.activeMeasurement?.id ?? "",
    ],
    () => {
      if (!persistenceReady || !activePersistence || !model.current.settings.persistOnReload) return;
      ownerWindow.clearTimeout(persistTimer);
      persistTimer = ownerWindow.setTimeout(() => activePersistence?.saveWorkspace(model.serializeWorkspace()), 250);
    },
  );

  onSettled(() => {
    ensureMeasurerStyles(MESURER_STYLES, env.portalTarget);
    textInspector = createTextInspector({ portalTarget: env.portalTarget });
    const persistence = input.persistence ?? createLocalStoragePersistence(
      ownerWindow, storageKey, SETTINGS_STORAGE_KEY, input.persistKey ? undefined : LEGACY_STORAGE_KEY,
    );
    activePersistence = persistence;
    persistence.setErrorHandler?.(input.onPersistenceError);
    const stored = persistence.load();
    if (stored?.settings) model.applyStoredSettings(sanitizeStoredSettings(ownerWindow, stored.settings));
    if ((model.current.settings.persistOnReload || input.persistOnReload) && stored?.workspace) model.applyStoredWorkspace(stored.workspace);
    persistenceReady = true;
    if (model.current.toolMode === "text-inspector" && model.current.enabled) textInspector.enable();

    const applyExternal = (snapshot: MesurerPersistenceSnapshot | null, source?: PersistenceChangeSource) => {
      if (!snapshot) return;
      if (source?.settings !== false) model.applyStoredSettings(sanitizeStoredSettings(ownerWindow, snapshot.settings));
      if (source?.workspace !== false && snapshot.workspace && model.current.settings.persistOnReload) model.applyStoredWorkspace(snapshot.workspace);
    };
    const unsubscribe = persistence.subscribe?.(applyExternal);

    const keydown = (event: KeyboardEvent) => {
      if (isEditableKeyboardEvent(event, ownerWindow)) return;
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (key === "escape") {
        if (model.current.settingsOpen) { model.setTransient({ settingsOpen: false }); return; }
        if (model.current.colorPickerActive) { model.setTransient({ colorPickerActive: false }); return; }
        if (model.current.toolMode === "text-inspector") textInspector?.clear();
        model.clearAll();
        return;
      }
      if (event.key === "Alt") { model.setTransient({ altPressed: true }); return; }
      if (mod && key === ",") { event.preventDefault(); void builtinController.run("settings"); return; }
      if (mod && key === "z") {
        event.preventDefault();
        if (model.current.toolMode === "text-inspector") {
          const handled = event.shiftKey ? textInspector?.redo() : textInspector?.undo();
          if (handled) return;
        }
        event.shiftKey ? model.redo() : model.undo();
        return;
      }
      if ((key === "delete" || key === "backspace") && model.current.selectedGuideIds.length) {
        event.preventDefault(); model.removeGuides(model.current.selectedGuideIds); return;
      }
      if (key === "m") { model.toggleEnabled(true); return; }
      if (key === "s") { void builtinController.run("select"); return; }
      if (key === "a") { void builtinController.run("text-inspector"); return; }
      if (key === "g") { void builtinController.run("guides"); return; }
      if (key === "p") { void builtinController.run("color-picker"); return; }
      if (key === "x") { void builtinController.run("xray"); return; }
      if (key === "r") { void builtinController.run("rulers"); return; }
      if (key === "h") { model.setGuideOrientation("horizontal", true); return; }
      if (key === "v") { model.setGuideOrientation("vertical", true); }
    };
    const keyup = (event: KeyboardEvent) => { if (event.key === "Alt") model.setTransient({ altPressed: false }); };
    ownerWindow.addEventListener("keydown", keydown);
    ownerWindow.addEventListener("keyup", keyup);

    let syncFrame = 0;
    const syncLive = () => {
      if (syncFrame) return;
      syncFrame = ownerWindow.requestAnimationFrame(() => {
        syncFrame = 0;
        const selected = model.current.selectedMeasurements
          .filter((item) => item.elementRef?.isConnected)
          .map((item) => ({ ...getInspectMeasurement(item.elementRef!, ownerWindow), id: item.id, originRect: item.originRect }));
        if (selected.length || model.current.selectedMeasurements.length) {
          const primaryId = model.current.selectedMeasurement?.id;
          model.setSelectedMeasurements(selected, selected.find((item) => item.id === primaryId) ?? selected.at(-1) ?? null);
        }
        const viewport = getViewportSize(ownerWindow);
        if (model.current.measurements.length) model.setMeasurements(model.current.measurements.map((item) => updateMeasurementForResize(item, viewport, ownerDocument)));
        if (model.current.activeMeasurement) model.setActiveMeasurement(updateMeasurementForResize(model.current.activeMeasurement, viewport, ownerDocument));
        if (model.current.heldDistances.length) model.setHeldDistances(model.current.heldDistances.map((item) => updateDistanceForResize(item, viewport, ownerDocument, ownerWindow)));
        const hover = model.current.hoverElement;
        if (hover?.isConnected && model.current.toolMode === "select") {
          const rect = hover.getBoundingClientRect();
          model.setHoverTarget(hover, model.current.settings.hoverHighlightEnabled ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null);
        }
      });
    };
    const scroll = () => {
      const next = { x: ownerWindow.scrollX, y: ownerWindow.scrollY };
      const dx = next.x - scrollPosition.x, dy = next.y - scrollPosition.y;
      scrollPosition = next;
      if (dx || dy) model.setGuides(model.current.guides.map((guide) => ({
        ...guide, position: guide.position - (guide.orientation === "vertical" ? dx : dy),
      })));
      syncLive();
    };
    ownerWindow.addEventListener("scroll", scroll, true);
    ownerWindow.addEventListener("resize", syncLive, true);

    const globalGuideMove = (event: PointerEvent) => {
      const id = model.current.draggingGuideId;
      if (!id) return;
      const guide = model.current.guides.find((item) => item.id === id);
      if (!guide) return;
      model.updateGuide(id, { position: snapGuide(guide.orientation, guide.orientation === "vertical" ? event.clientX : event.clientY, id) });
    };
    const globalGuideEnd = () => model.setTransient({ draggingGuideId: null });
    ownerWindow.addEventListener("pointermove", globalGuideMove, true);
    ownerWindow.addEventListener("pointerup", globalGuideEnd, true);
    ownerWindow.addEventListener("pointercancel", globalGuideEnd, true);

    return () => {
      ownerWindow.cancelAnimationFrame(syncFrame);
      ownerWindow.cancelAnimationFrame(hoverFrame);
      clearGuideDragHold();
      ownerWindow.clearTimeout(persistTimer);
      if (model.current.settings.persistOnReload) persistence.saveWorkspace(model.serializeWorkspace());
      unsubscribe?.();
      persistence.setErrorHandler?.(undefined);
      ownerWindow.removeEventListener("keydown", keydown);
      ownerWindow.removeEventListener("keyup", keyup);
      ownerWindow.removeEventListener("scroll", scroll, true);
      ownerWindow.removeEventListener("resize", syncLive, true);
      ownerWindow.removeEventListener("pointermove", globalGuideMove, true);
      ownerWindow.removeEventListener("pointerup", globalGuideEnd, true);
      ownerWindow.removeEventListener("pointercancel", globalGuideEnd, true);
      textInspector?.destroy(); textInspector = null;
      xrayScope.dispose();
      input.onBuiltinController?.(null);
    };
  });

  return (
    <Portal mount={env.portalMount}>
      <div ref={(element) => { rootElement = element; }} class="mesurer-solid-root" data-mesurer-root="true">
        <Show when={model.state.enabled && model.state.rulersVisible}>
          <RulersOverlay
            ownerWindow={ownerWindow}
            settings={model.state.settings.rulerSettings}
            interactive={!model.state.settingsOpen}
            forceVisible={model.state.settingsOpen}
            guides={model.state.guides}
            selectedGuideIds={model.state.selectedGuideIds}
            onStartGuide={startGuideFromRuler}
            onMoveGuide={moveGuideFromRuler}
            onFinishGuide={finishGuideFromRuler}
            onCancelGuide={cancelGuideFromRuler}
          />
        </Show>
        <MeasurerOverlay
          model={model}
          displayedSelectedMeasurements={displayedSelectedMeasurements()}
          activeRect={activeRect()}
          optionPairOverlay={optionPairOverlay()}
          guideDistanceOverlay={guideDistanceOverlay()}
          optionContainerLines={optionContainerLines()}
          hoverGuide={hoverGuide()}
          interactive={model.state.enabled && !model.state.settingsOpen}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerLeave={pointerLeave}
          onGuidePointerDown={guidePointerDown}
          onGuidePointerUp={guidePointerUp}
        />
        <ColorPicker model={model} ownerWindow={ownerWindow} />
        <Toolbar
          model={model}
          ownerWindow={ownerWindow}
          onBuiltinAction={(id) => { void builtinController.run(id); }}
          pluginTools={input.pluginTools}
          onPluginTool={input.onPluginTool}
          onClearWorkspace={clearWorkspace}
          onResetSettings={() => { model.resetSettings(); activePersistence?.clearSettings(); }}
        />
      </div>
    </Portal>
  );
}

export default function Measurer(props: MeasurerProps) {
  const initial = untrack(() => ({
    highlightColor: props.highlightColor ?? "oklch(0.62 0.18 255)",
    guideColor: props.guideColor ?? "oklch(0.63 0.26 29.23)",
    hoverHighlightEnabled: props.hoverHighlightEnabled ?? true,
    persistOnReload: props.persistOnReload ?? false,
    colorPickerFormats: props.colorPickerFormats ?? ["hex", "rgb", "oklch"],
    colorPickerClickFormat: props.colorPickerClickFormat ?? "hex",
    snapEnabled: props.snapEnabled ?? true,
    snapGuidesEnabled: props.snapGuidesEnabled ?? true,
    selectNewGuideEnabled: props.selectNewGuideEnabled ?? true,
    multiMeasureEnabled: props.multiMeasureEnabled ?? false,
    guideStyle: { ...DEFAULT_GUIDE_STYLE, ...props.guideStyle },
    rulerSettings: { ...DEFAULT_RULER_SETTINGS, ...props.rulerSettings },
  } satisfies MeasurerSettings));
  const model = createMeasurerModel({ initialEnabled: true, initialToolMode: "none", settings: initial });
  const [environment, setEnvironment] = createSignal<Environment | null>(null);

  onSettled(() => {
    const target = props.portalTarget ?? document.body;
    const ownerDocument = target.ownerDocument ?? document;
    const ownerWindow = ownerDocument.defaultView ?? window;
    let portalMount: HTMLElement;
    let ownedPortalMount = false;
    if (target.nodeType === 11) {
      portalMount = ownerDocument.createElement("div");
      portalMount.dataset.mesurerPortal = "true";
      target.append(portalMount);
      ownedPortalMount = true;
    } else {
      portalMount = target as HTMLElement;
    }
    setEnvironment({ ownerDocument, ownerWindow, portalTarget: target, portalMount, ownedPortalMount });
    return () => { if (ownedPortalMount) portalMount.remove(); };
  });

  return (
    <Show when={environment()}>
      {(env) => <MeasurerClient model={model} env={env()} input={props} />}
    </Show>
  );
}
