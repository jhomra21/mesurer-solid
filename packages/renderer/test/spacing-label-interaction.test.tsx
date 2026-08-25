/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { DistanceOverlayItem, type SelectionSpacingInteraction } from "../src/components/DistanceOverlayItem";
import type { DistanceOverlay } from "../src/core/types";
import { render } from "../src/solid-dom";

const disposers: Array<() => void> = [];

afterEach(() => {
  vi.useRealTimers();
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
});

const distance = (id: string, labelIndex: number, showLabel: boolean): DistanceOverlay => ({
  id,
  rectA: { left: 0, top: 0, width: 20, height: 20 },
  rectB: { left: 44, top: 0, width: 20, height: 20 },
  normalizedRectA: { left: 0, top: 0, width: 0.2, height: 0.2 },
  normalizedRectB: { left: 0.44, top: 0, width: 0.2, height: 0.2 },
  horizontal: {
    x1: 20,
    x2: 44,
    y: 10,
    value: 24,
    labelKey: "shared-horizontal-gap",
    labelIndex,
    labelCount: 2,
    showLabel,
  },
  vertical: null,
  connectors: [],
});

const setup = () => {
  const host = document.createElement("div");
  document.body.append(host);
  const [expandedKey, setExpandedKey] = createSignal<string | null>(null);
  const [pinnedKey, setPinnedKey] = createSignal<string | null>(null);
  const interaction: SelectionSpacingInteraction = {
    expandedKey,
    setExpandedKey,
    pinnedKey,
    setPinnedKey,
  };

  disposers.push(render(() => <>
    <DistanceOverlayItem
      distance={distance("pair-a", 0, true)}
      showRects={false}
      kind="selection-spacing"
      spacingInteraction={interaction}
    />
    <DistanceOverlayItem
      distance={distance("pair-b", 1, false)}
      showRects={false}
      kind="selection-spacing"
      spacingInteraction={interaction}
    />
  </>, host));

  const labels = [...host.querySelectorAll<HTMLElement>('[data-mesurer-distance-label-key="shared-horizontal-gap"]')];
  expect(labels).toHaveLength(2);
  const primary = labels.find((label) => label.getAttribute("data-mesurer-distance-label-state") === "primary")!;
  const duplicate = labels.find((label) => label.getAttribute("data-mesurer-distance-label-state") === "duplicate")!;

  primary.getBoundingClientRect = () => ({
    x: 100, y: 100, left: 100, top: 100, right: 120, bottom: 116, width: 20, height: 16, toJSON: () => ({}),
  });
  duplicate.getBoundingClientRect = () => ({
    x: 100, y: 116, left: 100, top: 116, right: 120, bottom: 132, width: 20, height: 16, toJSON: () => ({}),
  });

  return { host, primary, duplicate };
};

const mouse = (target: EventTarget, type: string, init: MouseEventInit = {}) => {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 110, clientY: 108, ...init }));
};

describe("selection spacing label fan-out interaction", () => {
  it("keeps a hover fan-out open while the pointer crosses the group envelope", async () => {
    vi.useFakeTimers();
    const { primary, duplicate } = setup();

    mouse(primary, "mouseenter");
    expect(duplicate.getAttribute("data-mesurer-distance-label")).toBe("true");

    mouse(primary, "mouseleave", { relatedTarget: null });
    mouse(document, "pointermove", { clientX: 110, clientY: 122 });
    await vi.advanceTimersByTimeAsync(350);
    expect(duplicate.getAttribute("data-mesurer-distance-label")).toBe("true");

    mouse(document, "pointermove", { clientX: 300, clientY: 300 });
    await vi.advanceTimersByTimeAsync(350);
    expect(duplicate.getAttribute("data-mesurer-distance-label")).toBe("hidden");
  });

  it("does not let hover immediately reopen a group that was explicitly unpinned", () => {
    const { primary, duplicate } = setup();

    mouse(primary, "mouseenter");
    mouse(primary, "mousedown");
    expect(duplicate.getAttribute("data-mesurer-distance-label")).toBe("true");

    mouse(primary, "mousedown");
    expect(duplicate.getAttribute("data-mesurer-distance-label")).toBe("hidden");

    mouse(primary, "mouseenter");
    expect(duplicate.getAttribute("data-mesurer-distance-label")).toBe("hidden");

    mouse(document, "pointermove", { clientX: 300, clientY: 300 });
    mouse(primary, "mouseenter");
    expect(duplicate.getAttribute("data-mesurer-distance-label")).toBe("true");
  });
});
