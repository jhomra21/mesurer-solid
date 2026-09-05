// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import type { ColorPickerFormat } from "./colors";
import type { DistanceOverlay, Guide, Measurement, Rect, ToolMode } from "./types";

export const MESURER_STORAGE_VERSION = 2;
export type LinePattern = "solid" | "dashed" | "dotted";
export type LineStyle = { opacity: number; width: number; pattern: LinePattern; dashLength: number; gap: number };
export type GuidePattern = LinePattern;
export type GuideStyle = LineStyle;
export type SelectionSpacingStyle = LineStyle & { enabled: boolean; color: string; diagonals: boolean };
export const DEFAULT_GUIDE_STYLE: GuideStyle = { opacity: 1, width: 1, pattern: "solid", dashLength: 6, gap: 4 };
export const DEFAULT_SELECTION_SPACING_STYLE: SelectionSpacingStyle = { enabled: true, color: "#2563eb", diagonals: false, opacity: 1, width: 1, pattern: "dashed", dashLength: 4, gap: 3 };
export type RulerSettings = { opacity: number; edgeReveal: boolean };
export const DEFAULT_RULER_SETTINGS: RulerSettings = { opacity: 1, edgeReveal: false };

export type MesurerStoredSettings = {
  highlightColor?: string; guideColor?: string; hoverHighlightEnabled?: boolean;
  colorPickerFormats?: ColorPickerFormat[]; colorPickerClickFormat?: ColorPickerFormat;
  snapEnabled?: boolean; snapGuidesEnabled?: boolean; selectNewGuideEnabled?: boolean;
  multiMeasureEnabled?: boolean; persistOnReload?: boolean; shortcutsEnabled?: boolean; guideStyle?: Partial<GuideStyle>;
  selectionSpacingStyle?: Partial<SelectionSpacingStyle>; rulerSettings?: Partial<RulerSettings>;
};
export type MesurerStoredWorkspace = {
  enabled: boolean; xrayVisible: boolean; toolMode: ToolMode; rulersVisible: boolean;
  guideOrientation: "vertical" | "horizontal"; guides: Guide[]; selectedGuideIds: string[];
  measurements: Measurement[]; activeMeasurement: Measurement | null; heldDistances: DistanceOverlay[];
};
export type MesurerPersistenceSnapshot = { settings: MesurerStoredSettings; workspace: MesurerStoredWorkspace | null };
export type PersistenceChangeSource = { settings?: boolean; workspace?: boolean };
export type MesurerPersistence = {
  load: () => MesurerPersistenceSnapshot | null;
  saveSettings: (settings: MesurerStoredSettings) => void;
  saveWorkspace: (workspace: MesurerStoredWorkspace) => void;
  clearWorkspace: () => void;
  clearSettings: () => void;
  subscribe?: (listener: (snapshot: MesurerPersistenceSnapshot | null, source?: PersistenceChangeSource) => void) => () => void;
  setErrorHandler?: (handler: ((cause: unknown) => void) | undefined) => void;
};

type PersistedValue = string | number | boolean | null | PersistedValue[] | PersistedRecord;
type PersistedRecord = { [key: string]: PersistedValue };

const isPersistedRecord = (value: unknown): value is PersistedRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isFormat = (value: unknown): value is ColorPickerFormat => value === "hex" || value === "rgb" || value === "hsl" || value === "oklch";
const isLinePattern = (value: unknown): value is LinePattern => value === "solid" || value === "dashed" || value === "dotted";
const isToolMode = (value: unknown): value is ToolMode => value === "none" || value === "select" || value === "guides" || value === "text-inspector" || value === "xray" || value === "rulers";
const isGuideOrientation = (value: unknown): value is Guide["orientation"] => value === "vertical" || value === "horizontal";
const isRect = (value: unknown): value is Rect => {
  if (!isPersistedRecord(value)) return false;
  return isFiniteNumber(value.left)
    && isFiniteNumber(value.top)
    && isFiniteNumber(value.width)
    && value.width >= 0
    && isFiniteNumber(value.height)
    && value.height >= 0;
};
const isMeasurement = (value: unknown): value is PersistedRecord & Measurement => {
  if (!isPersistedRecord(value)) return false;
  return isString(value.id)
    && isRect(value.rect)
    && isRect(value.normalizedRect)
    && isFiniteNumber(value.deltaX)
    && isFiniteNumber(value.deltaY);
};
const isGuide = (value: unknown): value is Guide => {
  if (!isPersistedRecord(value)) return false;
  return isString(value.id) && isGuideOrientation(value.orientation) && isFiniteNumber(value.position);
};
const isDistanceOverlay = (value: unknown): value is PersistedRecord & DistanceOverlay => {
  if (!isPersistedRecord(value)) return false;
  return isString(value.id)
    && isRect(value.rectA)
    && isRect(value.rectB)
    && isRect(value.normalizedRectA)
    && isRect(value.normalizedRectB)
    && Array.isArray(value.connectors);
};

