import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextActions, type ContextActionsController } from "../src/components/ContextActions";
import { getInspectMeasurement } from "../src/core/dom";
import { createMesurerModel } from "../src/model/create-mesurer-model";
import { createMesurerWorkspaceRuntime } from "../src/runtime/workspace-context";
import { render } from "../src/solid-dom";

const settle = async () => {
  await Promise.resolve();
  flush();
  await Promise.resolve();
  flush();
};

const mounted: Array<() => void> = [];

afterEach(async () => {
  while (mounted.length) mounted.pop()?.();
  await settle();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

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

const mountContextActions = () => {
  const page = document.createElement("div");
  const a = document.createElement("div");
  const b = document.createElement("div");
  a.dataset.testid = "select-a";
  b.dataset.testid = "select-b";
  setRect(a, { left: 40, top: 80, width: 140, height: 44 });
  setRect(b, { left: 220, top: 80, width: 140, height: 44 });
  page.append(a, b);
  const host = document.createElement("div");
  document.body.append(page, host);

  class TestResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", TestResizeObserver);

  const model = createMesurerModel({ initialEnabled: true, initialToolMode: "select" });
  const measurementA = getInspectMeasurement(a, window);
  const measurementB = getInspectMeasurement(b, window);
  model.setSelectedMeasurements([measurementA], measurementA);
  const runtime = createMesurerWorkspaceRuntime({
    model,
    ownerDocument: document,
    ownerWindow: window,
    pageTarget: page,
    uiRoot: host,
  });

  let controller: ContextActionsController | null = null;
  const dispose = render(() => (
    <ContextActions
      runtime={runtime}
      coordinateSpace="viewport"
      onCopy={async () => undefined}
      onController={(value) => { controller = value; }}
    />
  ), host);
  mounted.push(() => {
    dispose();
    runtime.dispose();
    model.dispose();
  });

  return {
    a,
    b,
    host,
    model,
    runtime,
    measurementA,
    measurementB,
    controller: () => controller,
  };
};

describe("ContextActions Select gesture ownership", () => {
  it("registers its controller synchronously and abandons a draft for any active Select state", async () => {
    const { host, model, runtime, measurementB, controller } = mountContextActions();

    // The plugin-level post-commit safety must not depend on an onSettled turn.
    expect(controller()).not.toBeNull();
    controller()!.openNoteComposer();
    await settle();

    const composer = host.querySelector<HTMLElement>("[data-mesurer-annotation-composer='true']");
    const textarea = composer?.querySelector<HTMLTextAreaElement>("textarea") ?? null;
    expect(composer?.dataset.mesurerContextCoordinateSpace).toBe("viewport");
    expect(textarea).not.toBeNull();
    textarea!.value = "abandoned draft A";
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(textarea!.value).toBe("abandoned draft A");
    expect(runtime.selectGestureActive()).toBe(false);

    // This is the exact synchronous model mutation performed by Mesurer's
    // canonical Select pointerdown path. No DOM pointer listener participates.
    model.setTransient({
      start: { x: 330, y: 160 },
      end: { x: 330, y: 160 },
      isDragging: false,
      selectionOriginRect: null,
    });
    expect(runtime.selectGestureActive()).toBe(true);
    flush();
    expect(host.querySelector("[data-mesurer-annotation-composer='true']")).toBeNull();

    // Stay in the same active gesture and publish another model notification.
    // Draft invalidation is state-based, so it cannot depend on observing only
    // one false→true edge.
    model.setTransient({ end: { x: 340, y: 170 } });
    flush();
    expect(host.querySelector("[data-mesurer-annotation-composer='true']")).toBeNull();

    model.setSelectedMeasurements([measurementB], measurementB);
    model.setTransient({ start: null, end: null, isDragging: false });
    flush();
    expect(runtime.selectGestureActive()).toBe(false);

    controller()!.openNoteComposer();
    await settle();
    const freshTextarea = host.querySelector<HTMLTextAreaElement>("[data-mesurer-annotation-composer='true'] textarea");
    expect(freshTextarea).not.toBeNull();
    expect(freshTextarea!.value).toBe("");
  });

  it("keeps marker switching reactive after an annotated target moves", async () => {
    const { a, host, model, runtime, measurementA, measurementB } = mountContextActions();

    model.setSelectedMeasurements([measurementA], measurementA);
    runtime.addSelectionAnnotation("First note");
    model.setSelectedMeasurements([measurementB], measurementB);
    runtime.addSelectionAnnotation("Second note");
    await settle();

    expect(host.querySelectorAll("[data-mesurer-annotation-marker='true']")).toHaveLength(2);

    setRect(a, { left: 40, top: 140, width: 140, height: 44 });
    model.setTransient({ hoverElement: a });
    expect(() => flush()).not.toThrow();

    const markers = host.querySelectorAll<HTMLButtonElement>("[data-mesurer-annotation-marker='true']");
    markers[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    flush();
    expect(host.querySelector("[data-mesurer-annotation-panel-badge='true']")?.textContent).toBe("1");

    markers[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    flush();
    expect(host.querySelector("[data-mesurer-annotation-panel-badge='true']")?.textContent).toBe("2");
  });

  it("never renders a composer whose captured selection no longer owns the runtime", async () => {
    const { host, model, measurementB, controller } = mountContextActions();
    expect(controller()).not.toBeNull();
    controller()!.openNoteComposer();
    await settle();

    const textarea = host.querySelector<HTMLTextAreaElement>("[data-mesurer-annotation-composer='true'] textarea");
    expect(textarea).not.toBeNull();
    textarea!.value = "stale A draft";
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    // A committed selection change is independently sufficient to invalidate
    // the composer even without a gesture edge.
    model.setSelectedMeasurements([measurementB], measurementB);
    flush();
    expect(host.querySelector("[data-mesurer-annotation-composer='true']")).toBeNull();

    controller()!.openNoteComposer();
    await settle();
    const freshTextarea = host.querySelector<HTMLTextAreaElement>("[data-mesurer-annotation-composer='true'] textarea");
    expect(freshTextarea).not.toBeNull();
    expect(freshTextarea!.value).toBe("");
  });
});
