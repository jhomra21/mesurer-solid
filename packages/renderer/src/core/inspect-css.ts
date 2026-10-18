// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import type { InspectMeasurement } from "./types";

export type InspectCssPart = { label: string; value: string };

export const INSPECT_CSS_VISIBLE_ROWS = 6;

const round = (value: number) => Math.round(value);

const parseEdge = (value: string) => Number.parseFloat(value) || 0;

const withPx = (value: string) => value.split(" ").map((part) => `${part}px`).join(" ");

const edgeShorthand = (edges: { top: number; right: number; bottom: number; left: number }) => {
  const top = round(edges.top);
  const right = round(edges.right);
  const bottom = round(edges.bottom);
  const left = round(edges.left);

  if (top === 0 && right === 0 && bottom === 0 && left === 0) return null;

  if (top === right && right === bottom && bottom === left) return String(top);

  if (top === bottom && left === right) return `${top} ${right}`;

  return `${top} ${right} ${bottom} ${left}`;
};

const gapShorthand = (row: number, column: number) => {
  const a = round(row);
  const b = round(column);

  if (a === 0 && b === 0) return null;

  return a === b ? String(a) : `${a} ${b}`;
};

const insetShorthand = (style: CSSStyleDeclaration) => {
  const values = [style.top, style.right, style.bottom, style.left].map(parseEdge).map(round);

  if (values.every((value) => value === 0)) return null;
  const [top, right, bottom, left] = values;

  if (top === right && right === bottom && bottom === left) return `${top}px`;

  if (top === bottom && left === right) return `${top}px ${right}px`;

  return `${top}px ${right}px ${bottom}px ${left}px`;
};

const border = (style: CSSStyleDeclaration) => {
  const widths = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(parseEdge);

  if (widths.every((value) => value === 0)) return null;
  const shorthand = edgeShorthand({ top: widths[0]!, right: widths[1]!, bottom: widths[2]!, left: widths[3]! });
  const name = style.borderTopStyle;

  return shorthand ? `${withPx(shorthand)}${name && name !== "none" && widths.every((value) => value === widths[0]) ? ` ${name}` : ""}` : null;
};

const rgb = (input: string) => {
  const value = input.trim().toLowerCase();
  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value);

  if (match) return { r: Math.round(Number(match[1])), g: Math.round(Number(match[2])), b: Math.round(Number(match[3])), a: match[4] === undefined ? 1 : Number(match[4]) };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)?.[1];

  if (!hex) return null;
  const expanded = hex.length === 3 ? [...hex].map((part) => part + part).join("") : hex;

  return { r: Number.parseInt(expanded.slice(0, 2), 16), g: Number.parseInt(expanded.slice(2, 4), 16), b: Number.parseInt(expanded.slice(4, 6), 16), a: 1 };
};

const truncate = (value: string, max: number) => value.length <= max ? value : `${value.slice(0, max - 1)}…`;

const add = (rows: InspectCssPart[], label: string, value: string | null | undefined) => {
  if (value) rows.push({ label, value });
};

/** Compact, ordered CSS evidence. Values intentionally mirror upstream formatting/truncation. */
export const formatInspectCssParts = (
  measurement: Pick<InspectMeasurement, "padding" | "margin">,
  style: CSSStyleDeclaration,
  sourceColor?: string,
): InspectCssPart[] => {
  const rows: InspectCssPart[] = [];
  const padding = edgeShorthand(measurement.padding);
  const gap = gapShorthand(parseEdge(style.rowGap), parseEdge(style.columnGap));
  add(rows, "padding", padding ? withPx(padding) : null);
  add(rows, "gap", gap ? withPx(gap) : null);
  const margin = edgeShorthand(measurement.margin);
  add(rows, "margin", margin ? withPx(margin) : null);

  const display = style.display.trim();

  if (display && !new Set(["block", "inline", "inline-block"]).has(display)) rows.push({ label: "display", value: display });

  if (display === "flex" || display === "inline-flex") {
    add(rows, "flex-direction", style.flexDirection !== "row" ? style.flexDirection : null);
    add(rows, "align-items", !["normal", "stretch"].includes(style.alignItems) ? style.alignItems : null);
    add(rows, "justify-content", !["normal", "flex-start"].includes(style.justifyContent) ? style.justifyContent : null);
  } else if (display === "grid" || display === "inline-grid") {
    add(rows, "grid-template-columns", style.gridTemplateColumns !== "none" ? truncate(style.gridTemplateColumns, 40) : null);
    add(rows, "grid-template-rows", style.gridTemplateRows !== "none" ? truncate(style.gridTemplateRows, 40) : null);
  }

  if (style.position && style.position !== "static") {
    rows.push({ label: "position", value: style.position });
    add(rows, "inset", insetShorthand(style));
  }

  if (style.zIndex.trim() && !["auto", "0"].includes(style.zIndex.trim())) rows.push({ label: "z-index", value: style.zIndex.trim() });
  add(rows, "border", border(style));
  add(rows, "radius", !["", "0px", "0px 0px 0px 0px"].includes(style.borderRadius.trim()) ? style.borderRadius.trim() : null);

  const background = style.backgroundColor.trim();
  const parsedBackground = rgb(background);

  if (background && background !== "transparent" && !(parsedBackground && (parsedBackground.a < 0.001 || (parsedBackground.a >= 0.999 && parsedBackground.r === 255 && parsedBackground.g === 255 && parsedBackground.b === 255)))) {
    rows.push({ label: "background", value: background });
  }

  const color = (sourceColor ?? style.color).trim();
  const parsedColor = rgb(color);

  if (color && !(parsedColor && parsedColor.a >= 0.999 && parsedColor.r === 0 && parsedColor.g === 0 && parsedColor.b === 0)) rows.push({ label: "color", value: color });

  if (style.boxShadow.trim() && style.boxShadow !== "none") rows.push({ label: "box-shadow", value: truncate(style.boxShadow.trim(), 52) });
  const opacity = Number.parseFloat(style.opacity);

  if (Number.isFinite(opacity) && opacity < 0.999) rows.push({ label: "opacity", value: String(round(opacity * 100) / 100) });

  if (style.overflow && style.overflow !== "visible") rows.push({ label: "overflow", value: style.overflow });

  return rows;
};

export const visibleInspectCssParts = (parts: InspectCssPart[], expanded: boolean) => {
  if (expanded || parts.length <= INSPECT_CSS_VISIBLE_ROWS) return { visible: parts, hiddenCount: 0 };

  return { visible: parts.slice(0, INSPECT_CSS_VISIBLE_ROWS), hiddenCount: parts.length - INSPECT_CSS_VISIBLE_ROWS };
};
