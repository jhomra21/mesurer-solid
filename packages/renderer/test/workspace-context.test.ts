import { describe, expect, it } from "vitest";
import { createMeasurerModel } from "../src/model/create-measurer-model";
import { createMesurerWorkspaceRuntime } from "../src/runtime/workspace-context";

describe("createMesurerWorkspaceRuntime", () => {
  it("stays bound to the renderer model supplied by its owning instance", () => {
    const firstModel = createMeasurerModel({ initialEnabled: true });
    const secondModel = createMeasurerModel({ initialEnabled: true });

    firstModel.addGuide({ id: "first-guide", orientation: "vertical", position: 120 });
    secondModel.addGuide({ id: "second-guide", orientation: "horizontal", position: 240 });
    secondModel.setRulersVisible(true);

    const firstRuntime = createMesurerWorkspaceRuntime({
      model: firstModel,
      ownerDocument: document,
      ownerWindow: window,
    });
    const secondRuntime = createMesurerWorkspaceRuntime({
      model: secondModel,
      ownerDocument: document,
      ownerWindow: window,
    });

    expect(firstRuntime.snapshot().guides.map((guide) => guide.id)).toEqual(["first-guide"]);
    expect(firstRuntime.snapshot().rulersVisible).toBe(false);
    expect(secondRuntime.snapshot().guides.map((guide) => guide.id)).toEqual(["second-guide"]);
    expect(secondRuntime.snapshot().rulersVisible).toBe(true);

    firstModel.addGuide({ id: "first-guide-2", orientation: "vertical", position: 320 });
    expect(firstRuntime.snapshot().guides.map((guide) => guide.id)).toEqual(["first-guide", "first-guide-2"]);
    expect(secondRuntime.snapshot().guides.map((guide) => guide.id)).toEqual(["second-guide"]);

    firstRuntime.dispose();
    secondRuntime.dispose();
    firstModel.dispose();
    secondModel.dispose();
  });
});
