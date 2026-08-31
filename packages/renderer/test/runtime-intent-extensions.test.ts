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
import { installArrangeSelectGuard } from "../src/runtime/arrange-select-guard";
import {
  MESURER_TEXT_EDIT_SERVICE_ID,
  installTextEditing,
  type MesurerTextEditService,
} from "../src/runtime/text-editing";
import { createMesurerWorkspaceRuntime } from "../src/runtime/workspace-context";

const mountedHosts: Array<ReturnType<typeof createMesurerPluginHost>> = [];
const originalElementsFromPoint = document.elementsFromPoint?.bind(document);

afterEach(() => {
  while (mountedHosts.length) mountedHosts.pop()?.dispose();
  if (originalElementsFromPoint) {
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: originalElementsFromPoint,
    });
  } else {
    Reflect.deleteProperty(document, "elementsFromPoint");
  }
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
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
  const createWorkspaceRuntime = () => createMesurerWorkspaceRuntime({
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
    currentToolMode: () => model.current.toolMode,
    createWorkspaceRuntime,
    createInspectorMount() {
      const element = document.createElement("div");
      element.dataset.mesurerInspectorUi = "true";
      document.body.append(element);
      return { element, dispose: () => element.remove() };
    },
  };

  await host.load(defineMesurerPlugin({
    id: "test.runtime",
    provides: ["runtime:solid", "tool:select"],
    setup(ctx) {
      ctx.service.provide("runtime:solid", runtime);
      ctx.command.register("builtin.select", () => {
        model.setEnabled(true);
        model.toggleToolMode("select");
      });
      installArrangeSelectGuard(ctx, runtime);
      installTextEditing(ctx, runtime);
    },
  }));

  return { host, model, pageTarget };
};

const select = (model: ReturnType<typeof createMesurerModel>, elements: HTMLElement[]) => {
  const measurements = elements.map((element, index) =>
    getInspectMeasurement(element, window, `selection-${index + 1}`));
  model.setSelectedMeasurements(measurements, measurements.at(-1) ?? null);
};

const pointer = (
  type: "pointerdown" | "pointermove" | "pointerup",
  value: { x: number; y: number },
) => new PointerEvent(type, {
  bubbles: true,
  button: 0,
  buttons: type === "pointermove" ? 1 : undefined,
  clientX: value.x,
  clientY: value.y,
  pointerId: 1,
});

describe("visual intent runtime extensions", () => {
  it("deactivates Arrange and restores Live as soon as Select is turned off", async () => {
    const { host, model, pageTarget } = await setup();
    await host.load(arrangePlugin());

    const target = document.createElement("button");
    target.id = "arrange-select-guard-target";
    target.textContent = "Move me";
    pageTarget.append(target);
    setRect(target, { left: 40, top: 60, width: 100, height: 32 });
    select(model, [target]);

    await host.command.execute("arrange.toggle");
    expect(model.current.toolMode).toBe("select");
    const service = host.service.get<MesurerArrangeService>(MESURER_ARRANGE_SERVICE_ID)!;
    expect(service.active()).toBe(true);

    const box = document.querySelector<HTMLElement>("[data-mesurer-arrange-box='true']")!;
    box.dispatchEvent(pointer("pointerdown", { x: 50, y: 70 }));
    box.dispatchEvent(pointer("pointermove", { x: 90, y: 70 }));
    box.dispatchEvent(pointer("pointerup", { x: 90, y: 70 }));
    await vi.waitFor(() => expect(service.intents()).toHaveLength(1));
    expect(target.style.transform).toContain("translate3d(40px, 0px, 0)");

    model.setToolMode("none");

    await vi.waitFor(() => expect(service.active()).toBe(false));
    expect(model.current.toolMode).toBe("none");
    expect(target.style.transform).toBe("");
  });

  it("extends Text Inspector with reversible Desired text editing and host undo/redo", async () => {
    const { host, model, pageTarget } = await setup();
    const target = document.createElement("p");
    target.id = "editable-copy";
    target.append(document.createTextNode("  Start your free trial  "));
    pageTarget.append(target);
    setRect(target, { left: 80, top: 100, width: 220, height: 32 });
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: () => [target, pageTarget, document.body, document.documentElement],
    });

    model.setToolMode("text-inspector");
    target.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      clientX: 100,
      clientY: 110,
    }));

    const editor = document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
    expect(editor).toBeTruthy();
    expect(editor?.value).toBe("Start your free trial");

    editor!.value = "Try it free";
    editor!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(target.textContent).toBe("  Try it free  ");
    editor!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();

    const service = host.service.get<MesurerTextEditService>(MESURER_TEXT_EDIT_SERVICE_ID)!;
    expect(service.intents()).toEqual([
      expect.objectContaining({
        selector: "#editable-copy",
        before: "  Start your free trial  ",
        desired: "  Try it free  ",
      }),
    ]);

    model.setToolMode("none");
    await vi.waitFor(() => expect(target.textContent).toBe("  Start your free trial  "));

    model.setToolMode("text-inspector");
    await vi.waitFor(() => expect(target.textContent).toBe("  Try it free  "));

    expect(host.undo()).toBe(true);
    await vi.waitFor(() => expect(target.textContent).toBe("  Start your free trial  "));
    expect(service.intents()).toHaveLength(0);

    expect(host.redo()).toBe(true);
    await vi.waitFor(() => expect(target.textContent).toBe("  Try it free  "));
    expect(service.intents()).toHaveLength(1);

    host.dispose();
    mountedHosts.pop();
    expect(target.textContent).toBe("  Start your free trial  ");
  });

  it("does not overwrite a later framework/source text update when leaving Text Inspector", async () => {
    const { host, model, pageTarget } = await setup();
    const target = document.createElement("p");
    target.id = "source-owned-copy";
    target.textContent = "Before";
    pageTarget.append(target);
    setRect(target, { left: 20, top: 20, width: 120, height: 24 });
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: () => [target, pageTarget, document.body, document.documentElement],
    });

    model.setToolMode("text-inspector");
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 30, clientY: 30 }));
    const editor = document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']")!;
    editor.value = "Desired";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(target.textContent).toBe("Desired");

    target.firstChild!.nodeValue = "Source changed";
    await new Promise((resolve) => setTimeout(resolve, 0));
    model.setToolMode("none");

    await vi.waitFor(() => expect(target.textContent).toBe("Source changed"));
  });

  it("does not hijack native editable controls", async () => {
    const { model, pageTarget } = await setup();
    const input = document.createElement("input");
    input.value = "Native input";
    pageTarget.append(input);
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: () => [input, pageTarget, document.body, document.documentElement],
    });

    model.setToolMode("text-inspector");
    input.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 }));
    expect(document.querySelector("[data-mesurer-text-editor='true']")).toBeNull();
  });
});
