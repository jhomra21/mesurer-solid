import { afterEach, describe, expect, it, vi } from "vitest";
import { createMesurerPluginHost, defineMesurerPlugin } from "@jhomra21/mesurer-solid-core";
import { getInspectMeasurement } from "@jhomra21/mesurer-solid-dom";
import type { MesurerSolidRuntimeService } from "../src/ComposableMesurer";
import { createMesurerModel } from "../src/model/create-mesurer-model";
import {
  MESURER_ARRANGE_SERVICE_ID,
  arrangePlugin,
  type MesurerArrangeService,
} from "../src/plugins/arrange";
import { createMesurerWorkspaceRuntime } from "../src/runtime/workspace-context";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  localStorage.clear();
});

const setRect = (element: HTMLElement, value: { left: number; top: number; width: number; height: number }) => {
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => ({
    ...value,
    x: value.left,
    y: value.top,
    right: value.left + value.width,
    bottom: value.top + value.height,
    toJSON: () => value,
  }));
};

const setup = async () => {
  const host = createMesurerPluginHost();
  const pageTarget = document.createElement("main");
  document.body.append(pageTarget);
  const model = createMesurerModel({ initialEnabled: true });
  const workspace = createMesurerWorkspaceRuntime({
    model,
    ownerDocument: document,
    ownerWindow: window,
    uiRoot: document.body,
    pageTarget,
  });
  const runtime: MesurerSolidRuntimeService = {
    ownerDocument: document,
    ownerWindow: window,
    portalTarget: document.body,
    pageTarget,
    createWorkspaceRuntime: () => workspace,
    createInspectorMount() {
      const element = document.createElement("div");
      element.dataset.mesurerInspectorUi = "true";
      document.body.append(element);
      return { element, dispose: () => element.remove() };
    },
  };
  await host.load(defineMesurerPlugin({
    id: "test.runtime",
    provides: ["runtime:solid"],
    setup(ctx) {
      ctx.service.provide("runtime:solid", runtime);
    },
  }));
  await host.load(arrangePlugin());
  return { host, model, pageTarget };
};

const select = (model: ReturnType<typeof createMesurerModel>, elements: HTMLElement[]) => {
  const measurements = elements.map((element, index) =>
    getInspectMeasurement(element, window, `selection-${index + 1}`));
  model.setSelectedMeasurements(measurements, measurements.at(-1) ?? null);
};

const arrangeBox = async (host: ReturnType<typeof createMesurerPluginHost>) => {
  await host.command.execute("arrange.toggle");
  const box = document.querySelector<HTMLElement>("[data-mesurer-arrange-box='true']");
  if (!box) throw new Error("Arrange box was not mounted.");
  return box;
};

const drag = (
  box: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  shiftKey = false,
) => {
  box.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: from.x,
    clientY: from.y,
    pointerId: 1,
  }));
  box.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: to.x,
    clientY: to.y,
    pointerId: 1,
    shiftKey,
  }));
  box.dispatchEvent(new PointerEvent("pointerup", {
    bubbles: true,
    button: 0,
    clientX: to.x,
    clientY: to.y,
    pointerId: 1,
    shiftKey,
  }));
};

