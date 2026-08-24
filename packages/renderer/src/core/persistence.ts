// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import type { ColorPickerFormat } from "./colors";
import type { DistanceOverlay, Guide, Measurement, ToolMode } from "./types";

export const MESURER_STORAGE_VERSION = 2;
export type LinePattern = "solid" | "dashed" | "dotted";
export type LineStyle = { opacity: number; width: number; pattern: LinePattern; dashLength: number; gap: number };
export type GuidePattern = LinePattern;
export type GuideStyle = LineStyle;
export type SelectionSpacingStyle = LineStyle & { enabled: boolean; color: string };
export const DEFAULT_GUIDE_STYLE: GuideStyle = { opacity: 1, width: 1, pattern: "solid", dashLength: 6, gap: 4 };
export const DEFAULT_SELECTION_SPACING_STYLE: SelectionSpacingStyle = { enabled: true, color: "#2563eb", opacity: 1, width: 1, pattern: "dashed", dashLength: 4, gap: 3 };
export type RulerSettings = { opacity: number; edgeReveal: boolean };
export const DEFAULT_RULER_SETTINGS: RulerSettings = { opacity: 1, edgeReveal: false };

export type MesurerStoredSettings = {
  highlightColor?: string; guideColor?: string; hoverHighlightEnabled?: boolean;
  colorPickerFormats?: ColorPickerFormat[]; colorPickerClickFormat?: ColorPickerFormat;
  snapEnabled?: boolean; snapGuidesEnabled?: boolean; selectNewGuideEnabled?: boolean;
  multiMeasureEnabled?: boolean; persistOnReload?: boolean; guideStyle?: Partial<GuideStyle>;
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
  setErrorHandler?: (handler: ((error: unknown) => void) | undefined) => void;
};

type StoredRecord = { version: number; settings?: MesurerStoredSettings; workspace?: MesurerStoredWorkspace | null; enabled?: boolean; xrayVisible?: boolean; toolMode?: ToolMode; rulersVisible?: boolean; guideOrientation?: "vertical" | "horizontal"; guides?: Guide[]; selectedGuideIds?: string[]; measurements?: Measurement[]; activeMeasurement?: Measurement | null; heldDistances?: DistanceOverlay[] };
const isFormat = (value: unknown): value is ColorPickerFormat => value === "hex" || value === "rgb" || value === "hsl" || value === "oklch";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isRect = (value: unknown): value is { left: number; top: number; width: number; height: number } => { if (!value || typeof value !== "object") return false; const r = value as Record<string, unknown>; return isFiniteNumber(r.left) && isFiniteNumber(r.top) && isFiniteNumber(r.width) && r.width >= 0 && isFiniteNumber(r.height) && r.height >= 0; };
const normalizeLineStyle = (value: unknown, defaults: LineStyle): LineStyle | undefined => { if (!value || typeof value !== "object") return undefined; const input = value as Record<string, unknown>; return { opacity: typeof input.opacity === "number" ? Math.min(1, Math.max(0, input.opacity)) : defaults.opacity, width: typeof input.width === "number" ? Math.min(4, Math.max(1, input.width)) : defaults.width, pattern: input.pattern === "solid" || input.pattern === "dashed" || input.pattern === "dotted" ? input.pattern : defaults.pattern, dashLength: typeof input.dashLength === "number" ? Math.min(24, Math.max(2, input.dashLength)) : defaults.dashLength, gap: typeof input.gap === "number" ? Math.min(24, Math.max(0, input.gap)) : defaults.gap }; };
const normalizeGuideStyle = (value: unknown): GuideStyle | undefined => normalizeLineStyle(value, DEFAULT_GUIDE_STYLE);
const normalizeSelectionSpacingStyle = (value: unknown): SelectionSpacingStyle | undefined => { if (!value || typeof value !== "object") return undefined; const input = value as Record<string, unknown>; const line = normalizeLineStyle(value, DEFAULT_SELECTION_SPACING_STYLE); if (!line) return undefined; return { ...line, enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_SELECTION_SPACING_STYLE.enabled, color: typeof input.color === "string" ? input.color : DEFAULT_SELECTION_SPACING_STYLE.color }; };
const normalizeRulerSettings = (value: unknown): RulerSettings | undefined => { if (!value || typeof value !== "object") return undefined; const input = value as Record<string, unknown>; return { opacity: typeof input.opacity === "number" ? Math.min(1, Math.max(0.2, input.opacity)) : DEFAULT_RULER_SETTINGS.opacity, edgeReveal: typeof input.edgeReveal === "boolean" ? input.edgeReveal : DEFAULT_RULER_SETTINGS.edgeReveal }; };
const isMeasurement = (value: unknown): value is Measurement => { if (!value || typeof value !== "object") return false; const m = value as Record<string, unknown>; return typeof m.id === "string" && isRect(m.rect) && isRect(m.normalizedRect) && isFiniteNumber(m.deltaX) && isFiniteNumber(m.deltaY); };
const isGuide = (value: unknown): value is Guide => { if (!value || typeof value !== "object") return false; const g = value as Record<string, unknown>; return typeof g.id === "string" && (g.orientation === "vertical" || g.orientation === "horizontal") && isFiniteNumber(g.position); };
const isDistanceOverlay = (value: unknown): value is DistanceOverlay => { if (!value || typeof value !== "object") return false; const d = value as Record<string, unknown>; return typeof d.id === "string" && isRect(d.rectA) && isRect(d.rectB) && isRect(d.normalizedRectA) && isRect(d.normalizedRectB) && Array.isArray(d.connectors); };

