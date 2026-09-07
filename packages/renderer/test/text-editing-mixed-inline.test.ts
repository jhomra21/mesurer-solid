import { afterEach, describe, expect, it, vi } from "vitest";
import { createMesurerPluginHost, defineMesurerPlugin } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../src/ComposableMesurer";
import { createMesurerModel } from "../src/model/create-mesurer-model";
import { installTextEditing } from "../src/runtime/text-editing";
import { createMesurerWorkspaceRuntime } from "../src/runtime/workspace-context";

const mountedHosts: Array<ReturnType<typeof createMesurerPluginHost>> = [];
const originalElementsFromPoint = document.elementsFromPoint?.bind(document);
const originalCaretRangeFromPoint = Reflect.get(document, "caretRangeFromPoint");

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
  if (originalCaretRangeFromPoint) {
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: originalCaretRangeFromPoint,
    });
  } else {
    Reflect.deleteProperty(document, "caretRangeFromPoint");
  }
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

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
    id: "test.text-editing-mixed-inline",
    provides: ["runtime:solid", "tool:select"],
    setup(ctx) {
      ctx.service.provide("runtime:solid", runtime);
      installTextEditing(ctx, runtime);
    },
  }));

  return { model, pageTarget };
};

const installHitTest = (
  target: HTMLElement,
  pageTarget: HTMLElement,
  textNode: Text,
) => {
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [target, pageTarget, document.body, document.documentElement],
  });
  Object.defineProperty(document, "caretRangeFromPoint", {
    configurable: true,
    value: () => {
      const range = document.createRange();
      range.setStart(textNode, Math.min(1, textNode.length));
      range.collapse(true);
      return range;
    },
  });
};

describe("mixed inline direct text editing", () => {
  it("edits the direct text around kbd children without repainting or flattening the host", async () => {
    const { model, pageTarget } = await setup();
    const target = document.createElement("p");
    target.id = "mixed-inline-target";
    const before = document.createTextNode("Select one or more elements, then use Arrange or ");
    const key = document.createElement("kbd");
    key.textContent = "Shift+A";
    const after = document.createTextNode(" to drag them into the layout you want.");
    target.append(before, key, after);
    pageTarget.append(target);

    model.setToolMode("select");
    installHitTest(target, pageTarget, before);
    target.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }));

    const editor = document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
    expect(editor).toBeTruthy();
    expect(editor?.value).toBe("Select one or more elements, then use Arrange or");
    expect(target.querySelector("kbd")).toBe(key);
    expect(key.textContent).toBe("Shift+A");
    expect(after.nodeValue).toBe(" to drag them into the layout you want.");

    await vi.waitFor(() => {
      expect(editor?.style.opacity).toBe("0");
      expect(document.querySelector("[data-mesurer-text-edit-ring='true']")).toBeTruthy();
    });

    editor!.value = "Updated copy";
    editor!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(before.nodeValue).toBe("Updated copy ");
    expect(target.querySelector("kbd")).toBe(key);
    expect(key.textContent).toBe("Shift+A");
    expect(after.nodeValue).toBe(" to drag them into the layout you want.");

    editor!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(document.querySelector("[data-mesurer-text-editor='true']")).toBeNull();
    expect(before.nodeValue).toBe("Select one or more elements, then use Arrange or ");

    installHitTest(target, pageTarget, after);
    target.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      clientX: 200,
      clientY: 100,
    }));

    const trailingEditor = document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
    expect(trailingEditor).toBeTruthy();
    expect(trailingEditor?.value).toBe("to drag them into the layout you want.");
    expect(target.querySelector("kbd")).toBe(key);
    expect(before.nodeValue).toBe("Select one or more elements, then use Arrange or ");
  });
});
