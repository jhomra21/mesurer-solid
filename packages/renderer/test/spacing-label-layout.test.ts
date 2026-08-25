/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { layoutSpacingLabels } from "../src/components/spacing-label-layout";

const COLLISION_X = "--mesurer-spacing-label-collision-x";
const COLLISION_Y = "--mesurer-spacing-label-collision-y";
type RectInput = { left: number; top: number; width: number; height: number };

const domRect = ({ left, top, width, height }: RectInput): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  toJSON: () => ({}),
});

const offset = (element: HTMLElement, name: string) =>
  Number.parseFloat(element.style.getPropertyValue(name) || "0");

const setup = () => {
  const scope = document.createElement("div");
  const root = document.createElement("div");
  root.setAttribute("data-mesurer-distance-kind", "selection-spacing");
  scope.append(root);
  document.body.append(scope);
  return { scope, root };
};

const label = (root: HTMLElement, axis: "x" | "y", rect: RectInput, visible = true) => {
  const element = document.createElement("div");
  element.setAttribute("data-mesurer-distance-label", visible ? "true" : "hidden");
  element.setAttribute("data-mesurer-distance-label-axis", axis);
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => domRect({
    ...rect,
    left: rect.left + offset(element, COLLISION_X),
    top: rect.top + offset(element, COLLISION_Y),
  }));
  root.append(element);
  return element;
};

const shifted = (rect: RectInput, x: number, y: number) => ({
  left: rect.left + x,
  top: rect.top + y,
  right: rect.left + rect.width + x,
  bottom: rect.top + rect.height + y,
});

const intersects = (first: ReturnType<typeof shifted>, second: ReturnType<typeof shifted>) =>
  first.left < second.right + 2
  && first.right + 2 > second.left
  && first.top < second.bottom + 2
  && first.bottom + 2 > second.top;

describe("selection spacing label layout", () => {
  it("moves overlapping horizontal labels into vertical lanes", () => {
    const { scope, root } = setup();
    const firstRect = { left: 100, top: 100, width: 30, height: 16 };
    const secondRect = { left: 105, top: 100, width: 30, height: 16 };
    const first = label(root, "x", firstRect);
    const second = label(root, "x", secondRect);

    layoutSpacingLabels(scope);

    const firstX = offset(first, COLLISION_X);
    const firstY = offset(first, COLLISION_Y);
    const secondX = offset(second, COLLISION_X);
    const secondY = offset(second, COLLISION_Y);
    expect(firstX).toBe(0);
    expect(firstY).toBe(0);
    expect(secondX).toBe(0);
    expect(secondY).not.toBe(0);
    expect(intersects(shifted(firstRect, firstX, firstY), shifted(secondRect, secondX, secondY))).toBe(false);
  });

  it("moves overlapping vertical labels into horizontal lanes", () => {
    const { scope, root } = setup();
    const firstRect = { left: 200, top: 120, width: 28, height: 16 };
    const secondRect = { left: 200, top: 124, width: 36, height: 16 };
    const first = label(root, "y", firstRect);
    const second = label(root, "y", secondRect);

    layoutSpacingLabels(scope);

    expect(offset(first, COLLISION_X)).toBe(0);
    expect(offset(second, COLLISION_X)).not.toBe(0);
    expect(offset(second, COLLISION_Y)).toBe(0);
  });

  it("ignores hidden duplicate labels until they become visible", () => {
    const { scope, root } = setup();
    const rect = { left: 300, top: 180, width: 32, height: 16 };
    const first = label(root, "x", rect);
    const hidden = label(root, "x", rect, false);

    layoutSpacingLabels(scope);
    expect(offset(first, COLLISION_Y)).toBe(0);
    expect(offset(hidden, COLLISION_Y)).toBe(0);

    hidden.setAttribute("data-mesurer-distance-label", "true");
    layoutSpacingLabels(scope);
    expect(offset(hidden, COLLISION_Y)).not.toBe(0);
  });

  it("is stable when the desired lanes have not changed", () => {
    const { scope, root } = setup();
    label(root, "x", { left: 100, top: 100, width: 30, height: 16 });
    const second = label(root, "x", { left: 105, top: 100, width: 30, height: 16 });

    layoutSpacingLabels(scope);
    const firstStyle = second.getAttribute("style");
    layoutSpacingLabels(scope);

    expect(second.getAttribute("style")).toBe(firstStyle);
  });
});
