import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextActions, type ContextActionsController } from "../src/components/ContextActions";
import { getInspectMeasurement } from "../src/core/dom";
import { createMesurerModel } from "../src/model/create-mesurer-model";
import { createMesurerWorkspaceRuntime } from "../src/runtime/workspace-context";
import { render } from "../src/solid-dom";

const SELECT_GESTURE_START_EVENT = "mesurer:select-gesture-start";

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

describe("ContextActions cross-instance Select ownership", () => {
  it("abandons an open transient draft when another renderer starts a physical Select gesture", async () => {
    const page = document.createElement("div");
    const a = document.createElement("div");
    page.append(a);
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

    // A different live Mesurer input plane can own the physical B press while
    // this Context surface still owns A. The canonical Select plane must
    // broadcast that semantic gesture synchronously; relying on this model's
    // transient state alone cannot observe a cross-instance handoff.
    window.dispatchEvent(new Event(SELECT_GESTURE_START_EVENT));
    flush();

    expect(runtime.selectGestureActive()).toBe(false);
    expect(host.querySelector("[data-mesurer-annotation-composer='true']")).toBeNull();

    controller!.openNoteComposer();
    await settle();
    const freshTextarea = host.querySelector<HTMLTextAreaElement>("[data-mesurer-annotation-composer='true'] textarea");
    expect(freshTextarea).not.toBeNull();
    expect(freshTextarea!.value).toBe("");
  });
});
