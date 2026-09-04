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

  it("offers compact page-derived heading presets without turning text editing into rich text", async () => {
    const { host, model, pageTarget } = await setup();
    const target = document.createElement("p");
    target.id = "preset-target";
    target.textContent = "Body copy";
    target.style.fontFamily = "Arial";
    target.style.fontSize = "14px";
    target.style.fontWeight = "400";
    target.style.lineHeight = "20px";
    pageTarget.append(target);

    const heading = document.createElement("h2");
    heading.textContent = "Section heading";
    heading.style.fontFamily = "Georgia";
    heading.style.fontSize = "30px";
    heading.style.fontWeight = "700";
    heading.style.fontStyle = "italic";
    heading.style.lineHeight = "36px";
    heading.style.letterSpacing = "1px";
    heading.style.textTransform = "uppercase";
    heading.style.color = "rgb(20, 40, 60)";
    pageTarget.append(heading);

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

    const editor = document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']")!;
    const toolbar = document.querySelector<HTMLElement>("[data-mesurer-text-style-toolbar='true']")!;
    const menuButton = document.querySelector<HTMLButtonElement>("[data-mesurer-text-style-menu-button='true']")!;
    const menu = document.querySelector<HTMLElement>("[data-mesurer-text-style-menu='true']")!;
    expect(toolbar.querySelectorAll(":scope > button")).toHaveLength(4);
    expect(menu.hidden).toBe(true);

    menuButton.click();
    expect(menu.hidden).toBe(false);
    expect(document.querySelector("[data-mesurer-text-style-preset='heading-1']")).toBeNull();
    const headingPreset = document.querySelector<HTMLButtonElement>("[data-mesurer-text-style-preset='heading-2']")!;
    expect(headingPreset).toBeTruthy();
    headingPreset.click();

    expect(menu.hidden).toBe(true);
    expect(target.style.fontFamily).toBe("Georgia");
    expect(target.style.fontSize).toBe("30px");
    expect(target.style.fontWeight).toBe("700");
    expect(target.style.fontStyle).toBe("italic");
    expect(target.style.lineHeight).toBe("36px");
    expect(target.style.letterSpacing).toBe("1px");
    expect(target.style.textTransform).toBe("uppercase");
    expect(target.style.color).toBe("rgb(20, 40, 60)");

    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();

    const service = host.service.get<MesurerTextEditService>(MESURER_TEXT_EDIT_SERVICE_ID)!;
    const intent = service.intents().at(-1);
    expect(intent?.styles).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: "font-family", desired: "Georgia" }),
      expect.objectContaining({ property: "font-size", desired: "30px" }),
      expect.objectContaining({ property: "font-weight", desired: "700" }),
      expect.objectContaining({ property: "line-height", desired: "36px" }),
      expect.objectContaining({ property: "letter-spacing", desired: "1px" }),
      expect.objectContaining({ property: "text-transform", desired: "uppercase" }),
    ]));
  });

  it("does not overwrite a later framework/source text update when leaving Text Inspector", async () => {
    const { model, pageTarget } = await setup();
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
