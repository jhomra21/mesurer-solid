import { afterEach, describe, expect, it } from "vitest";
import { MeasurementBox } from "../src/components/MeasurementBox";
import type { InspectMeasurement, Measurement } from "../src/core/types";
import { render } from "../src/solid-dom";

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
});

const renderMeasurement = (measurement: Measurement | InspectMeasurement) => {
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(render(
    () => <MeasurementBox measurement={measurement} outlineColor="#0d99ff" fillColor="rgba(13,153,255,.08)" />,
    host,
  ));
  const root = host.querySelector<HTMLElement>("[data-mesurer-measurement='true']");
  expect(root).toBeTruthy();
  const chrome = root!.children.item(0) as HTMLElement | null;
  const label = root!.children.item(root!.children.length - 1) as HTMLElement | null;
  expect(chrome).toBeTruthy();
  expect(label).toBeTruthy();
  return { root: root!, chrome: chrome!, label: label! };
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
    expect(chrome.style.transition).toContain("left 140ms ease");
    expect(chrome.style.transition).toContain("top 140ms ease");
    expect(label.style.transition).toContain("left 140ms ease");
    expect(label.style.transition).toContain("top 140ms ease");
  });
});
