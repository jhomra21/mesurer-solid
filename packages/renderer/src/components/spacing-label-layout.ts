const LABEL_GAP = 2;
const MAX_LANES = 64;
const COLLISION_X = "--mesurer-spacing-label-collision-x";
const COLLISION_Y = "--mesurer-spacing-label-collision-y";

const scheduledLayouts = new WeakMap<HTMLElement, number>();

type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const movedBox = (box: Box, x: number, y: number): Box => ({
  left: box.left + x,
  top: box.top + y,
  right: box.right + x,
  bottom: box.bottom + y,
  width: box.width,
  height: box.height,
});

const overlaps = (first: Box, second: Box) =>
  first.left < second.right + LABEL_GAP
  && first.right + LABEL_GAP > second.left
  && first.top < second.bottom + LABEL_GAP
  && first.bottom + LABEL_GAP > second.top;

const insideViewport = (box: Box, width: number, height: number) =>
  box.left >= LABEL_GAP
  && box.top >= LABEL_GAP
  && box.right <= width - LABEL_GAP
  && box.bottom <= height - LABEL_GAP;

const lane = (index: number) => {
  if (index === 0) return 0;
  const amount = Math.ceil(index / 2);
  return index % 2 === 1 ? amount : -amount;
};

export const layoutSpacingLabels = (scope: HTMLElement) => {
  const ownerWindow = scope.ownerDocument.defaultView;
  if (!ownerWindow) return;

  const allLabels = [...scope.querySelectorAll<HTMLElement>(
    '[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-label]',
  )];
  for (const label of allLabels) {
    label.style.removeProperty(COLLISION_X);
    label.style.removeProperty(COLLISION_Y);
  }

  const labels = allLabels.filter((label) => label.getAttribute("data-mesurer-distance-label") === "true");
  const placed: Box[] = [];

  for (const label of labels) {
    const base = label.getBoundingClientRect();
    const baseBox: Box = {
      left: base.left,
      top: base.top,
      right: base.right,
      bottom: base.bottom,
      width: base.width,
      height: base.height,
    };
    const axis = label.getAttribute("data-mesurer-distance-label-axis");
    const step = axis === "x" ? baseBox.height + LABEL_GAP : baseBox.width + LABEL_GAP;
    let chosen = baseBox;
    let offsetX = 0;
    let offsetY = 0;

    for (let index = 0; index < MAX_LANES; index += 1) {
      const amount = lane(index) * step;
      const x = axis === "y" ? amount : 0;
      const y = axis === "x" ? amount : 0;
      const candidate = movedBox(baseBox, x, y);
      if (!insideViewport(candidate, ownerWindow.innerWidth, ownerWindow.innerHeight)) continue;
      if (placed.some((other) => overlaps(candidate, other))) continue;
      chosen = candidate;
      offsetX = x;
      offsetY = y;
      break;
    }

    if (offsetX) label.style.setProperty(COLLISION_X, `${offsetX}px`);
    if (offsetY) label.style.setProperty(COLLISION_Y, `${offsetY}px`);
    placed.push(chosen);
  }
};

export const scheduleSpacingLabelLayout = (scope: HTMLElement) => {
  if (scheduledLayouts.has(scope)) return;
  const ownerWindow = scope.ownerDocument.defaultView;
  if (!ownerWindow) return;
  const frame = ownerWindow.requestAnimationFrame(() => {
    scheduledLayouts.delete(scope);
    if (scope.isConnected) layoutSpacingLabels(scope);
  });
  scheduledLayouts.set(scope, frame);
};
