import { afterEach, describe, expect, it } from "vitest";
import { MeasurementBox } from "../src/components/MeasurementBox";
import { DistanceOverlayItem } from "../src/components/DistanceOverlayItem";
import { DEFAULT_SELECTION_SPACING_STYLE } from "../src/core/persistence";
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

  it("renders automatic selection spacing without duplicating selected-element outlines", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const distance: DistanceOverlay = {
      id: "selection-spacing:x:a:b",
      rectA: { left: 0, top: 0, width: 20, height: 20 },
      rectB: { left: 44, top: 0, width: 20, height: 20 },
      normalizedRectA: { left: 0, top: 0, width: 0.2, height: 0.2 },
      normalizedRectB: { left: 0.44, top: 0, width: 0.2, height: 0.2 },
      horizontal: { x1: 20, x2: 44, y: 10, value: 24 },
      vertical: null,
      connectors: [],
    };

    disposers.push(render(
      () => <DistanceOverlayItem distance={distance} showRects={false} kind="selection-spacing" />,
      host,
    ));

    expect(host.querySelector('[data-mesurer-distance-kind="selection-spacing"]')).toBeTruthy();
    expect(host.querySelectorAll('[class*="msr:border-[#2563eb]/70"]')).toHaveLength(0);
    const guide = host.querySelector<HTMLElement>('[data-mesurer-distance-line="horizontal"]');
    expect(guide).toBeTruthy();
    expect(guide!.dataset.mesurerLinePattern).toBe("dashed");
    expect(guide!.dataset.mesurerLineColor).toBe("#2563eb");
    expect(guide!.dataset.mesurerLineWidth).toBe("1");
    expect(guide!.style.backgroundImage).toContain("repeating-linear-gradient");
    expect(host.textContent?.trim()).toBe("24");
  });

  it("applies custom selection-spacing color, weight, opacity, and dotted pattern", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const distance: DistanceOverlay = {
      id: "selection-spacing:x:a:b",
      rectA: { left: 0, top: 0, width: 20, height: 20 },
      rectB: { left: 44, top: 0, width: 20, height: 20 },
      normalizedRectA: { left: 0, top: 0, width: 0.2, height: 0.2 },
      normalizedRectB: { left: 0.44, top: 0, width: 0.2, height: 0.2 },
      horizontal: { x1: 20, x2: 44, y: 10, value: 24 },
      vertical: null,
      connectors: [],
    };
    const selectionSpacingStyle = { ...DEFAULT_SELECTION_SPACING_STYLE, color: "#ff00aa", width: 3, opacity: 0.5, pattern: "dotted" as const, dashLength: 5, gap: 2 };

    disposers.push(render(() => <DistanceOverlayItem distance={distance} showRects={false} kind="selection-spacing" selectionSpacingStyle={selectionSpacingStyle} />, host));

    const guide = host.querySelector<HTMLElement>('[data-mesurer-distance-line="horizontal"]');
    expect(guide).toBeTruthy();
    expect(guide!.dataset.mesurerLinePattern).toBe("dotted");
    expect(guide!.dataset.mesurerLineColor).toBe("#ff00aa");
    expect(guide!.dataset.mesurerLineWidth).toBe("3");
    expect(guide!.style.height).toBe("3px");
    expect(guide!.style.opacity).toBe("0.5");
    expect(guide!.style.backgroundImage).toContain("radial-gradient");
  });

  it("renders every nested selection edge distance as a dashed side guide", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const distance: DistanceOverlay = {
      id: "selection-spacing:pair:child:parent",
      rectA: { left: 20, top: 20, width: 100, height: 100 },
      rectB: { left: 40, top: 50, width: 40, height: 60 },
      normalizedRectA: { left: 0.02, top: 0.02, width: 0.1, height: 0.1 },
      normalizedRectB: { left: 0.04, top: 0.05, width: 0.04, height: 0.06 },
      horizontal: { x1: 20, x2: 40, y: 80, value: 20 },
      vertical: { y1: 110, y2: 120, x: 60, value: 10 },
      edgeDistances: [
        { axis: "x", side: "left", x1: 20, x2: 40, y: 80, value: 20 },
        { axis: "x", side: "right", x1: 120, x2: 80, y: 80, value: 40 },
        { axis: "y", side: "top", y1: 20, y2: 50, x: 60, value: 30 },
        { axis: "y", side: "bottom", y1: 120, y2: 110, x: 60, value: 10 },
      ],
      connectors: [],
    };

    disposers.push(render(
      () => <DistanceOverlayItem distance={distance} showRects={false} kind="selection-spacing" />,
      host,
    ));

    const sideGuides = [...host.querySelectorAll<HTMLElement>('[data-mesurer-distance-line]')];
    expect(sideGuides.map((guide) => guide.dataset.mesurerDistanceLine).sort()).toEqual([
      "horizontal-left",
      "horizontal-right",
      "vertical-bottom",
      "vertical-top",
    ]);
    expect(sideGuides.every((guide) => guide.dataset.mesurerLinePattern === "dashed")).toBe(true);
    expect(host.textContent?.replace(/\s+/g, " ").trim()).toContain("20");
    expect(host.textContent?.replace(/\s+/g, " ").trim()).toContain("40");
    expect(host.textContent?.replace(/\s+/g, " ").trim()).toContain("30");
    expect(host.textContent?.replace(/\s+/g, " ").trim()).toContain("10");

    const labels = [...host.querySelectorAll<HTMLElement>("[data-mesurer-distance-label]")];
    expect(labels.find((element) => element.textContent?.trim() === "30")?.style.top).toBe("35px");
    expect(labels.find((element) => element.textContent?.trim() === "10")?.style.top).toBe("115px");
  });

  it("tracks visible edge segments and pins fully offscreen labels", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const distance: DistanceOverlay = {
      id: "selection-spacing:offscreen:parent:child",
      rectA: { left: 0, top: -500, width: 100, height: 1000 },
      rectB: { left: 40, top: -200, width: 20, height: 200 },
      elementRefA: document.body,
      normalizedRectA: { left: 0, top: 0, width: 0.1, height: 1 },
      normalizedRectB: { left: 0.04, top: 0, width: 0.02, height: 0.2 },
      horizontal: null,
      vertical: null,
      edgeDistances: [
        { axis: "y", side: "top", y1: -500, y2: 200, x: 50, value: 700 },
        { axis: "y", side: "bottom", y1: 600, y2: 1500, x: 50, value: 900 },
        { axis: "y", side: "top", y1: -500, y2: -200, x: 50, value: 300 },
        { axis: "y", side: "bottom", y1: 1000, y2: 1500, x: 50, value: 500 },
        { axis: "x", side: "left", x1: -500, x2: -200, y: 50, value: 300 },
        { axis: "x", side: "right", x1: 1200, x2: 1500, y: 50, value: 500 },
        { axis: "x", side: "right", x1: 100, x2: 300, y: -500, value: 200 },
        { axis: "x", side: "left", x1: 100, x2: 300, y: 1500, value: 200 },
      ],
      connectors: [],
    };

    disposers.push(render(
      () => <DistanceOverlayItem distance={distance} showRects={false} kind="selection-spacing" />,
      host,
    ));

    const labels = [...host.querySelectorAll<HTMLElement>("[data-mesurer-distance-label]")];
    const viewportWidth = document.defaultView?.innerWidth ?? window.innerWidth;
    const viewportHeight = document.defaultView?.innerHeight ?? window.innerHeight;
    expect(labels.map((label) => label.textContent?.trim())).toEqual(["700", "900", "300", "500", "300", "500", "200", "200"]);
    expect(labels.slice(0, 4).map((label) => label.style.top)).toEqual([
      "100px",
      `${(600 + viewportHeight) / 2}px`,
      "20px",
      `${viewportHeight - 20}px`,
    ]);
    expect(labels.slice(4, 6).map((label) => label.style.left)).toEqual(["20px", `${viewportWidth - 20}px`]);
    expect(labels.slice(6).map((label) => label.style.top)).toEqual(["20px", `${viewportHeight - 20}px`]);
  });
});
