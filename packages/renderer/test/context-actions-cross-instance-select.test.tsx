import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContextActionsSelectOwnership,
} from "../src/components/ContextActionsSelectOwnership";
import type { ContextActionsController } from "../src/components/ContextActions";
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
      <ContextActionsSelectOwnership
        runtime={runtime}
        ownerWindow={window}
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

    // A different live Mesurer model owns the physical Select press. Its
    // canonical start transition must invalidate this Context draft even
    // though this runtime's own model remains completely idle.
    const otherRoot = document.createElement("div");
    document.body.append(otherRoot);
    const otherModel = createMesurerModel({ initialEnabled: true, initialToolMode: "select" });
    otherModel.rendererRoot = otherRoot;
    mounted.push(() => otherModel.dispose());

    otherModel.setTransient({ start: { x: 320, y: 180 } });
    flush();

    expect(otherModel.current.start).toEqual({ x: 320, y: 180 });
    expect(runtime.selectGestureActive()).toBe(false);
    expect(host.querySelector("[data-mesurer-annotation-composer='true']")).toBeNull();

    controller!.openNoteComposer();
    await settle();
    const freshTextarea = host.querySelector<HTMLTextAreaElement>("[data-mesurer-annotation-composer='true'] textarea");
    expect(freshTextarea).not.toBeNull();
    expect(freshTextarea!.value).toBe("");
  });
});
