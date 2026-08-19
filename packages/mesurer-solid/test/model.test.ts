import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { createMeasurerModel } from "../src/model/create-measurer-model";

const guide = { id: "g1", orientation: "vertical" as const, position: 100 };

describe("createMeasurerModel", () => {
  it("keeps the command state and Solid store projection in sync", () => {
    const model = createMeasurerModel({ initialEnabled: true });
    const next = model.toggleEnabled();
    expect(next).toBe(false);
    expect(model.current.enabled).toBe(false);
    // Solid 2 RC exposes this store mutation immediately in this command context.
    // The command-side snapshot still prevents imperative behavior from depending
    // on when downstream reactive computations/effects are scheduled.
    expect(model.state.enabled).toBe(false);
    flush();
    expect(model.state.enabled).toBe(false);
  });

  it("undoes and redoes guide actions", () => {
    const model = createMeasurerModel();
    model.checkpoint();
    model.addGuide(guide);
    flush();
    expect(model.state.guides).toHaveLength(1);
    expect(model.undo()).toBe(true);
    flush();
    expect(model.state.guides).toHaveLength(0);
    expect(model.redo()).toBe(true);
    flush();
    expect(model.state.guides[0]?.id).toBe("g1");
  });

  it("serializes settings and strips runtime element references from workspace data", () => {
    const model = createMeasurerModel({ settings: { persistOnReload: true } });
    model.updateSettings({ guideColor: "#ff0000", snapGuidesEnabled: false });
    model.setMeasurements([{
      id: "m1",
      rect: { left: 0, top: 0, width: 10, height: 20 },
      normalizedRect: { left: 0, top: 0, width: 0.1, height: 0.2 },
      elementRef: document.body,
      deltaX: 0,
      deltaY: 0,
    }]);
    const settings = model.serializeSettings();
    const workspace = model.serializeWorkspace();
    expect(settings.guideColor).toBe("#ff0000");
    expect(settings.snapGuidesEnabled).toBe(false);
    expect(workspace.measurements[0]?.elementRef).toBeUndefined();
  });
});
