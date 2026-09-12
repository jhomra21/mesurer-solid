import { afterEach, describe, expect, it, vi } from "vitest";
import { createMesurerPluginHost, defineMesurerPlugin } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../src/ComposableMesurer";
import { createMesurerModel } from "../src/model/create-mesurer-model";
import { installDirectEditSelectionChromeOwnership } from "../src/runtime/text-editing-selection-chrome";
import { createMesurerWorkspaceRuntime } from "../src/runtime/workspace-context";

const mountedHosts: Array<ReturnType<typeof createMesurerPluginHost>> = [];

afterEach(() => {
  while (mountedHosts.length) mountedHosts.pop()?.dispose();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

const selectedRoot = (opacity?: string) => {
  const root = document.createElement("div");
  root.dataset.mesurerSelectedMeasurement = "true";
  if (opacity) root.style.opacity = opacity;
  root.append(document.createElement("div"));
  return root;
};

describe("direct text-edit selection chrome ownership", () => {
  it("keeps selected chrome paintless in both isolated and document layers for the editor lifetime", async () => {
    const host = createMesurerPluginHost();
    mountedHosts.push(host);
    const pageTarget = document.createElement("main");
    const runtimeMount = document.createElement("div");
    runtimeMount.dataset.mesurerTextEditRuntime = "true";

    const documentSelection = selectedRoot("0.65");
    const islandHost = document.createElement("div");
    const islandRoot = islandHost.attachShadow({ mode: "open" });
    const isolatedSelection = selectedRoot("0.8");
    islandRoot.append(isolatedSelection);
    document.body.append(pageTarget, runtimeMount, documentSelection, islandHost);

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
      createWorkspaceRuntime,
      createInspectorMount() {
        const element = document.createElement("div");
        element.dataset.mesurerInspectorUi = "true";
        document.body.append(element);
        return { element, dispose: () => element.remove() };
      },
    };

    await host.load(defineMesurerPlugin({
      id: "test.direct-edit-selection-chrome",
      provides: ["runtime:solid"],
      setup(ctx) {
        ctx.service.provide("runtime:solid", runtime);
        installDirectEditSelectionChromeOwnership(ctx, runtime, islandRoot);
      },
    }));

    expect(documentSelection.style.opacity).toBe("0.65");
    expect(isolatedSelection.style.opacity).toBe("0.8");

    const editor = document.createElement("textarea");
    editor.dataset.mesurerTextEditor = "true";
    runtimeMount.append(editor);

    await vi.waitFor(() => {
      for (const root of [documentSelection, isolatedSelection]) {
        expect(root.style.opacity).toBe("0");
        expect(root.style.getPropertyPriority("opacity")).toBe("important");
        expect(root.dataset.mesurerDirectEditSelectionSuppressed).toBe("true");
      }
    });

    // Reproduce the portal/reconciliation handoff that caused the ghost: a new
    // selected root can briefly appear in either ownership layer while the
    // editor is already active. Both replacements must be paintless before the
    // next frame without being removed from the DOM.
    const replacementDocument = selectedRoot();
    const replacementIsolated = selectedRoot();
    document.body.append(replacementDocument);
    islandRoot.append(replacementIsolated);
    await vi.waitFor(() => {
      for (const root of [replacementDocument, replacementIsolated]) {
        expect(root.style.opacity).toBe("0");
        expect(root.style.getPropertyPriority("opacity")).toBe("important");
        expect(root.dataset.mesurerDirectEditSelectionSuppressed).toBe("true");
        expect(root.isConnected).toBe(true);
      }
    });

    editor.remove();
    await vi.waitFor(() => {
      expect(documentSelection.style.opacity).toBe("0.65");
      expect(isolatedSelection.style.opacity).toBe("0.8");
      expect(replacementDocument.style.opacity).toBe("");
      expect(replacementIsolated.style.opacity).toBe("");
      for (const root of [documentSelection, isolatedSelection, replacementDocument, replacementIsolated]) {
        expect(root.style.getPropertyPriority("opacity")).toBe("");
        expect(root.dataset.mesurerDirectEditSelectionSuppressed).toBeUndefined();
      }
    });
  });
});