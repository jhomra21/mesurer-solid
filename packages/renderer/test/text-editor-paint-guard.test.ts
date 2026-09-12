import { afterEach, describe, expect, it } from "vitest";
import { createMesurerPluginHost, defineMesurerPlugin } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../src/ComposableMesurer";
import { createMesurerModel } from "../src/model/create-mesurer-model";
import { installTextEditing } from "../src/runtime/text-editing";
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
    id: "test.text-editor-paint-guard",
    provides: ["runtime:solid", "tool:select"],
    setup(ctx) {
      ctx.service.provide("runtime:solid", runtime);
      installTextEditing(ctx, runtime);
    },
  }));

  return { model, pageTarget };
};

const isTransparent = (value: string) => value === "transparent"
  || value === "rgba(0, 0, 0, 0)"
  || value === "rgba(0,0,0,0)";

describe("direct text editor paint guard", () => {
  it("is installed before editor creation and wins on the first synchronous edit frame", async () => {
    const { model, pageTarget } = await setup();
    const guard = document.querySelector<HTMLStyleElement>("style[data-mesurer-text-editor-paint-guard='true']");
    expect(guard).toBeTruthy();
    expect(guard?.textContent).toContain("[data-mesurer-text-editor=\"true\"]::selection");
    expect(guard?.textContent).toContain("-webkit-text-fill-color: transparent !important");
    expect(guard?.textContent).toContain("caret-color: transparent !important");

    const target = document.createElement("p");
    target.textContent = "Scroll and inspect this card.";
    pageTarget.append(target);
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: () => [target, pageTarget, document.body, document.documentElement],
    });

    model.setToolMode("select");
    target.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      clientX: 40,
      clientY: 40,
    }));

    const editor = document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
    expect(editor).toBeTruthy();
    const computed = getComputedStyle(editor!);
    expect(computed.opacity).toBe("0");
    expect(isTransparent(computed.color)).toBe(true);
    expect(isTransparent(computed.backgroundColor)).toBe(true);
    expect(computed.boxShadow).toBe("none");
  });
});
