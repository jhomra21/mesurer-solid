import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeasurementBox } from "../src/components/MeasurementBox";
import type { InspectMeasurement, Measurement } from "../src/core/types";
import { render } from "../src/solid-dom";

const disposers: Array<() => void> = [];

const settle = async () => {
  await Promise.resolve();
  flush();
  await Promise.resolve();
  flush();
};

afterEach(async () => {
  while (disposers.length) disposers.pop()?.();
  await settle();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const renderMeasurement = (
  measurement: Measurement | InspectMeasurement,
  options: { showLabel?: boolean } = {},
) => {
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(render(
    () => <MeasurementBox
      measurement={measurement}
      outlineColor="#0d99ff"
      fillColor="rgba(13,153,255,.08)"
      showLabel={options.showLabel}
    />,
    host,
  ));
  const root = host.querySelector<HTMLElement>("[data-mesurer-measurement='true']");
  if (!root) throw new Error(`Expected measurement root: ${host.innerHTML}`);
  const chrome = root.children.item(0);
  const label = root.children.item(root.children.length - 1);
  if (!(chrome instanceof HTMLElement) || !(label instanceof HTMLElement)) {
    throw new Error(`Expected measurement chrome and label: ${host.innerHTML}`);
  }
  return { host, root, chrome, label };
};

const setRect = (
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) => {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
};

describe("measurement scroll geometry", () => {
  it("keeps selected element chrome instantaneous so it cannot trail the page while scrolling", () => {
    const selected: InspectMeasurement = {
      id: "selected",
      rect: { left: 40, top: 120, width: 220, height: 44 },
      paddingRect: { left: 40, top: 120, width: 220, height: 44 },
      marginRect: { left: 40, top: 120, width: 220, height: 44 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      label: "p.selection",
    };

    const { root, chrome, label } = renderMeasurement(selected);

    expect(root.dataset.mesurerSelectedMeasurement).toBe("true");
    expect(chrome.style.transition).toBe("none");
    expect(label.style.transition).toBe("none");
  });

  it("moves the selected-target paint companion into the document layer without inventing another selected root", async () => {
    class TestResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);

    const target = document.createElement("div");
    setRect(target, { left: 36, top: 84, width: 240, height: 52 });
    document.body.append(target);

    const measurement: Measurement = {
      id: "selection-companion",
      rect: { left: 36, top: 84, width: 240, height: 52 },
      normalizedRect: { left: 0, top: 0, width: 1, height: 1 },
      elementRef: target,
      deltaX: 0,
      deltaY: 0,
    };

    const { host } = renderMeasurement(measurement, { showLabel: false });
    await settle();

    const root = document.body.querySelector<HTMLElement>("[data-mesurer-selection-companion='true']");
    expect(root).not.toBeNull();
    expect(root?.parentElement).toBe(document.body);
    expect(root?.dataset.mesurerSelectedMeasurement).toBeUndefined();
    expect(host.querySelector("[data-mesurer-selection-companion='true']")).toBeNull();

    const chrome = root?.querySelector<HTMLElement>("[data-mesurer-measurement-chrome='true']");
    expect(chrome).not.toBeNull();
    expect(chrome?.style.transition).toBe("none");
    expect(chrome?.style.zIndex).toBe("2147482800");
    expect(root?.querySelector("[data-mesurer-measurement-label='true']")).toBeNull();
  });

  it("retains the existing easing for ordinary measurement motion", () => {
    const measurement: Measurement = {
      id: "measurement",
      rect: { left: 10, top: 20, width: 80, height: 40 },
      normalizedRect: { left: 0.1, top: 0.2, width: 0.8, height: 0.4 },
      deltaX: 0,
      deltaY: 0,
    };

    const { root, chrome, label } = renderMeasurement(measurement);

    expect(root.dataset.mesurerSelectedMeasurement).toBeUndefined();
    expect(root.dataset.mesurerSelectionCompanion).toBeUndefined();
    expect(chrome.style.transition).toContain("left 140ms ease");
    expect(chrome.style.transition).toContain("top 140ms ease");
    expect(label.style.transition).toContain("left 140ms ease");
    expect(label.style.transition).toContain("top 140ms ease");
  });
});
