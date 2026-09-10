import { afterEach, describe, expect, it } from "vitest";
import {
  getSelectionEntries,
  getSnappedClickTarget,
  getTargetElement,
} from "../src/core/selection";
import { getFrameToken } from "../src/core/dom";
import { getDeepestElementAtPoint, isElementWithinDomTarget } from "@jhomra21/mesurer-solid-dom";

const originalDocumentElementFromPoint = document.elementFromPoint;

const setRect = (element: Element, rect: { left: number; top: number; width: number; height: number }) => {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
  });
};

const nextDomCacheFrame = async () => {
  const frame = getFrameToken();
  while (getFrameToken() === frame) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
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

  it("never exposes Mesurer-owned inspector UI as a page selection target", async () => {
    const pageTarget = document.createElement("main");
    const pageButton = document.createElement("button");
    const inspector = document.createElement("div");
    const typographyCard = document.createElement("div");
    const point = { x: 40, y: 40 };

    inspector.dataset.mesurerInspectorUi = "true";
    typographyCard.className = "mesurer-ti-card";
    setRect(pageTarget, { left: 0, top: 0, width: 300, height: 200 });
    setRect(pageButton, { left: 20, top: 20, width: 120, height: 40 });
    setRect(inspector, { left: 10, top: 10, width: 200, height: 120 });
    setRect(typographyCard, { left: 20, top: 20, width: 160, height: 80 });
    pageTarget.append(pageButton, inspector);
    inspector.append(typographyCard);
    document.body.append(pageTarget);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => typographyCard });

    expect(getTargetElement(point, null, document, pageTarget)).toBeNull();
    expect(getSnappedClickTarget(point, null, true, document, pageTarget)).toBeNull();

    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => pageButton });
    expect(getTargetElement(point, null, document, pageTarget)).toBe(pageButton);

    // Rectangle selection intentionally uses a per-frame candidate cache. Move
    // into a fresh frame so this assertion owns the DOM it just installed rather
    // than a prior test's same-frame candidate list.
    await nextDomCacheFrame();
    const entries = getSelectionEntries(
      { left: 0, top: 0, width: 240, height: 160 },
      null,
      document,
      pageTarget,
    );
    expect(entries.some(({ element }) => element === inspector || element === typographyCard)).toBe(false);
    expect(entries.some(({ element }) => element === pageButton)).toBe(true);
  });
});
