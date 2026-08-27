import { afterEach, describe, expect, it } from "vitest";
import {
  getSnappedClickTarget,
  getTargetElement,
} from "../src/core/selection";
import { getDeepestElementAtPoint, isElementWithinDomTarget } from "@jhomra21/mesurer-solid-dom";

const originalDocumentElementFromPoint = document.elementFromPoint;

const setRect = (element: Element, rect: { left: number; top: number; width: number; height: number }) => {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
  });
};

afterEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: originalDocumentElementFromPoint,
  });
});

describe("root-aware point selection", () => {
  it("keeps snapping inside the direct target ShadowRoot", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    const sibling = document.createElement("button");
    const point = { x: 30, y: 30 };

    setRect(host, { left: 0, top: 0, width: 200, height: 150 });
    setRect(inner, { left: 10, top: 10, width: 40, height: 30 });
    setRect(sibling, { left: 55, top: 10, width: 100, height: 30 });
    shadow.append(inner, sibling);
    document.body.append(host);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => host });
    Object.defineProperty(shadow, "elementFromPoint", { configurable: true, value: () => inner });

    expect(getDeepestElementAtPoint(point, document.body, document)).toBe(inner);
    expect(isElementWithinDomTarget(inner, document.body)).toBe(true);
    expect(getTargetElement(point, null)).toBe(inner);
    expect(getSnappedClickTarget(point, null, true)).toBe(inner);
    expect(getSnappedClickTarget(point, null, false)).toBe(inner);
  });

  it("preserves ordinary light-DOM snapping", () => {
    const container = document.createElement("div");
    const target = document.createElement("button");
    const point = { x: 30, y: 30 };

    setRect(container, { left: 0, top: 0, width: 200, height: 150 });
    setRect(target, { left: 10, top: 10, width: 40, height: 30 });
    container.append(target);
    document.body.append(container);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });

    expect(getSnappedClickTarget(point, null, true)).toBe(target);
  });
});
