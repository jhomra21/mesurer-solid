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

const mountedHosts: Array<ReturnType<typeof createMesurerPluginHost>> = [];

afterEach(() => {
  while (mountedHosts.length) mountedHosts.pop()?.dispose();
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
  mountedHosts.push(host);
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
    id: "test.arrange-preview-runtime",
    provides: ["runtime:solid", "tool:select"],
    setup(ctx) {
      ctx.service.provide("runtime:solid", runtime);
      ctx.command.register("builtin.select", () => {
        model.setEnabled(true);
        model.setToolMode("select");
      });
    },
  }));
  await host.load(arrangePlugin());
  return { host, model, pageTarget };
};

const select = (model: ReturnType<typeof createMesurerModel>, element: HTMLElement) => {
  const measurement = getInspectMeasurement(element, window, "selection-1");
  model.setSelectedMeasurements([measurement], measurement);
};

const pointer = (
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
  y: number,
) => new PointerEvent(type, {
  bubbles: true,
  button: 0,
  buttons: type === "pointermove" ? 1 : undefined,
  clientX: x,
  clientY: y,
  pointerId: 1,
});

const createIntent = async (
  host: ReturnType<typeof createMesurerPluginHost>,
  model: ReturnType<typeof createMesurerModel>,
  target: HTMLElement,
) => {
  select(model, target);
  await host.command.execute("arrange.toggle");
  const box = document.querySelector<HTMLElement>("[data-mesurer-arrange-box='true']");
  if (!box) throw new Error("Arrange box was not mounted.");
  box.dispatchEvent(pointer("pointerdown", 100, 80));
  box.dispatchEvent(pointer("pointermove", 140, 100));
  box.dispatchEvent(pointer("pointerup", 140, 100));
  const service = host.service.get<MesurerArrangeService>(MESURER_ARRANGE_SERVICE_ID)!;
  await vi.waitFor(() => expect(service.intents()).toHaveLength(1));
  return { service, intentId: service.intents()[0]!.id };
};

const transformValue = (element: HTMLElement) => ({
  value: element.style.getPropertyValue("transform"),
  priority: element.style.getPropertyPriority("transform"),
});

describe("Arrange preview transform ownership", () => {
  it("restores the exact original inline transform and priority while Mesurer still owns the preview", async () => {
    const { host, model, pageTarget } = await setup();
    const target = document.createElement("button");
    target.id = "owned-preview";
    target.style.setProperty("transform", "rotate(3deg)", "important");
    pageTarget.append(target);
    setRect(target, { left: 100, top: 80, width: 60, height: 30 });

    const { service, intentId } = await createIntent(host, model, target);
    expect(target.style.getPropertyValue("transform")).toContain("translate3d(40px, 20px, 0)");

    service.show(intentId, "live");
    expect(transformValue(target)).toEqual({ value: "rotate(3deg)", priority: "important" });
  });

  it("preserves host transform updates across Live, review, refresh, and disposal", async () => {
    const { host, model, pageTarget } = await setup();
    const target = document.createElement("button");
    target.id = "host-preview";
    target.style.setProperty("transform", "rotate(1deg)", "important");
    pageTarget.append(target);
    setRect(target, { left: 100, top: 80, width: 60, height: 30 });

    const { service, intentId } = await createIntent(host, model, target);

    target.style.setProperty("transform", "scale(2)", "important");
    service.show(intentId, "live");
    expect(transformValue(target)).toEqual({ value: "scale(2)", priority: "important" });

    service.show(intentId, "desired");
    expect(target.style.getPropertyValue("transform")).toContain("translate3d(40px, 20px, 0)");
    service.review(intentId);
    const afterReview = target.style.getPropertyValue("transform");
    expect(afterReview).toContain("translate3d(40px, 20px, 0)");
    expect(afterReview.match(/translate3d\(/g)).toHaveLength(1);

    target.style.setProperty("transform", "skewX(10deg)", "important");
    window.dispatchEvent(new Event("resize"));
    await vi.waitFor(() => {
      expect(target.style.getPropertyValue("transform")).toContain("translate3d(40px, 20px, 0)");
    });
    service.show(intentId, "live");
    expect(transformValue(target)).toEqual({ value: "skewX(10deg)", priority: "important" });

    service.show(intentId, "desired");
    target.style.setProperty("transform", "translateX(7px)", "important");
    host.dispose();
    mountedHosts.splice(mountedHosts.indexOf(host), 1);
    expect(transformValue(target)).toEqual({ value: "translateX(7px)", priority: "important" });
  });
});
