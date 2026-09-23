import { createId } from "./utils";

export type LayoutGuideKind = "columns" | "rows" | "grid";

export type LayoutGuideAlign = "stretch" | "min" | "center" | "max";

export type LayoutGuide = {
  id: string;
  kind: LayoutGuideKind;
  visible: boolean;
  color: string;
  opacity: number;
  count: number;
  size: number;
  gutter: number;
  offset: number;
  align: LayoutGuideAlign;
};

export type LayoutGuideInput = Partial<Omit<LayoutGuide, "id">> & { id?: string };

export const DEFAULT_LAYOUT_GUIDE_COLOR = "#FF0000";

export const DEFAULT_LAYOUT_GUIDE_OPACITY = 0.1;

const KINDS = new Set<LayoutGuideKind>(["columns", "rows", "grid"]);

const ALIGNS = new Set<LayoutGuideAlign>(["stretch", "min", "center", "max"]);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const finite = (value: number | undefined, fallback: number) =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

export const normalizeLayoutGuide = (
  input: LayoutGuideInput = {},
): LayoutGuide => {
  const kind = input.kind && KINDS.has(input.kind) ? input.kind : "columns";
  const align = input.align && ALIGNS.has(input.align)
    ? input.align
    : kind === "grid" ? "min" : "stretch";

  const id = input.id?.trim();

  const color = input.color?.trim();

  return {
    id: id || createId(),
    kind,
    visible: input.visible ?? true,
    color: color || DEFAULT_LAYOUT_GUIDE_COLOR,
    opacity: clamp(finite(input.opacity, DEFAULT_LAYOUT_GUIDE_OPACITY), 0, 1),
    count: clamp(Math.round(finite(input.count, 5)), 1, 24),
    size: clamp(finite(input.size, 72), 1, 4096),
    gutter: clamp(finite(input.gutter, 20), 0, 800),
    offset: clamp(finite(input.offset, 0), 0, 4096),
    align,
  };
};

export const normalizeLayoutGuides = (
  guides: readonly LayoutGuideInput[] | undefined,
): LayoutGuide[] => (guides ?? []).map(normalizeLayoutGuide);

export const layoutGuideLabel = (guide: LayoutGuide) => {
  if (guide.kind === "grid") return `Grid ${Math.round(guide.size)}px`;
  const unit = guide.kind === "columns" ? "columns" : "rows";

  return guide.align === "stretch"
    ? `${guide.count} ${unit}`
    : `${guide.count} ${unit} (${Math.round(guide.size)}px)`;
};
