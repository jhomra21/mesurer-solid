import type { Point, Rect } from "./types";

type FrameMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  x: number;
  y: number;
};

const outsidePoint = (): Point => ({ x: -1, y: -1 });

const scaleValue = (value: string) => {
  const parsed = Number.parseFloat(value);

  return parsed * (value.endsWith("%") ? 0.01 : 1);
};

const frameElementForDocument = (ownerDocument: Document): Element | null => {
  try {
    return ownerDocument.defaultView?.frameElement ?? null;
  } catch {
    return null;
  }
};

export const isFrameElement = (element: Element): element is HTMLIFrameElement => {
  const Frame = element.ownerDocument.defaultView?.HTMLIFrameElement;

  return Boolean(Frame && element instanceof Frame);
};

export const getAccessibleFrameDocument = (element: Element): Document | null => {
  if (!isFrameElement(element)) return null;

  try {
    return element.contentDocument;
  } catch {
    return null;
  }
};

const matrixConstructorFor = (view: Window) => {
  // SAFETY: the inspected document's Window owns the DOM matrix constructors
  // used to parse its computed transform.
  const realm = view as Window & typeof globalThis;

  return realm.DOMMatrixReadOnly ?? realm.DOMMatrix;
};

const shadowHost = (element: Element) => {
  const root = element.getRootNode();

  if (!("host" in root)) return null;

  return root.host instanceof Element ? root.host : null;
};

const resolvedBorderBox = (
  value: string | undefined,
  fallback: number,
  extras: string[],
) => {
  if (!value?.endsWith("px")) return fallback;

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) return fallback;

  return parsed + extras.reduce(
    (sum, extra) => sum + (Number.parseFloat(extra) || 0),
    0,
  );
};

const frameMatrix = (frame: Element): FrameMatrix | null => {
  const view = frame.ownerDocument.defaultView;

  if (!view) return null;

  let a = 1;
  let b = 0;
  let c = 0;
  let d = 1;
  let frameStyle: CSSStyleDeclaration | null = null;
  let current: Element | null = frame;

  while (current) {
    const style = view.getComputedStyle(current);

    if (current === frame) frameStyle = style;

    const Matrix = matrixConstructorFor(view);

    let transform = {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      is2D: true,
    };

    if (style.transform && style.transform !== "none") {
      if (!Matrix) return null;

      const parsed = new Matrix(style.transform);

      if (parsed.is2D === false) return null;

      transform = {
        a: parsed.a,
        b: parsed.b,
        c: parsed.c,
        d: parsed.d,
        is2D: true,
      };
    }

    if (style.perspective && style.perspective !== "none") return null;

    const rotationParts = (style.rotate || "none").split(/\s+/);
    const axisRotation = rotationParts.length === 4;

    const supportedAxis = !axisRotation
      || (
        Number(rotationParts[0]) === 0
        && Number(rotationParts[1]) === 0
        && Number(rotationParts[2]) !== 0
      );

    if (!supportedAxis) return null;

    if (
      rotationParts.length > 1
      && rotationParts.length !== 2
      && !axisRotation
    ) {
      return null;
    }

    if (
      rotationParts.length === 2
      && rotationParts[0] !== "z"
    ) {
      return null;
    }

    const zoom = scaleValue(style.zoom || "1") || 1;

    const scaleParts = !style.scale || style.scale === "none"
      ? [1, 1]
      : style.scale.split(/\s+/).map(scaleValue);

    const rotation = rotationParts.at(-1) ?? "0";
    const angle = Number.parseFloat(rotation) || 0;

    const radians = (
      rotation.endsWith("grad")
        ? angle * Math.PI / 200
        : rotation.endsWith("rad")
          ? angle
          : rotation.endsWith("turn")
            ? angle * Math.PI * 2
            : angle * Math.PI / 180
    ) * (
      axisRotation
        ? Math.sign(Number(rotationParts[2]))
        : 1
    );

    const sx = Number.isFinite(scaleParts[0]) ? scaleParts[0] ?? 1 : 1;
    const sy = Number.isFinite(scaleParts[1])
      ? scaleParts[1] ?? sx
      : sx;

    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const aa = zoom * (cos * sx * transform.a - sin * sy * transform.b);
    const bb = zoom * (sin * sx * transform.a + cos * sy * transform.b);
    const cc = zoom * (cos * sx * transform.c - sin * sy * transform.d);
    const dd = zoom * (sin * sx * transform.c + cos * sy * transform.d);

    const nextA = aa * a + cc * b;
    const nextB = bb * a + dd * b;
    const nextC = aa * c + cc * d;
    const nextD = bb * c + dd * d;

    a = nextA;
    b = nextB;
    c = nextC;
    d = nextD;
    current = current.parentElement ?? shadowHost(current);
  }

  const rect = frame.getBoundingClientRect();

  if (!(frame instanceof view.HTMLElement)) return null;

  const style = frameStyle;
  const contentBox = style?.boxSizing !== "border-box";

  const width = resolvedBorderBox(
    style?.width,
    frame.offsetWidth,
    contentBox
      ? [
          style?.paddingLeft ?? "0",
          style?.paddingRight ?? "0",
          style?.borderLeftWidth ?? "0",
          style?.borderRightWidth ?? "0",
        ]
      : [],
  );

  const height = resolvedBorderBox(
    style?.height,
    frame.offsetHeight,
    contentBox
      ? [
          style?.paddingTop ?? "0",
          style?.paddingBottom ?? "0",
          style?.borderTopWidth ?? "0",
          style?.borderBottomWidth ?? "0",
        ]
      : [],
  );

  const matrix = {
    a,
    b,
    c,
    d,
    x: rect.left
      - Math.min(0, a * width, c * height, a * width + c * height)
      + a * (
        frame.clientLeft
        + (Number.parseFloat(style?.paddingLeft ?? "0") || 0)
      )
      + c * (
        frame.clientTop
        + (Number.parseFloat(style?.paddingTop ?? "0") || 0)
      ),
    y: rect.top
      - Math.min(0, b * width, d * height, b * width + d * height)
      + b * (
        frame.clientLeft
        + (Number.parseFloat(style?.paddingLeft ?? "0") || 0)
      )
      + d * (
        frame.clientTop
        + (Number.parseFloat(style?.paddingTop ?? "0") || 0)
      ),
  };

  return Object.values(matrix).every(Number.isFinite) ? matrix : null;
};

