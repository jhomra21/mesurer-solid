import { afterEach, describe, expect, it } from "vitest";
import { MeasurementBox } from "../src/components/MeasurementBox";
import { DistanceOverlayItem } from "../src/components/DistanceOverlayItem";
import type { DistanceOverlay, InspectMeasurement } from "../src/core/types";
import { createElement, render } from "../src/solid-dom";

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
});

describe("upstream Mesurer visual contracts", () => {
  it("applies compiler-hoisted static props when creating universal DOM elements", () => {
    const element = createElement("div", {
      class: "adapter-class",
      "data-adapter": true,
    }) as HTMLElement;
    expect(element.className).toBe("adapter-class");
    expect(element.hasAttribute("data-adapter")).toBe(true);
  });

  it("renders measurement tags as upstream width x height without element labels", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const measurement: InspectMeasurement = {
      id: "selected",
      rect: { left: 10, top: 20, width: 80, height: 40 },
      paddingRect: { left: 10, top: 20, width: 80, height: 40 },
      marginRect: { left: 10, top: 20, width: 80, height: 40 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      label: "div#should-not-render",
    };

    disposers.push(render(
      () => <MeasurementBox measurement={measurement} outlineColor="#0d99ff" fillColor="rgba(13,153,255,.08)" />,
      host,
    ));

    expect(host.textContent?.trim()).toBe("80 x 40");
    expect(host.textContent).not.toContain("div#should-not-render");
    expect(host.textContent).not.toContain("×");
    const tag = host.querySelector<HTMLElement>('[class*="msr:bg-ink-900/90"]');
    expect(tag, `Rendered measurement HTML: ${host.innerHTML}`).toBeTruthy();
    expect(tag!.className).toContain("msr:text-[10px]");
    expect(tag!.className).toContain("msr:rounded");
  });

  it("renders upstream distance outlines, dashed connectors, solid blue distance line, and tag", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const distance: DistanceOverlay = {
      id: "distance",
      rectA: { left: 0, top: 0, width: 20, height: 20 },
      rectB: { left: 44, top: 0, width: 20, height: 20 },
      normalizedRectA: { left: 0, top: 0, width: 0.2, height: 0.2 },
      normalizedRectB: { left: 0.44, top: 0, width: 0.2, height: 0.2 },
      horizontal: { x1: 20, x2: 44, y: 10, value: 24 },
      vertical: null,
      connectors: [{ x1: 20, y1: 0, x2: 20, y2: 20 }],
    };

    disposers.push(render(() => <DistanceOverlayItem distance={distance} />, host));

    const outlines = host.querySelectorAll('[class*="msr:border-[#2563eb]/70"]');
    expect(outlines.length, `Rendered distance HTML: ${host.innerHTML}`).toBeGreaterThanOrEqual(2);
    expect(host.querySelector('[class*="msr:border-dashed"]')).toBeTruthy();
    expect(host.querySelector('[class*="msr:bg-[#2563eb]"]')).toBeTruthy();
    expect(host.textContent?.trim()).toBe("24");
  });
});
