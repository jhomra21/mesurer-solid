import { createMemo, createStore } from "solid-js";
import {
  DEFAULT_GUIDE_STYLE,
  DEFAULT_RULER_SETTINGS,
  type GuideStyle,
  type MesurerStoredSettings,
  type MesurerStoredWorkspace,
  type RulerSettings,
} from "../core/persistence";
import type {
  DistanceOverlay,
  Guide,
  InspectMeasurement,
  Measurement,
  Point,
  Rect,
  ToolMode,
} from "../core/types";
import type { ColorPickerFormat, ColorSample } from "../core/colors";

export type SettingsTab = "general" | "select" | "guides" | "rulers" | "color-picker";
export type GuidePreview = { orientation: Guide["orientation"]; position: number };

export type MeasurerSettings = {
  highlightColor: string;
  guideColor: string;
  hoverHighlightEnabled: boolean;
  persistOnReload: boolean;
  colorPickerFormats: ColorPickerFormat[];
  colorPickerClickFormat: ColorPickerFormat;
  snapEnabled: boolean;
  snapGuidesEnabled: boolean;
  selectNewGuideEnabled: boolean;
  multiMeasureEnabled: boolean;
  guideStyle: GuideStyle;
  rulerSettings: RulerSettings;
};

export type MeasurerModelOptions = {
  initialEnabled?: boolean;
  initialToolMode?: ToolMode;
  settings?: Partial<MeasurerSettings>;
};

export type MeasurerModelState = {
  enabled: boolean;
  toolMode: ToolMode;
  rulersVisible: boolean;
  xrayVisible: boolean;
  guideOrientation: Guide["orientation"];
  altPressed: boolean;
  toolbarActive: boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  colorPickerActive: boolean;
  colorPickerSample: ColorSample | null;
  colorPickerUnsupported: boolean;
  start: Point | null;
  end: Point | null;
  isDragging: boolean;
  selectionOriginRect: Rect | null;
  hoverRect: Rect | null;
  hoverElement: HTMLElement | null;
  hoverPointer: Point | null;
  selectedMeasurements: InspectMeasurement[];
  selectedMeasurement: InspectMeasurement | null;
  measurements: Measurement[];
  activeMeasurement: Measurement | null;
  heldDistances: DistanceOverlay[];
  guides: Guide[];
  selectedGuideIds: string[];
  draggingGuideId: string | null;
  guidePreview: GuidePreview | null;
  settings: MeasurerSettings;
};

type HistorySnapshot = Pick<
  MeasurerModelState,
  | "enabled"
  | "toolMode"
  | "guideOrientation"
  | "selectedMeasurements"
  | "selectedMeasurement"
  | "measurements"
  | "activeMeasurement"
  | "heldDistances"
  | "guides"
  | "selectedGuideIds"
  | "draggingGuideId"
>;

const HISTORY_LIMIT = 50;

const defaults: MeasurerSettings = {
  highlightColor: "oklch(0.62 0.18 255)",
  guideColor: "oklch(0.63 0.26 29.23)",
  hoverHighlightEnabled: true,
  persistOnReload: false,
  colorPickerFormats: ["hex", "rgb", "oklch"],
  colorPickerClickFormat: "hex",
  snapEnabled: true,
  snapGuidesEnabled: true,
  selectNewGuideEnabled: true,
  multiMeasureEnabled: false,
  guideStyle: { ...DEFAULT_GUIDE_STYLE },
  rulerSettings: { ...DEFAULT_RULER_SETTINGS },
};

const cloneSettings = (settings: MeasurerSettings): MeasurerSettings => ({
  ...settings,
  colorPickerFormats: [...settings.colorPickerFormats],
  guideStyle: { ...settings.guideStyle },
  rulerSettings: { ...settings.rulerSettings },
});

const stripMeasurement = (measurement: Measurement): Measurement => ({
  ...measurement,
  elementRef: undefined,
});
const stripDistance = (distance: DistanceOverlay): DistanceOverlay => ({
  ...distance,
  elementRefA: undefined,
  elementRefB: undefined,
});

