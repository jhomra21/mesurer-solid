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
    id: "test.text-editing-ownership",
    provides: ["runtime:solid", "tool:select"],
    setup(ctx) {
      ctx.service.provide("runtime:solid", runtime);
      installTextEditing(ctx, runtime);
    },
  }));
  model.setToolMode("select");
  return { host, model, pageTarget };
};

const installHitTest = (target: HTMLElement, pageTarget: HTMLElement) => {
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [target, pageTarget, document.body, document.documentElement],
  });
};

const beginEdit = (target: HTMLElement, pageTarget: HTMLElement) => {
  installHitTest(target, pageTarget);
  target.dispatchEvent(new MouseEvent("dblclick", {
    bubbles: true,
    clientX: 10,
    clientY: 10,
  }));
  return document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
};

const commitText = async (
  target: HTMLElement,
  pageTarget: HTMLElement,
  desired: string,
  service: MesurerTextEditService,
) => {
  const editor = beginEdit(target, pageTarget);
  if (!editor) throw new Error("Direct text editor did not open.");
  editor.value = desired;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  await vi.waitFor(() => expect(service.intents().at(-1)?.desired).toBe(desired));
};

describe("direct text ownership", () => {
  it("renders restored Desired text through undo/redo and restores Live text on clear", async () => {
    const { host, pageTarget } = await setup();
    const target = document.createElement("p");
    target.id = "copy";
    target.textContent = "Original";
    pageTarget.append(target);
    const service = host.service.get<MesurerTextEditService>(MESURER_TEXT_EDIT_SERVICE_ID)!;

    await commitText(target, pageTarget, "First", service);
    await commitText(target, pageTarget, "Second", service);
    expect(target.textContent).toBe("Second");

    expect(host.undo()).toBe(true);
    await vi.waitFor(() => expect(target.textContent).toBe("First"));
    expect(service.intents()).toHaveLength(1);
    expect(service.intents()[0]?.desired).toBe("First");

    expect(host.redo()).toBe(true);
    await vi.waitFor(() => expect(target.textContent).toBe("Second"));
    expect(service.intents()[0]?.desired).toBe("Second");

    await service.clear();
    await vi.waitFor(() => expect(target.textContent).toBe("Original"));
    expect(service.intents()).toHaveLength(0);
  });

  it("relinquishes ownership when the host application changes the text", async () => {
    const { host, pageTarget } = await setup();
    const target = document.createElement("p");
    target.id = "host-copy";
    target.textContent = "Original";
    pageTarget.append(target);
    const service = host.service.get<MesurerTextEditService>(MESURER_TEXT_EDIT_SERVICE_ID)!;

    await commitText(target, pageTarget, "Desired", service);
    const node = target.firstChild;
    if (!(node instanceof Text)) throw new Error("Expected the test target to retain its direct Text node.");
    node.nodeValue = "Host authored";
    await Promise.resolve();
    expect(target.textContent).toBe("Host authored");

    expect(host.undo()).toBe(true);
    await Promise.resolve();
    expect(target.textContent).toBe("Host authored");

    await service.clear();
    await Promise.resolve();
    expect(target.textContent).toBe("Host authored");

    host.dispose();
    mountedHosts.splice(mountedHosts.indexOf(host), 1);
    expect(target.textContent).toBe("Host authored");
  });

  it("does not intercept descendants that inherit native contenteditable", async () => {
    const { pageTarget } = await setup();
    const nativeEditor = document.createElement("div");
    nativeEditor.contentEditable = "true";
    const child = document.createElement("span");
    child.textContent = "Native editing";
    nativeEditor.append(child);
    pageTarget.append(nativeEditor);

    expect(child.isContentEditable).toBe(true);
    expect(beginEdit(child, pageTarget)).toBeNull();
  });

  it("respects a nested contenteditable=false boundary", async () => {
    const { pageTarget } = await setup();
    const nativeEditor = document.createElement("div");
    nativeEditor.contentEditable = "true";
    const child = document.createElement("span");
    child.contentEditable = "false";
    child.textContent = "Mesurer may edit this direct text";
    nativeEditor.append(child);
    pageTarget.append(nativeEditor);

    expect(child.isContentEditable).toBe(false);
    expect(beginEdit(child, pageTarget)).not.toBeNull();
  });
});