export const normalizeStoredSettings = (value: unknown): MesurerStoredSettings => {
  if (!value || typeof value !== "object") return {}; const input = value as Record<string, unknown>; const guideStyle = normalizeGuideStyle(input.guideStyle); const selectionSpacingStyle = normalizeSelectionSpacingStyle(input.selectionSpacingStyle); const rulerSettings = normalizeRulerSettings(input.rulerSettings);
  return {
    ...(typeof input.highlightColor === "string" ? { highlightColor: input.highlightColor } : {}),
    ...(typeof input.guideColor === "string" ? { guideColor: input.guideColor } : {}),
    ...(typeof input.hoverHighlightEnabled === "boolean" ? { hoverHighlightEnabled: input.hoverHighlightEnabled } : {}),
    ...(Array.isArray(input.colorPickerFormats) && input.colorPickerFormats.some(isFormat) ? { colorPickerFormats: input.colorPickerFormats.filter(isFormat) } : {}),
    ...(isFormat(input.colorPickerClickFormat) ? { colorPickerClickFormat: input.colorPickerClickFormat } : {}),
    ...(typeof input.snapEnabled === "boolean" ? { snapEnabled: input.snapEnabled } : {}),
    ...(typeof input.snapGuidesEnabled === "boolean" ? { snapGuidesEnabled: input.snapGuidesEnabled } : {}),
    ...(typeof input.selectNewGuideEnabled === "boolean" ? { selectNewGuideEnabled: input.selectNewGuideEnabled } : {}),
    ...(typeof input.multiMeasureEnabled === "boolean" ? { multiMeasureEnabled: input.multiMeasureEnabled } : {}),
    ...(typeof input.persistOnReload === "boolean" ? { persistOnReload: input.persistOnReload } : {}),
    ...(guideStyle ? { guideStyle } : {}), ...(selectionSpacingStyle ? { selectionSpacingStyle } : {}), ...(rulerSettings ? { rulerSettings } : {}),
  };
};
export const normalizeStoredWorkspace = (value: unknown): MesurerStoredWorkspace | null => {
  if (!value || typeof value !== "object") return null; const input = value as Record<string, unknown>;
  const validMode = input.toolMode === "none" || input.toolMode === "select" || input.toolMode === "guides" || input.toolMode === "text-inspector" || input.toolMode === "xray" || input.toolMode === "rulers";
  if (typeof input.enabled !== "boolean" || !validMode || typeof input.rulersVisible !== "boolean" || (input.guideOrientation !== "vertical" && input.guideOrientation !== "horizontal") || !Array.isArray(input.guides) || !Array.isArray(input.selectedGuideIds) || !Array.isArray(input.measurements) || !Array.isArray(input.heldDistances)) return null;
  return { enabled: input.enabled, xrayVisible: typeof input.xrayVisible === "boolean" ? input.xrayVisible : input.toolMode === "xray", toolMode: input.toolMode as ToolMode, rulersVisible: input.rulersVisible, guideOrientation: input.guideOrientation, guides: input.guides.filter(isGuide), selectedGuideIds: input.selectedGuideIds.filter((id): id is string => typeof id === "string"), measurements: input.measurements.filter(isMeasurement), activeMeasurement: isMeasurement(input.activeMeasurement) ? input.activeMeasurement : null, heldDistances: input.heldDistances.filter(isDistanceOverlay) };
};
export const normalizePersistenceSnapshot = (value: unknown): MesurerPersistenceSnapshot | null => { if (!value || typeof value !== "object") return null; const record = value as StoredRecord; if (record.version !== MESURER_STORAGE_VERSION) return null; return { settings: normalizeStoredSettings(record.settings), workspace: normalizeStoredWorkspace(record.workspace) }; };
const migrate = (record: StoredRecord): MesurerPersistenceSnapshot | null => {
  if (record.version === MESURER_STORAGE_VERSION) return normalizePersistenceSnapshot(record); if (record.version !== 1) return null;
  return { settings: {}, workspace: record.enabled === undefined || !record.toolMode || !record.guideOrientation || !record.guides || !record.selectedGuideIds || !record.measurements || record.activeMeasurement === undefined || !record.heldDistances ? null : normalizeStoredWorkspace({ enabled: record.enabled, xrayVisible: record.toolMode === "xray", toolMode: record.toolMode, rulersVisible: record.rulersVisible ?? record.toolMode === "rulers", guideOrientation: record.guideOrientation, guides: record.guides, selectedGuideIds: record.selectedGuideIds, measurements: record.measurements, activeMeasurement: record.activeMeasurement, heldDistances: record.heldDistances }) };
};
export const createLocalStoragePersistence = (ownerWindow: Window, workspaceKey: string, settingsKey = workspaceKey, legacyKey?: string): MesurerPersistence => {
  let errorHandler: ((error: unknown) => void) | undefined;
  const readRecord = (key: string): MesurerPersistenceSnapshot | null => { try { const raw = ownerWindow.localStorage.getItem(key); return raw ? migrate(JSON.parse(raw) as StoredRecord) : null; } catch (error) { errorHandler?.(error); return null; } };
  const read = () => { const legacy = legacyKey ? readRecord(legacyKey) : null; const settingsRecord = readRecord(settingsKey); const workspaceRecord = readRecord(workspaceKey); if (!settingsRecord && !workspaceRecord && !legacy) return null; return { settings: settingsRecord?.settings ?? legacy?.settings ?? {}, workspace: workspaceRecord?.workspace ?? legacy?.workspace ?? null }; };
  const writeRecord = (key: string, snapshotValue: MesurerPersistenceSnapshot) => { try { ownerWindow.localStorage.setItem(key, JSON.stringify({ version: MESURER_STORAGE_VERSION, ...snapshotValue })); } catch (error) { errorHandler?.(error); } };
  return {
    load: read,
    saveSettings: (settings) => settingsKey === workspaceKey ? writeRecord(workspaceKey, { settings, workspace: read()?.workspace ?? null }) : writeRecord(settingsKey, { settings, workspace: null }),
    saveWorkspace: (workspace) => settingsKey === workspaceKey ? writeRecord(workspaceKey, { settings: read()?.settings ?? {}, workspace }) : writeRecord(workspaceKey, { settings: {}, workspace }),
    clearWorkspace: () => settingsKey === workspaceKey ? writeRecord(workspaceKey, { settings: read()?.settings ?? {}, workspace: null }) : writeRecord(workspaceKey, { settings: {}, workspace: null }),
    clearSettings: () => settingsKey === workspaceKey ? writeRecord(workspaceKey, { settings: {}, workspace: read()?.workspace ?? null }) : writeRecord(settingsKey, { settings: {}, workspace: null }),
    setErrorHandler: (handler) => { errorHandler = handler; },
    subscribe: (listener) => { const handleStorage = (event: StorageEvent) => { if (event.key !== settingsKey && event.key !== workspaceKey && event.key !== legacyKey) return; listener(read(), { settings: event.key === settingsKey || event.key === legacyKey || settingsKey === workspaceKey, workspace: event.key === workspaceKey || event.key === legacyKey || settingsKey === workspaceKey }); }; ownerWindow.addEventListener("storage", handleStorage); return () => ownerWindow.removeEventListener("storage", handleStorage); },
  };
};