export function createMeasurerModel(options: MeasurerModelOptions = {}) {
  const baseSettings = cloneSettings({
    ...defaults,
    ...options.settings,
    colorPickerFormats: options.settings?.colorPickerFormats
      ? [...options.settings.colorPickerFormats]
      : [...defaults.colorPickerFormats],
    guideStyle: { ...defaults.guideStyle, ...options.settings?.guideStyle },
    rulerSettings: { ...defaults.rulerSettings, ...options.settings?.rulerSettings },
  });

  const current: MeasurerModelState = {
    enabled: options.initialEnabled ?? true,
    toolMode: options.initialToolMode ?? "none",
    rulersVisible: false,
    xrayVisible: false,
    guideOrientation: "vertical",
    altPressed: false,
    toolbarActive: true,
    settingsOpen: false,
    settingsTab: "general",
    colorPickerActive: false,
    colorPickerSample: null,
    colorPickerUnsupported: false,
    start: null,
    end: null,
    isDragging: false,
    selectionOriginRect: null,
    hoverRect: null,
    hoverElement: null,
    hoverPointer: null,
    selectedMeasurements: [],
    selectedMeasurement: null,
    measurements: [],
    activeMeasurement: null,
    heldDistances: [],
    guides: [],
    selectedGuideIds: [],
    draggingGuideId: null,
    guidePreview: null,
    settings: baseSettings,
  };

  const [state, setState] = createStore<MeasurerModelState>({
    ...current,
    settings: cloneSettings(current.settings),
  });

  const sync = () => {
    const next = {
      ...current,
      start: current.start ? { ...current.start } : null,
      end: current.end ? { ...current.end } : null,
      selectionOriginRect: current.selectionOriginRect ? { ...current.selectionOriginRect } : null,
      hoverRect: current.hoverRect ? { ...current.hoverRect } : null,
      selectedMeasurements: [...current.selectedMeasurements],
      measurements: [...current.measurements],
      heldDistances: [...current.heldDistances],
      guides: [...current.guides],
      selectedGuideIds: [...current.selectedGuideIds],
      settings: cloneSettings(current.settings),
    };
    setState(() => next);
  };

  const mutate = (fn: (value: MeasurerModelState) => void) => {
    fn(current);
    sync();
  };

  const snapshotHistory = (): HistorySnapshot => ({
    enabled: current.enabled,
    toolMode: current.toolMode,
    guideOrientation: current.guideOrientation,
    selectedMeasurements: [...current.selectedMeasurements],
    selectedMeasurement: current.selectedMeasurement,
    measurements: [...current.measurements],
    activeMeasurement: current.activeMeasurement,
    heldDistances: [...current.heldDistances],
    guides: current.guides.map((guide) => ({ ...guide })),
    selectedGuideIds: [...current.selectedGuideIds],
    draggingGuideId: current.draggingGuideId,
  });

  const snapshotSignature = (snapshot: HistorySnapshot) => {
    const serializeRect = (rect: Rect) =>
      `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
    return [
      snapshot.enabled ? "1" : "0",
      snapshot.toolMode,
      snapshot.guideOrientation,
      snapshot.measurements.map((item) => `${item.id}@${serializeRect(item.rect)}`).join(","),
      snapshot.activeMeasurement ? `${snapshot.activeMeasurement.id}@${serializeRect(snapshot.activeMeasurement.rect)}` : "",
      snapshot.selectedMeasurements.map((item) => `${item.id}@${serializeRect(item.rect)}`).join(","),
      snapshot.selectedMeasurement ? `${snapshot.selectedMeasurement.id}@${serializeRect(snapshot.selectedMeasurement.rect)}` : "",
      snapshot.heldDistances.map((item) => item.id).join(","),
      snapshot.guides.map((item) => `${item.id}:${item.position}`).join(","),
      snapshot.selectedGuideIds.join(","),
      snapshot.draggingGuideId ?? "",
    ].join("|");
  };

  const history: HistorySnapshot[] = [];
  const future: HistorySnapshot[] = [];
  let historySignature: string | null = null;

  const restoreHistory = (value: HistorySnapshot) => {
    mutate((draft) => {
      Object.assign(draft, value);
      draft.start = null;
      draft.end = null;
      draft.isDragging = false;
      draft.hoverRect = null;
      draft.hoverElement = null;
      draft.hoverPointer = null;
      draft.guidePreview = null;
      draft.altPressed = false;
    });
  };

  const pushHistory = (snapshot: HistorySnapshot) => {
    const signature = snapshotSignature(snapshot);
    if (historySignature === signature) return;
    history.push(snapshot);
    future.length = 0;
    historySignature = signature;
    if (history.length > HISTORY_LIMIT) history.shift();
  };

  const checkpoint = () => pushHistory(snapshotHistory());

  const beginAction = () => {
    const snapshot = snapshotHistory();
    let committed = false;
    return () => {
      if (committed) return;
      pushHistory(snapshot);
      committed = true;
    };
  };

  const endAction = () => {};

  const undo = () => {
    const previous = history.pop();
    if (!previous) return false;
    future.push(snapshotHistory());
    if (future.length > HISTORY_LIMIT) future.shift();
    historySignature = null;
    restoreHistory(previous);
    return true;
  };
  const redo = () => {
    const next = future.pop();
    if (!next) return false;
    history.push(snapshotHistory());
    if (history.length > HISTORY_LIMIT) history.shift();
    historySignature = null;
    restoreHistory(next);
    return true;
  };

  const setEnabled = (enabled: boolean, withHistory = false) => {
    if (enabled === current.enabled) return enabled;
    if (withHistory) checkpoint();
    mutate((draft) => {
      draft.enabled = enabled;
      if (!enabled) {
        draft.hoverRect = null;
        draft.hoverElement = null;
        draft.hoverPointer = null;
        draft.altPressed = false;
      }
    });
    return enabled;
  };
  const toggleEnabled = (withHistory = true) => setEnabled(!current.enabled, withHistory);

  const setToolMode = (toolMode: ToolMode, withHistory = false) => {
    if (current.toolMode === toolMode) return toolMode;
    if (withHistory) checkpoint();
    mutate((draft) => {
      draft.toolMode = toolMode;
      draft.colorPickerActive = false;
      draft.hoverRect = null;
      draft.hoverElement = null;
      draft.hoverPointer = null;
      draft.guidePreview = null;
      if (toolMode !== "select") {
        draft.selectedMeasurement = null;
        draft.selectedMeasurements = [];
        draft.selectionOriginRect = null;
      }
    });
    return toolMode;
  };
  const toggleToolMode = (toolMode: ToolMode) =>
    setToolMode(current.toolMode === toolMode ? "none" : toolMode, true);

  const setRulersVisible = (visible: boolean) => mutate((draft) => { draft.rulersVisible = visible; });
  const toggleRulers = () => {
    const next = !current.rulersVisible;
    setRulersVisible(next);
    return next;
  };
  const setXrayVisible = (visible: boolean) => mutate((draft) => { draft.xrayVisible = visible; });
  const toggleXray = () => {
    const next = !current.xrayVisible;
    setXrayVisible(next);
    return next;
  };
  const setGuideOrientation = (orientation: Guide["orientation"], withHistory = false) => {
    if (current.guideOrientation === orientation) return;
    if (withHistory) checkpoint();
    mutate((draft) => { draft.guideOrientation = orientation; });
  };

  const setTransient = (patch: Partial<Pick<MeasurerModelState,
    "altPressed" | "start" | "end" | "isDragging" | "selectionOriginRect" |
    "hoverRect" | "hoverElement" | "hoverPointer" | "draggingGuideId" | "guidePreview" |
    "toolbarActive" | "settingsOpen" | "settingsTab" | "colorPickerActive" |
    "colorPickerSample" | "colorPickerUnsupported"
  >>) => mutate((draft) => Object.assign(draft, patch));

  const setSelectedMeasurements = (values: InspectMeasurement[], primary?: InspectMeasurement | null) =>
    mutate((draft) => {
      draft.selectedMeasurements = [...values];
      draft.selectedMeasurement = primary === undefined
        ? values.at(-1) ?? null
        : primary;
    });
  const setHoverTarget = (element: HTMLElement | null, rect: Rect | null) =>
    mutate((draft) => { draft.hoverElement = element; draft.hoverRect = rect; });

  const setGuides = (guides: Guide[]) => mutate((draft) => { draft.guides = [...guides]; });
  const setSelectedGuideIds = (ids: string[]) => mutate((draft) => { draft.selectedGuideIds = [...ids]; });
  const addGuide = (guide: Guide) => mutate((draft) => { draft.guides = [...draft.guides, guide]; });
  const updateGuide = (id: string, patch: Partial<Omit<Guide, "id">>) =>
    mutate((draft) => {
      draft.guides = draft.guides.map((guide) => guide.id === id ? { ...guide, ...patch } : guide);
    });
  const removeGuides = (ids: string[]) => {
    if (!ids.length) return;
    checkpoint();
    const set = new Set(ids);
    mutate((draft) => {
      draft.guides = draft.guides.filter((guide) => !set.has(guide.id));
      draft.selectedGuideIds = draft.selectedGuideIds.filter((id) => !set.has(id));
    });
  };

  const setMeasurements = (measurements: Measurement[]) => mutate((draft) => { draft.measurements = [...measurements]; });
  const setActiveMeasurement = (measurement: Measurement | null) => mutate((draft) => { draft.activeMeasurement = measurement; });
  const setHeldDistances = (distances: DistanceOverlay[]) => mutate((draft) => { draft.heldDistances = [...distances]; });
  const addHeldDistance = (distance: DistanceOverlay) => mutate((draft) => { draft.heldDistances = [...draft.heldDistances, distance]; });
  const removeHeldDistance = (id: string) => {
    checkpoint();
    mutate((draft) => { draft.heldDistances = draft.heldDistances.filter((distance) => distance.id !== id); });
  };

  const updateSettings = (patch: Partial<MeasurerSettings>) =>
    mutate((draft) => {
      draft.settings = cloneSettings({
        ...draft.settings,
        ...patch,
        colorPickerFormats: patch.colorPickerFormats
          ? [...patch.colorPickerFormats]
          : draft.settings.colorPickerFormats,
        guideStyle: { ...draft.settings.guideStyle, ...patch.guideStyle },
        rulerSettings: { ...draft.settings.rulerSettings, ...patch.rulerSettings },
      });
    });
  const resetSettings = () => mutate((draft) => { draft.settings = cloneSettings(baseSettings); });

  const clearAll = (record = true) => {
    if (record) checkpoint();
    mutate((draft) => {
      draft.start = null;
      draft.end = null;
      draft.isDragging = false;
      draft.selectionOriginRect = null;
      draft.hoverRect = null;
      draft.hoverElement = null;
      draft.hoverPointer = null;
      draft.selectedMeasurements = [];
      draft.selectedMeasurement = null;
      draft.measurements = [];
      draft.activeMeasurement = null;
      draft.heldDistances = [];
      draft.guides = [];
      draft.selectedGuideIds = [];
      draft.draggingGuideId = null;
      draft.guidePreview = null;
    });
  };

  const clearWorkspace = (record = true) => {
    if (record) checkpoint();
    mutate((draft) => {
      draft.enabled = false;
      draft.toolMode = "none";
      draft.rulersVisible = false;
      draft.xrayVisible = false;
      draft.guideOrientation = "vertical";
      draft.start = null;
      draft.end = null;
      draft.isDragging = false;
      draft.selectionOriginRect = null;
      draft.hoverRect = null;
      draft.hoverElement = null;
      draft.hoverPointer = null;
      draft.selectedMeasurements = [];
      draft.selectedMeasurement = null;
      draft.measurements = [];
      draft.activeMeasurement = null;
      draft.heldDistances = [];
      draft.guides = [];
      draft.selectedGuideIds = [];
      draft.draggingGuideId = null;
      draft.guidePreview = null;
    });
  };

  const applyStoredSettings = (stored: MesurerStoredSettings) => {
    updateSettings({
      ...(stored.highlightColor !== undefined ? { highlightColor: stored.highlightColor } : {}),
      ...(stored.guideColor !== undefined ? { guideColor: stored.guideColor } : {}),
      ...(stored.hoverHighlightEnabled !== undefined ? { hoverHighlightEnabled: stored.hoverHighlightEnabled } : {}),
      ...(stored.persistOnReload !== undefined ? { persistOnReload: stored.persistOnReload } : {}),
      ...(stored.colorPickerFormats !== undefined ? { colorPickerFormats: stored.colorPickerFormats } : {}),
      ...(stored.colorPickerClickFormat !== undefined ? { colorPickerClickFormat: stored.colorPickerClickFormat } : {}),
      ...(stored.snapEnabled !== undefined ? { snapEnabled: stored.snapEnabled } : {}),
      ...(stored.snapGuidesEnabled !== undefined ? { snapGuidesEnabled: stored.snapGuidesEnabled } : {}),
      ...(stored.selectNewGuideEnabled !== undefined ? { selectNewGuideEnabled: stored.selectNewGuideEnabled } : {}),
      ...(stored.multiMeasureEnabled !== undefined ? { multiMeasureEnabled: stored.multiMeasureEnabled } : {}),
      ...(stored.guideStyle !== undefined ? { guideStyle: { ...baseSettings.guideStyle, ...stored.guideStyle } } : {}),
      ...(stored.rulerSettings !== undefined ? { rulerSettings: { ...baseSettings.rulerSettings, ...stored.rulerSettings } } : {}),
    });
  };

  const applyStoredWorkspace = (workspace: MesurerStoredWorkspace) => {
    mutate((draft) => {
      draft.enabled = workspace.enabled;
      draft.toolMode = workspace.toolMode === "rulers" ? "none" : workspace.toolMode;
      draft.rulersVisible = workspace.rulersVisible || workspace.toolMode === "rulers";
      draft.xrayVisible = workspace.xrayVisible;
      draft.guideOrientation = workspace.guideOrientation;
      draft.guides = workspace.guides.map((guide) => ({ ...guide }));
      draft.selectedGuideIds = [...workspace.selectedGuideIds];
      draft.measurements = workspace.measurements.map((measurement) => ({ ...measurement }));
      draft.activeMeasurement = workspace.activeMeasurement ? { ...workspace.activeMeasurement } : null;
      draft.heldDistances = workspace.heldDistances.map((distance) => ({ ...distance }));
    });
  };

  const serializeSettings = (): MesurerStoredSettings => ({
    highlightColor: current.settings.highlightColor,
    guideColor: current.settings.guideColor,
    hoverHighlightEnabled: current.settings.hoverHighlightEnabled,
    colorPickerFormats: [...current.settings.colorPickerFormats],
    colorPickerClickFormat: current.settings.colorPickerClickFormat,
    snapEnabled: current.settings.snapEnabled,
    snapGuidesEnabled: current.settings.snapGuidesEnabled,
    selectNewGuideEnabled: current.settings.selectNewGuideEnabled,
    multiMeasureEnabled: current.settings.multiMeasureEnabled,
    persistOnReload: current.settings.persistOnReload,
    guideStyle: { ...current.settings.guideStyle },
    rulerSettings: { ...current.settings.rulerSettings },
  });

  const serializeWorkspace = (): MesurerStoredWorkspace => ({
    enabled: current.enabled,
    xrayVisible: current.xrayVisible,
    toolMode: current.toolMode,
    rulersVisible: current.rulersVisible,
    guideOrientation: current.guideOrientation,
    guides: current.guides.map((guide) => ({ ...guide })),
    selectedGuideIds: [...current.selectedGuideIds],
    measurements: current.measurements.map(stripMeasurement),
    activeMeasurement: current.activeMeasurement ? stripMeasurement(current.activeMeasurement) : null,
    heldDistances: current.heldDistances.map(stripDistance),
  });

  const activeSelection = createMemo(() => state.selectedMeasurement ?? state.selectedMeasurements.at(-1) ?? null);
  const canUndo = () => history.length > 0;
  const canRedo = () => future.length > 0;

  return {
    state,
    current,
    activeSelection,
    checkpoint,
    beginAction,
    endAction,
    undo,
    redo,
    canUndo,
    canRedo,
    setEnabled,
    toggleEnabled,
    setToolMode,
    toggleToolMode,
    setRulersVisible,
    toggleRulers,
    setXrayVisible,
    toggleXray,
    setGuideOrientation,
    setTransient,
    setSelectedMeasurements,
    setHoverTarget,
    setGuides,
    setSelectedGuideIds,
    addGuide,
    updateGuide,
    removeGuides,
    setMeasurements,
    setActiveMeasurement,
    setHeldDistances,
    addHeldDistance,
    removeHeldDistance,
    updateSettings,
    resetSettings,
    clearAll,
    clearWorkspace,
    applyStoredSettings,
    applyStoredWorkspace,
    serializeSettings,
    serializeWorkspace,
  };
}

export type MeasurerModel = ReturnType<typeof createMeasurerModel>;
