import { afterEach, describe, expect, it, vi } from "vitest";
import { createMesurerPluginHost, defineMesurerPlugin } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../src/ComposableMesurer";
import { createMesurerModel } from "../src/model/create-mesurer-model";
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
    id: "test.text-editing",
    provides: ["runtime:solid", "tool:select"],
    setup(ctx) {
      ctx.service.provide("runtime:solid", runtime);
      installTextEditing(ctx, runtime);
    },
  }));

  return { host, model, pageTarget };
};

const installHitTest = (target: HTMLElement, pageTarget: HTMLElement) => {
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [target, pageTarget, document.body, document.documentElement],
  });
};

describe("direct text editing", () => {
  it("opens from Select, selects all text, and mirrors the target typography", async () => {
    const { model, pageTarget } = await setup();
    const target = document.createElement("p");
    target.id = "select-edit-target";
    target.textContent = "Edit this copy";
    Object.assign(target.style, {
      fontFamily: "Georgia, serif",
      fontSize: "19px",
      fontWeight: "500",
      fontStyle: "italic",
      lineHeight: "31px",
      letterSpacing: "1.5px",
      textAlign: "center",
      color: "rgb(24, 42, 66)",
    });
    pageTarget.append(target);
    setRect(target, { left: 80, top: 100, width: 240, height: 40 });
    installHitTest(target, pageTarget);

    model.setToolMode("select");
    target.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      clientX: 100,
      clientY: 110,
    }));

    const editor = document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
    const toolbar = document.querySelector<HTMLElement>("[data-mesurer-text-style-toolbar='true']");
    expect(editor).toBeTruthy();
    expect(toolbar).toBeTruthy();
    expect(editor?.value).toBe("Edit this copy");
    expect(editor?.selectionStart).toBe(0);
    expect(editor?.selectionEnd).toBe(editor?.value.length);
    expect(editor?.style.fontFamily).toContain("Georgia");
    expect(editor?.style.fontSize).toBe("19px");
    expect(editor?.style.fontWeight).toBe("500");
    expect(editor?.style.fontStyle).toBe("italic");
    expect(editor?.style.lineHeight).toBe("31px");
    expect(editor?.style.letterSpacing).toBe("1.5px");
    expect(editor?.style.textAlign).toBe("center");
  });

  it("offers rendered page styles and records reversible text plus style intent", async () => {
    const { host, model, pageTarget } = await setup();
    const target = document.createElement("p");
    target.id = "styled-copy";
    target.textContent = "Before copy";
    Object.assign(target.style, {
      fontFamily: "Arial, sans-serif",
      fontSize: "16px",
      fontWeight: "400",
      color: "rgb(20, 30, 40)",
    });
    const reference = document.createElement("p");
    reference.textContent = "Reference typography";
    Object.assign(reference.style, {
      fontFamily: "Georgia, serif",
      fontSize: "24px",
      fontWeight: "700",
      color: "rgb(180, 40, 60)",
    });
    pageTarget.append(target, reference);
    setRect(target, { left: 40, top: 60, width: 220, height: 32 });
    installHitTest(target, pageTarget);

    model.setToolMode("select");
    target.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      clientX: 60,
      clientY: 70,
    }));

    const editor = document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']")!;
    const menuButton = document.querySelector<HTMLButtonElement>("[data-mesurer-text-style-menu-button='true']")!;
    const menu = document.querySelector<HTMLElement>("[data-mesurer-text-style-menu='true']")!;
    expect(menu.hidden).toBe(true);
    menuButton.click();
    expect(menu.hidden).toBe(false);

    const family = document.querySelector<HTMLSelectElement>("[data-mesurer-text-style-select='font']")!;
    const size = document.querySelector<HTMLSelectElement>("[data-mesurer-text-style-select='size']")!;
    const weight = document.querySelector<HTMLSelectElement>("[data-mesurer-text-style-select='weight']")!;
    const underline = document.querySelector<HTMLButtonElement>("[data-mesurer-text-style-button='underline']")!;
    const swatches = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mesurer-text-color]"));

    expect(Array.from(family.options).some((option) => option.value.includes("Georgia"))).toBe(true);
    expect(Array.from(size.options).some((option) => option.value === "24px")).toBe(true);
    expect(Array.from(weight.options).some((option) => option.value === "700")).toBe(true);
    expect(swatches.some((button) => button.dataset.mesurerTextColor === "rgb(180, 40, 60)")).toBe(true);

    family.value = Array.from(family.options).find((option) => option.value.includes("Georgia"))!.value;
    family.dispatchEvent(new Event("change", { bubbles: true }));
    weight.value = "700";
    weight.dispatchEvent(new Event("change", { bubbles: true }));
    underline.click();
    const red = swatches.find((button) => button.dataset.mesurerTextColor === "rgb(180, 40, 60)")!;
    red.click();
    editor.value = "Desired copy";
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    expect(target.textContent).toBe("Desired copy");
    expect(target.style.fontFamily).toContain("Georgia");
    expect(target.style.fontWeight).toBe("700");
    expect(target.style.textDecorationLine).toBe("underline");
    expect(target.style.color).toBe("rgb(180, 40, 60)");

    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();

    const service = host.service.get<MesurerTextEditService>(MESURER_TEXT_EDIT_SERVICE_ID)!;
    const intent = service.intents()[0];
    expect(intent).toEqual(expect.objectContaining({
      selector: "#styled-copy",
      before: "Before copy",
      desired: "Desired copy",
    }));
    expect(intent.styles).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: "font-family", desired: expect.stringContaining("Georgia") }),
      expect.objectContaining({ property: "font-weight", desired: "700" }),
      expect.objectContaining({ property: "text-decoration-line", desired: "underline" }),
      expect.objectContaining({ property: "color", desired: "rgb(180, 40, 60)" }),
    ]));
    expect(service.intent(intent.id)).toEqual(intent);

    model.setToolMode("none");
    await vi.waitFor(() => expect(target.textContent).toBe("Before copy"));
    expect(target.style.fontFamily).toBe("Arial, sans-serif");
    expect(target.style.fontWeight).toBe("400");
    expect(target.style.textDecorationLine).toBe("");
    expect(target.style.color).toBe("rgb(20, 30, 40)");

    model.setToolMode("select");
    await vi.waitFor(() => expect(target.textContent).toBe("Desired copy"));
    expect(target.style.fontFamily).toContain("Georgia");
    expect(target.style.fontWeight).toBe("700");
    expect(target.style.textDecorationLine).toBe("underline");
    expect(target.style.color).toBe("rgb(180, 40, 60)");

    expect(host.undo()).toBe(true);
    await vi.waitFor(() => expect(target.textContent).toBe("Before copy"));
    expect(target.style.fontFamily).toBe("Arial, sans-serif");
    expect(target.style.fontWeight).toBe("400");
    expect(target.style.textDecorationLine).toBe("");

    expect(host.redo()).toBe(true);
    await vi.waitFor(() => expect(target.textContent).toBe("Desired copy"));
    expect(target.style.fontWeight).toBe("700");
  });

  it("does not restore a style property after the application takes ownership", async () => {
    const { model, pageTarget } = await setup();
    const target = document.createElement("p");
    target.id = "source-style-target";
    target.textContent = "Source copy";
    target.style.fontWeight = "400";
    pageTarget.append(target);
    setRect(target, { left: 20, top: 20, width: 160, height: 28 });
    installHitTest(target, pageTarget);

    model.setToolMode("select");
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 30, clientY: 30 }));
    const editor = document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']")!;
    const bold = document.querySelector<HTMLButtonElement>("[data-mesurer-text-style-button='bold']")!;
    bold.click();
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();
    expect(target.style.fontWeight).toBe("700");

    target.style.fontWeight = "600";
    model.setToolMode("none");

    await vi.waitFor(() => expect(target.style.fontWeight).toBe("600"));
  });

  it("still leaves native form controls and contenteditable elements alone", async () => {
    const { model, pageTarget } = await setup();
    const input = document.createElement("input");
    input.value = "Native input";
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    editable.textContent = "Native rich text";
    pageTarget.append(input, editable);

    model.setToolMode("select");
    installHitTest(input, pageTarget);
    input.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 }));
    expect(document.querySelector("[data-mesurer-text-editor='true']")).toBeNull();

    installHitTest(editable, pageTarget);
    editable.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 }));
    expect(document.querySelector("[data-mesurer-text-editor='true']")).toBeNull();
  });
});
