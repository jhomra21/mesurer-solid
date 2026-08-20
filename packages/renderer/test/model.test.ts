import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { createMeasurerModel } from "../src/model/create-measurer-model";

const guide = { id: "g1", orientation: "vertical" as const, position: 100 };

describe("createMeasurerModel", () => {
  it("keeps synchronous command state and the Solid projection in sync", () => {
    const model = createMeasurerModel({ initialEnabled: true });
    const next = model.toggleEnabled();
    expect(next).toBe(false);
    // Imperative behavior reads the framework-neutral command state immediately.
    expect(model.current.enabled).toBe(false);
    // The Solid store is only a rendering projection and may settle on Solid's schedule.
    flush();
    expect(model.state.enabled).toBe(false);
    model.dispose();
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
    model.dispose();
  });

  it("chooses the upstream settings tab when settings open without an explicit tab", () => {
    const model = createMeasurerModel();

    model.setToolMode("select");
    model.setTransient({ settingsOpen: true });
    expect(model.current.settingsTab).toBe("select");

    model.setTransient({ settingsOpen: false });
    model.setToolMode("guides");
    model.setTransient({ settingsOpen: true });
    expect(model.current.settingsTab).toBe("guides");

    model.setTransient({ settingsOpen: false });
    model.setToolMode("none");
    model.setRulersVisible(true);
    model.setTransient({ settingsOpen: true });
    expect(model.current.settingsTab).toBe("rulers");

    model.setTransient({ settingsOpen: false, colorPickerActive: true });
    model.setTransient({ settingsOpen: true });
    expect(model.current.settingsTab).toBe("color-picker");

    model.setTransient({ settingsOpen: false, colorPickerActive: false });
    model.setRulersVisible(false);
    model.setTransient({ settingsOpen: true });
    expect(model.current.settingsTab).toBe("general");
    model.dispose();
  });

  it("preserves an explicit settings tab when opening settings", () => {
    const model = createMeasurerModel();
    model.setToolMode("guides");
    model.setTransient({ settingsOpen: true, settingsTab: "general" });
    expect(model.current.settingsTab).toBe("general");
    model.dispose();
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
    model.dispose();
  });
});
