export type ColorPickerFormat = "hex" | "rgb" | "hsl" | "oklch";
export type ColorSample = { red: number; green: number; blue: number; alpha: number };
export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; width: number; height: number };
export type NormalizedRect = Rect;
export type BoxEdges = { top: number; right: number; bottom: number; left: number };

export type Measurement<ElementRef = unknown> = {
  id: string;
  rect: Rect;
  normalizedRect: NormalizedRect;
  elementRef?: ElementRef | null;
  originRect?: Rect;
  deltaX: number;
  deltaY: number;
  snapped?: boolean;
};

export type InspectMeasurement<ElementRef = unknown> = {
  id: string;
  rect: Rect;
  paddingRect: Rect;
  marginRect: Rect;
  padding: BoxEdges;
  margin: BoxEdges;
  label: string;
  elementRef?: ElementRef | null;
  originRect?: Rect;
};

export type Guide = { id: string; orientation: "vertical" | "horizontal"; position: number };
export type DistanceOverlay<ElementRef = unknown> = {
  id: string;
  rectA: Rect;
  rectB: Rect;
  normalizedRectA: NormalizedRect;
  normalizedRectB: NormalizedRect;
  elementRefA?: ElementRef | null;
  elementRefB?: ElementRef | null;
  horizontal: { x1: number; x2: number; y: number; value: number } | null;
  vertical: { y1: number; y2: number; x: number; value: number } | null;
  connectors: Array<{ x1: number; y1: number; x2: number; y2: number }>;
};

export type ToolMode = "none" | "select" | "guides" | "text-inspector" | "xray" | "rulers";
export type SettingsTab = "general" | "select" | "guides" | "rulers" | "color-picker";
export type GuidePattern = "solid" | "dashed" | "dotted";
export type GuideStyle = { opacity: number; width: number; pattern: GuidePattern; dashLength: number; gap: number };
export type RulerSettings = { opacity: number; edgeReveal: boolean };
export const DEFAULT_GUIDE_STYLE: GuideStyle = { opacity: 1, width: 1, pattern: "solid", dashLength: 6, gap: 4 };
export const DEFAULT_RULER_SETTINGS: RulerSettings = { opacity: 1, edgeReveal: false };

export type MesurerStoredSettings = {
  highlightColor?: string;
  guideColor?: string;
  hoverHighlightEnabled?: boolean;
  colorPickerFormats?: ColorPickerFormat[];
  colorPickerClickFormat?: ColorPickerFormat;
  snapEnabled?: boolean;
  snapGuidesEnabled?: boolean;
  selectNewGuideEnabled?: boolean;
  multiMeasureEnabled?: boolean;
  persistOnReload?: boolean;
  guideStyle?: Partial<GuideStyle>;
  rulerSettings?: Partial<RulerSettings>;
};

export type MesurerStoredWorkspace<ElementRef = unknown> = {
  enabled: boolean;
  xrayVisible: boolean;
  toolMode: ToolMode;
  rulersVisible: boolean;
  guideOrientation: Guide["orientation"];
  guides: Guide[];
  selectedGuideIds: string[];
  measurements: Measurement<ElementRef>[];
  activeMeasurement: Measurement<ElementRef> | null;
  heldDistances: DistanceOverlay<ElementRef>[];
};

export type MesurerSettings = {
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

export type GuidePreview = { orientation: Guide["orientation"]; position: number };
export type MesurerModelOptions = {
  initialEnabled?: boolean;
  initialToolMode?: ToolMode;
  settings?: Partial<MesurerSettings>;
};

export type MesurerModelState<ElementRef = unknown> = {
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
  hoverElement: ElementRef | null;
  hoverPointer: Point | null;
  selectedMeasurements: InspectMeasurement<ElementRef>[];
  selectedMeasurement: InspectMeasurement<ElementRef> | null;
  measurements: Measurement<ElementRef>[];
  activeMeasurement: Measurement<ElementRef> | null;
  heldDistances: DistanceOverlay<ElementRef>[];
  guides: Guide[];
  selectedGuideIds: string[];
  draggingGuideId: string | null;
  guidePreview: GuidePreview | null;
  settings: MesurerSettings;
};

/** @deprecated Use `MesurerSettings`. */
export type MeasurerSettings = MesurerSettings;
/** @deprecated Use `MesurerModelOptions`. */
export type MeasurerModelOptions = MesurerModelOptions;
/** @deprecated Use `MesurerModelState`. */
export type MeasurerModelState<ElementRef = unknown> = MesurerModelState<ElementRef>;