const normalizeLineStyle = (value: PersistedValue | undefined, defaults: LineStyle): LineStyle | undefined => {
  if (!isPersistedRecord(value)) return undefined;
  return {
    opacity: isFiniteNumber(value.opacity) ? Math.min(1, Math.max(0, value.opacity)) : defaults.opacity,
    width: isFiniteNumber(value.width) ? Math.min(4, Math.max(1, value.width)) : defaults.width,
    pattern: isLinePattern(value.pattern) ? value.pattern : defaults.pattern,
    dashLength: isFiniteNumber(value.dashLength) ? Math.min(24, Math.max(2, value.dashLength)) : defaults.dashLength,
    gap: isFiniteNumber(value.gap) ? Math.min(24, Math.max(0, value.gap)) : defaults.gap,
  };
};
const normalizeGuideStyle = (value: PersistedValue | undefined): GuideStyle | undefined => normalizeLineStyle(value, DEFAULT_GUIDE_STYLE);
const normalizeSelectionSpacingStyle = (value: PersistedValue | undefined): SelectionSpacingStyle | undefined => {
  if (!isPersistedRecord(value)) return undefined;
  const line = normalizeLineStyle(value, DEFAULT_SELECTION_SPACING_STYLE);
  if (!line) return undefined;
  return {
    ...line,
    enabled: isBoolean(value.enabled) ? value.enabled : DEFAULT_SELECTION_SPACING_STYLE.enabled,
    color: isString(value.color) ? value.color : DEFAULT_SELECTION_SPACING_STYLE.color,
    diagonals: isBoolean(value.diagonals) ? value.diagonals : DEFAULT_SELECTION_SPACING_STYLE.diagonals,
  };
};
const normalizeRulerSettings = (value: PersistedValue | undefined): RulerSettings | undefined => {
  if (!isPersistedRecord(value)) return undefined;
  return {
    opacity: isFiniteNumber(value.opacity) ? Math.min(1, Math.max(0.2, value.opacity)) : DEFAULT_RULER_SETTINGS.opacity,
    edgeReveal: isBoolean(value.edgeReveal) ? value.edgeReveal : DEFAULT_RULER_SETTINGS.edgeReveal,
  };
};

export const normalizeStoredSettings = (value: PersistedValue | undefined): MesurerStoredSettings => {
  if (!isPersistedRecord(value)) return {};
  const settings: MesurerStoredSettings = {};
  if (isString(value.highlightColor)) settings.highlightColor = value.highlightColor;
  if (isString(value.guideColor)) settings.guideColor = value.guideColor;
  if (isBoolean(value.hoverHighlightEnabled)) settings.hoverHighlightEnabled = value.hoverHighlightEnabled;
  if (Array.isArray(value.colorPickerFormats)) {
    const formats = value.colorPickerFormats.filter(isFormat);
    if (formats.length > 0) settings.colorPickerFormats = formats;
  }
  if (isFormat(value.colorPickerClickFormat)) settings.colorPickerClickFormat = value.colorPickerClickFormat;
  if (isBoolean(value.snapEnabled)) settings.snapEnabled = value.snapEnabled;
  if (isBoolean(value.snapGuidesEnabled)) settings.snapGuidesEnabled = value.snapGuidesEnabled;
  if (isBoolean(value.selectNewGuideEnabled)) settings.selectNewGuideEnabled = value.selectNewGuideEnabled;
  if (isBoolean(value.multiMeasureEnabled)) settings.multiMeasureEnabled = value.multiMeasureEnabled;
  if (isBoolean(value.persistOnReload)) settings.persistOnReload = value.persistOnReload;
  if (isBoolean(value.shortcutsEnabled)) settings.shortcutsEnabled = value.shortcutsEnabled;
  const guideStyle = normalizeGuideStyle(value.guideStyle);
  if (guideStyle) settings.guideStyle = guideStyle;
  const selectionSpacingStyle = normalizeSelectionSpacingStyle(value.selectionSpacingStyle);
  if (selectionSpacingStyle) settings.selectionSpacingStyle = selectionSpacingStyle;
  const rulerSettings = normalizeRulerSettings(value.rulerSettings);
  if (rulerSettings) settings.rulerSettings = rulerSettings;
  return settings;
};

