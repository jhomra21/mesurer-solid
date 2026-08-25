const LABEL_GAP = 2;
const MAX_LANES = 64;
const COLLISION_X = "--mesurer-spacing-label-collision-x";
const COLLISION_Y = "--mesurer-spacing-label-collision-y";

type ScheduledLayout = {
  frame: number;
  dirty: boolean;
};

const scheduledLayouts = new WeakMap<HTMLElement, ScheduledLayout>();

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

const currentOffset = (label: HTMLElement, name: string) => {
  const value = Number.parseFloat(label.style.getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
};

const setOffset = (label: HTMLElement, name: string, current: number, next: number) => {
  if (Math.abs(current - next) < 0.5) return;
  if (next === 0) label.style.removeProperty(name);
  else label.style.setProperty(name, `${next}px`);
};

export const layoutSpacingLabels = (scope: HTMLElement) => {
  const ownerWindow = scope.ownerDocument.defaultView;
  if (!ownerWindow) return;

  const labels = [...scope.querySelectorAll<HTMLElement>(
    '[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-label="true"]',
  )];
  const placed: Box[] = [];

  for (const label of labels) {
    const offsetX = currentOffset(label, COLLISION_X);
    const offsetY = currentOffset(label, COLLISION_Y);
    const rendered = label.getBoundingClientRect();
    const baseBox: Box = {
      left: rendered.left - offsetX,
      top: rendered.top - offsetY,
      right: rendered.right - offsetX,
      bottom: rendered.bottom - offsetY,
      width: rendered.width,
      height: rendered.height,
    };
    const axis = label.getAttribute("data-mesurer-distance-label-axis");
    const step = axis === "x" ? baseBox.height + LABEL_GAP : baseBox.width + LABEL_GAP;
    let chosen = baseBox;
    let chosenX = 0;
    let chosenY = 0;
    let found = false;

    for (let index = 0; index < MAX_LANES; index += 1) {
      const amount = lane(index) * step;
      const x = axis === "y" ? amount : 0;
      const y = axis === "x" ? amount : 0;
      const candidate = movedBox(baseBox, x, y);
      if (!insideViewport(candidate, ownerWindow.innerWidth, ownerWindow.innerHeight)) continue;
      if (placed.some((other) => overlaps(candidate, other))) continue;
      chosen = candidate;
      chosenX = x;
      chosenY = y;
      found = true;
      break;
    }

    if (!found) {
      for (let index = 0; index < MAX_LANES; index += 1) {
        const amount = lane(index) * step;
        const x = axis === "y" ? amount : 0;
        const y = axis === "x" ? amount : 0;
        const candidate = movedBox(baseBox, x, y);
        if (placed.some((other) => overlaps(candidate, other))) continue;
        chosen = candidate;
        chosenX = x;
        chosenY = y;
        break;
      }
    }

    setOffset(label, COLLISION_X, offsetX, chosenX);
    setOffset(label, COLLISION_Y, offsetY, chosenY);
    placed.push(chosen);
  }
};

export const scheduleSpacingLabelLayout = (scope: HTMLElement) => {
  const pending = scheduledLayouts.get(scope);
  if (pending) {
    pending.dirty = true;
    return;
  }
  const ownerWindow = scope.ownerDocument.defaultView;
  if (!ownerWindow) return;
  const frame = ownerWindow.requestAnimationFrame(() => {
    scheduledLayouts.delete(scope);
    if (!scope.isConnected) return;
    layoutSpacingLabels(scope);
    if (state.dirty) scheduleSpacingLabelLayout(scope);
  });
  const state: ScheduledLayout = { frame, dirty: false };
  scheduledLayouts.set(scope, state);
};