const applyMatrix = (matrix: FrameMatrix, point: Point): Point => ({
  x: matrix.a * point.x + matrix.c * point.y + matrix.x,
  y: matrix.b * point.x + matrix.d * point.y + matrix.y,
});

const inverseMatrix = (matrix: FrameMatrix, point: Point): Point => {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;

  if (Math.abs(determinant) < 1e-12) return outsidePoint();

  const x = point.x - matrix.x;
  const y = point.y - matrix.y;

  return {
    x: (matrix.d * x - matrix.c * y) / determinant,
    y: (matrix.a * y - matrix.b * x) / determinant,
  };
};

export const framePointToParent = (
  frame: Element,
  point: Point,
): Point => {
  const matrix = frameMatrix(frame);

  return matrix ? applyMatrix(matrix, point) : outsidePoint();
};

export const parentPointToFrame = (
  frame: Element,
  point: Point,
): Point => {
  const matrix = frameMatrix(frame);

  return matrix ? inverseMatrix(matrix, point) : outsidePoint();
};

export const projectPoint = (
  point: Point,
  source: Document,
  target?: Document,
): Point => {
  const ancestors = new Map<Document, Element[]>();
  let current = source;
  const upward: Element[] = [];

  while (!ancestors.has(current)) {
    ancestors.set(current, [...upward]);

    const frame = frameElementForDocument(current);

    if (!frame) break;

    upward.push(frame);
    current = frame.ownerDocument;
  }

  const downward: Element[] = [];

  if (target) {
    current = target;

    const seen = new Set<Document>();

    while (!ancestors.has(current)) {
      if (seen.has(current)) return outsidePoint();

      seen.add(current);

      const frame = frameElementForDocument(current);

      if (!frame) return outsidePoint();

      downward.push(frame);
      current = frame.ownerDocument;
    }
  }

  let result = point;

  for (const frame of ancestors.get(current) ?? []) {
    const matrix = frameMatrix(frame);

    if (!matrix) return outsidePoint();

    result = applyMatrix(matrix, result);
  }

  for (const frame of downward.reverse()) {
    const matrix = frameMatrix(frame);

    if (!matrix) return outsidePoint();

    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;

    if (Math.abs(determinant) < 1e-12) return outsidePoint();

    result = inverseMatrix(matrix, result);
  }

  return result;
};

export const projectRect = (
  rect: Rect,
  source: Document,
): Rect => {
  if (!frameElementForDocument(source)) return rect;

  let points = [
    { x: rect.left, y: rect.top },
    { x: rect.left + rect.width, y: rect.top },
    { x: rect.left, y: rect.top + rect.height },
    { x: rect.left + rect.width, y: rect.top + rect.height },
  ];

  let current = source;
  const seen = new Set<Document>();

  while (!seen.has(current)) {
    seen.add(current);

    const frame = frameElementForDocument(current);

    if (!frame) break;

    const matrix = frameMatrix(frame);

    if (!matrix) return {
      left: -1,
      top: -1,
      width: 0,
      height: 0,
    };

    points = points.map((point) => applyMatrix(matrix, point));
    current = frame.ownerDocument;
  }

  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
};