export const normalizeStoredWorkspace = (value: PersistedValue | undefined): MesurerStoredWorkspace | null => {
  if (!isPersistedRecord(value)
    || !isBoolean(value.enabled)
    || !isToolMode(value.toolMode)
    || !isGuideOrientation(value.guideOrientation)
    || !Array.isArray(value.guides)
    || !Array.isArray(value.selectedGuideIds)
    || !Array.isArray(value.measurements)
    || !Array.isArray(value.heldDistances)) return null;

  return {
    enabled: value.enabled,
    xrayVisible: isBoolean(value.xrayVisible) ? value.xrayVisible : value.toolMode === "xray",
    toolMode: value.toolMode,
    rulersVisible: isBoolean(value.rulersVisible) ? value.rulersVisible : value.toolMode === "rulers",
    guideOrientation: value.guideOrientation,
    guides: value.guides.filter(isGuide),
    selectedGuideIds: value.selectedGuideIds.filter(isString),
    measurements: value.measurements.filter(isMeasurement),
    activeMeasurement: isMeasurement(value.activeMeasurement) ? value.activeMeasurement : null,
    heldDistances: value.heldDistances.filter(isDistanceOverlay),
  };
};

export const normalizePersistenceSnapshot = (value: PersistedValue | undefined): MesurerPersistenceSnapshot | null => {
  if (!isPersistedRecord(value) || value.version !== MESURER_STORAGE_VERSION) return null;
  return {
    settings: normalizeStoredSettings(value.settings),
    workspace: normalizeStoredWorkspace(value.workspace),
  };
};

const migrate = (value: PersistedValue): MesurerPersistenceSnapshot | null => {
  if (!isPersistedRecord(value)) return null;
  if (value.version === MESURER_STORAGE_VERSION) return normalizePersistenceSnapshot(value);
  if (value.version !== 1) return null;
  return { settings: {}, workspace: normalizeStoredWorkspace(value) };
};

const parseStoredValue = (raw: string): PersistedValue => {
  // SAFETY: JSON.parse either throws or returns a value from the JSON grammar, exactly matching PersistedValue.
  return JSON.parse(raw) as PersistedValue;
};

export const createLocalStoragePersistence = (ownerWindow: Window, workspaceKey: string, settingsKey = workspaceKey, legacyKey?: string): MesurerPersistence => {
  let errorHandler: ((cause: unknown) => void) | undefined;
  const readRecord = (key: string): MesurerPersistenceSnapshot | null => {
    try {
      const raw = ownerWindow.localStorage.getItem(key);
      return raw ? migrate(parseStoredValue(raw)) : null;
    } catch (cause) {
      errorHandler?.(cause);
      return null;
    }
  };
  const read = () => {
    const legacy = legacyKey ? readRecord(legacyKey) : null;
    const settingsRecord = readRecord(settingsKey);
    const workspaceRecord = readRecord(workspaceKey);
    if (!settingsRecord && !workspaceRecord && !legacy) return null;
    return {
      settings: settingsRecord?.settings ?? legacy?.settings ?? {},
      workspace: workspaceRecord?.workspace ?? legacy?.workspace ?? null,
    };
  };
  const writeRecord = (key: string, snapshotValue: MesurerPersistenceSnapshot) => {
    try {
      ownerWindow.localStorage.setItem(key, JSON.stringify({ version: MESURER_STORAGE_VERSION, ...snapshotValue }));
    } catch (cause) {
      errorHandler?.(cause);
    }
  };
  return {
    load: read,
    saveSettings: (settings) => settingsKey === workspaceKey
      ? writeRecord(workspaceKey, { settings, workspace: read()?.workspace ?? null })
      : writeRecord(settingsKey, { settings, workspace: null }),
    saveWorkspace: (workspace) => settingsKey === workspaceKey
      ? writeRecord(workspaceKey, { settings: read()?.settings ?? {}, workspace })
      : writeRecord(workspaceKey, { settings: {}, workspace }),
    clearWorkspace: () => settingsKey === workspaceKey
      ? writeRecord(workspaceKey, { settings: read()?.settings ?? {}, workspace: null })
      : writeRecord(workspaceKey, { settings: {}, workspace: null }),
    clearSettings: () => settingsKey === workspaceKey
      ? writeRecord(workspaceKey, { settings: {}, workspace: read()?.workspace ?? null })
      : writeRecord(settingsKey, { settings: {}, workspace: null }),
    setErrorHandler: (handler) => { errorHandler = handler; },
    subscribe: (listener) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.key !== settingsKey && event.key !== workspaceKey && event.key !== legacyKey) return;
        listener(read(), {
          settings: event.key === settingsKey || event.key === legacyKey || settingsKey === workspaceKey,
          workspace: event.key === workspaceKey || event.key === legacyKey || settingsKey === workspaceKey,
        });
      };
      ownerWindow.addEventListener("storage", handleStorage);
      return () => ownerWindow.removeEventListener("storage", handleStorage);
    },
  };
};
