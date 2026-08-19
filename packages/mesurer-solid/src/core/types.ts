// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.

export type Point = {
  x: number;
  y: number;
};

export type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type NormalizedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type BoxEdges = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type InspectMeasurement = {
  id: string;
  rect: Rect;
  paddingRect: Rect;
  marginRect: Rect;
  padding: BoxEdges;
  margin: BoxEdges;
  label: string;
  elementRef?: HTMLElement | null;
  originRect?: Rect;
};

export type Guide = {
  id: string;
  orientation: "vertical" | "horizontal";
  position: number;
};

export type ToolMode =
  | "none"
  | "select"
  | "guides"
  | "text-inspector"
  | "xray"
  | "rulers";
