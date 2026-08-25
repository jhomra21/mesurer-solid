/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { layoutSpacingLabels } from "../src/components/spacing-label-layout";

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
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(domRect(rect));
  root.append(element);
  return element;
};

const offset = (element: HTMLElement, name: string) => Number.parseFloat(element.style.getPropertyValue(name) || "0");

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

    const firstX = offset(first, "--mesurer-spacing-label-collision-x");
    const firstY = offset(first, "--mesurer-spacing-label-collision-y");
    const secondX = offset(second, "--mesurer-spacing-label-collision-x");
    const secondY = offset(second, "--mesurer-spacing-label-collision-y");
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

    expect(offset(first, "--mesurer-spacing-label-collision-x")).toBe(0);
    expect(offset(second, "--mesurer-spacing-label-collision-x")).not.toBe(0);
    expect(offset(second, "--mesurer-spacing-label-collision-y")).toBe(0);
  });

  it("ignores hidden duplicate labels until they become visible", () => {
    const { scope, root } = setup();
    const rect = { left: 300, top: 180, width: 32, height: 16 };
    const first = label(root, "x", rect);
    const hidden = label(root, "x", rect, false);

    layoutSpacingLabels(scope);
    expect(offset(first, "--mesurer-spacing-label-collision-y")).toBe(0);
    expect(offset(hidden, "--mesurer-spacing-label-collision-y")).toBe(0);

    hidden.setAttribute("data-mesurer-distance-label", "true");
    layoutSpacingLabels(scope);
    expect(offset(hidden, "--mesurer-spacing-label-collision-y")).not.toBe(0);
  });
});
