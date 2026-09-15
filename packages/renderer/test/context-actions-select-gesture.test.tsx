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

describe("ContextActions Select gesture ownership", () => {
  it("abandons an open draft when the renderer model records Select pointerdown", async () => {
    const page = document.createElement("div");
    const a = document.createElement("div");
    const b = document.createElement("div");
    a.dataset.testid = "select-a";
    b.dataset.testid = "select-b";
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
        onCopy={async () => undefined}
        onController={(value) => { controller = value; }}
      />
    ), host);
    mounted.push(() => {
      dispose();
      runtime.dispose();
      model.dispose();
    });
    await settle();

    expect(controller).not.toBeNull();
    controller!.openNoteComposer();
    await settle();

    const textarea = host.querySelector<HTMLTextAreaElement>("[data-mesurer-annotation-composer='true'] textarea");
    expect(textarea).not.toBeNull();
    textarea!.value = "abandoned draft A";
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(textarea!.value).toBe("abandoned draft A");
    expect(runtime.selectGestureActive()).toBe(false);

    // This is the exact synchronous model mutation performed by Mesurer's
    // canonical Select pointerdown path. No DOM pointer listener participates in
    // this test, so only the workspace-model ownership path can clear the draft.
    model.setTransient({
      start: { x: 330, y: 160 },
      end: { x: 330, y: 160 },
      isDragging: false,
      selectionOriginRect: null,
    });
    expect(runtime.selectGestureActive()).toBe(true);
    flush();
    expect(host.querySelector("[data-mesurer-annotation-composer='true']")).toBeNull();

    // Complete the same handoff and prove the abandoned text cannot migrate to B.
    model.setSelectedMeasurements([measurementB], measurementB);
    model.setTransient({ start: null, end: null, isDragging: false });
    flush();
    expect(runtime.selectGestureActive()).toBe(false);

    controller!.openNoteComposer();
    await settle();
    const freshTextarea = host.querySelector<HTMLTextAreaElement>("[data-mesurer-annotation-composer='true'] textarea");
    expect(freshTextarea).not.toBeNull();
    expect(freshTextarea!.value).toBe("");
  });
});