describe("arrangePlugin", () => {
  it("records one persisted drag and reconstructs Before, Desired, Live, undo, and redo", async () => {
    const { host, model, pageTarget } = await setup();
    const target = document.createElement("button");
    target.dataset.testid = "checkout";
    target.style.setProperty("transform", "scale(1)", "important");
    pageTarget.append(target);
    setRect(target, { left: 100, top: 80, width: 60, height: 30 });
    select(model, [target]);

    const tool = host.tools().find((item) => item.id === "arrange");
    expect(tool).toMatchObject({ label: "Arrange" });
    expect(tool?.disabled?.()).toBe(false);
    expect(tool?.shortcut).toBeUndefined();

    const box = await arrangeBox(host);
    drag(box, { x: 100, y: 80 }, { x: 140, y: 100 });

    const service = host.service.get<MesurerArrangeService>(MESURER_ARRANGE_SERVICE_ID);
    await vi.waitFor(() => expect(service?.intents()).toHaveLength(1));
    const intent = service?.intents()[0];
    if (!intent) throw new Error("Arrange intent was not recorded.");

    expect(intent.targets[0]).toMatchObject({
      selector: "[data-testid=\"checkout\"]",
      before: { left: 100, top: 80, width: 60, height: 30 },
      desired: { left: 140, top: 100, width: 60, height: 30 },
      beforeOffset: { x: 0, y: 0 },
      desiredOffset: { x: 40, y: 20 },
    });
    expect(target.style.transform).toContain("translate3d(40px, 20px, 0)");
    expect(host.state.serialize("persist")["mesurer.arrange.intents"]).toBeDefined();

    service?.show(intent.id, "before");
    expect(target.style.getPropertyValue("transform")).toBe("scale(1)");
    expect(target.style.getPropertyPriority("transform")).toBe("important");
    service?.show(intent.id, "desired");
    expect(target.style.transform).toContain("translate3d(40px, 20px, 0)");
    service?.show(intent.id, "live");
    expect(target.style.getPropertyValue("transform")).toBe("scale(1)");
    service?.showCurrent();

    expect(service?.capturePlan(intent.id, "desired")).toMatchObject({
      schema: "mesurer.arrange-capture/v1",
      arrangeId: intent.id,
      state: "desired",
      chrome: "hide",
      captures: [{ id: "viewport", kind: "viewport" }, { id: "focus", kind: "clip" }],
    });
    expect(service?.review(intent.id)).toMatchObject({
      matched: false,
      targets: [{ delta: { left: -40, top: -20 } }],
    });

    await vi.waitFor(() => expect(host.canUndo()).toBe(true));
    expect(host.undo()).toBe(true);
    expect(service?.intents()).toHaveLength(0);
    await vi.waitFor(() => expect(target.style.getPropertyValue("transform")).toBe("scale(1)"));

    expect(host.redo()).toBe(true);
    expect(service?.intents()).toHaveLength(1);
    await vi.waitFor(() => expect(target.style.transform).toContain("translate3d(40px, 20px, 0)"));

    host.dispose();
    expect(target.style.getPropertyValue("transform")).toBe("scale(1)");
    expect(target.style.getPropertyPriority("transform")).toBe("important");
  });

  it("moves a multi-selection together and Shift locks to the dominant axis", async () => {
    const { host, model, pageTarget } = await setup();
    const first = document.createElement("div");
    first.id = "first";
    const second = document.createElement("div");
    second.id = "second";
    pageTarget.append(first, second);
    setRect(first, { left: 10, top: 20, width: 40, height: 30 });
    setRect(second, { left: 70, top: 20, width: 40, height: 30 });
    select(model, [first, second]);

    const box = await arrangeBox(host);
    drag(box, { x: 10, y: 20 }, { x: 46, y: 28 }, true);
    const service = host.service.get<MesurerArrangeService>(MESURER_ARRANGE_SERVICE_ID);
    await vi.waitFor(() => expect(service?.intents()).toHaveLength(1));
    expect(service?.intents()[0]?.targets.map((target) => target.desiredOffset)).toEqual([
      { x: 36, y: 0 },
      { x: 36, y: 0 },
    ]);
    expect(first.style.transform).toContain("translate3d(36px, 0px, 0)");
    expect(second.style.transform).toContain("translate3d(36px, 0px, 0)");
    host.dispose();
  });

  it("rebinds conservatively and refuses ambiguous replacements", async () => {
    const { host, model, pageTarget } = await setup();
    const target = document.createElement("button");
    target.dataset.testid = "save";
    target.textContent = "Save";
    pageTarget.append(target);
    setRect(target, { left: 20, top: 30, width: 80, height: 32 });
    select(model, [target]);

    const box = await arrangeBox(host);
    drag(box, { x: 20, y: 30 }, { x: 50, y: 45 });
    const service = host.service.get<MesurerArrangeService>(MESURER_ARRANGE_SERVICE_ID);
    await vi.waitFor(() => expect(service?.intents()).toHaveLength(1));
    const intent = service?.intents()[0];
    if (!intent) throw new Error("Arrange intent was not recorded.");

    target.remove();
    const replacement = document.createElement("button");
    replacement.dataset.testid = "save";
    replacement.textContent = "Save";
    pageTarget.append(replacement);
    setRect(replacement, { left: 20, top: 30, width: 80, height: 32 });
    service?.showCurrent();
    expect(replacement.style.transform).toContain("translate3d(30px, 15px, 0)");

    const duplicate = document.createElement("button");
    duplicate.dataset.testid = "save";
    duplicate.textContent = "Save";
    pageTarget.append(duplicate);
    setRect(duplicate, { left: 120, top: 30, width: 80, height: 32 });
    service?.showCurrent();
    expect(replacement.style.transform).toBe("");
    expect(duplicate.style.transform).toBe("");
    expect(service?.review(intent.id).targetStatus).toBe("stale");
    host.dispose();
  });
});