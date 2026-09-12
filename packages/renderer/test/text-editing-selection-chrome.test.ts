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
  it("keeps selection state mounted but paintless for the editor lifetime and restores it after edit", async () => {
    const host = createMesurerPluginHost();
    mountedHosts.push(host);
    const pageTarget = document.createElement("main");
    const runtimeMount = document.createElement("div");
    runtimeMount.dataset.mesurerTextEditRuntime = "true";
    const originalSelection = selectedRoot("0.65");
    document.body.append(pageTarget, runtimeMount, originalSelection);

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
        installDirectEditSelectionChromeOwnership(ctx, runtime);
      },
    }));

    expect(originalSelection.style.opacity).toBe("0.65");
    expect(originalSelection.dataset.mesurerDirectEditSelectionSuppressed).toBeUndefined();

    const editor = document.createElement("textarea");
    editor.dataset.mesurerTextEditor = "true";
    runtimeMount.append(editor);

    await vi.waitFor(() => {
      expect(originalSelection.style.opacity).toBe("0");
      expect(originalSelection.style.getPropertyPriority("opacity")).toBe("important");
      expect(originalSelection.dataset.mesurerDirectEditSelectionSuppressed).toBe("true");
    });
    expect(originalSelection.isConnected).toBe(true);

    // Solid can replace a selected MeasurementBox while text-edit state settles.
    // Any replacement must become paintless without disturbing its DOM geometry.
    const replacementSelection = selectedRoot();
    document.body.append(replacementSelection);
    await vi.waitFor(() => {
      expect(replacementSelection.style.opacity).toBe("0");
      expect(replacementSelection.style.getPropertyPriority("opacity")).toBe("important");
      expect(replacementSelection.dataset.mesurerDirectEditSelectionSuppressed).toBe("true");
    });
    expect(replacementSelection.isConnected).toBe(true);

    editor.remove();
    await vi.waitFor(() => {
      expect(originalSelection.style.opacity).toBe("0.65");
      expect(originalSelection.style.getPropertyPriority("opacity")).toBe("");
      expect(originalSelection.dataset.mesurerDirectEditSelectionSuppressed).toBeUndefined();
      expect(replacementSelection.style.opacity).toBe("");
      expect(replacementSelection.dataset.mesurerDirectEditSelectionSuppressed).toBeUndefined();
    });
  });
});
