import { describe, expect, it } from "vitest";
import { createMeasurerModelCore } from "../src/model";

describe("framework-neutral Mesurer model", () => {
  it("publishes snapshots and preserves undo/redo semantics", () => {
    const model = createMeasurerModelCore();
    const snapshots: string[] = [];
    const unsubscribe = model.subscribe((snapshot) => snapshots.push(snapshot.toolMode));
    model.toggleToolMode("select");
    expect(model.current.toolMode).toBe("select");
    expect(model.canUndo()).toBe(true);
    expect(model.undo()).toBe(true);
    expect(model.current.toolMode).toBe("none");
    expect(model.redo()).toBe(true);
    expect(model.current.toolMode).toBe("select");
    expect(snapshots.length).toBeGreaterThan(0);
    unsubscribe();
  });

  it("serializes workspace state without carrying host element references", () => {
    const element = { node: "host" };
    const model = createMeasurerModelCore<typeof element>();
    model.setMeasurements([{ id: "m", rect: { left: 0, top: 0, width: 10, height: 20 }, normalizedRect: { left: 0, top: 0, width: 10, height: 20 }, deltaX: 0, deltaY: 0, elementRef: element }]);
    expect(model.serializeWorkspace().measurements[0].elementRef).toBeUndefined();
  });
});
