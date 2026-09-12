import { afterEach, describe, expect, it, vi } from "vitest";
import { createMesurerPluginHost, defineMesurerPlugin } from "@jhomra21/mesurer-solid-core";
import { getInspectMeasurement } from "@jhomra21/mesurer-solid-dom";
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

const hoverRoot = (opacity?: string) => {
  const root = document.createElement("div");
  root.dataset.mesurerHoverMeasurement = "true";
  if (opacity) root.style.opacity = opacity;
  return root;
};

describe("direct text-edit selection chrome ownership", () => {
  it("keeps selected and same-target hover chrome paintless while preserving hover for other elements", async () => {
    const host = createMesurerPluginHost();
    mountedHosts.push(host);
    const pageTarget = document.createElement("main");
    const selectedElement = document.createElement("p");
    selectedElement.textContent = "Selected copy";
    const otherElement = document.createElement("p");
    otherElement.textContent = "Other copy";
    pageTarget.append(selectedElement, otherElement);

    const runtimeMount = document.createElement("div");
    runtimeMount.dataset.mesurerTextEditRuntime = "true";
    const originalSelection = selectedRoot("0.65");

    // Reproduce the public isolated mount: the text runtime is document-backed,
    // but Select hover can still be sitting in the original ShadowRoot on the
    // exact frame where direct editing starts.
    const islandHost = document.createElement("div");
    const islandRoot = islandHost.attachShadow({ mode: "open" });
    const hover = hoverRoot("0.8");
    islandRoot.append(hover);
    document.body.append(pageTarget, runtimeMount, originalSelection, islandHost);

    const model = createMesurerModel({ initialEnabled: true });
    const measurement = getInspectMeasurement(selectedElement, window, "selection-1");
    model.setSelectedMeasurements([measurement], measurement);
    model.setHoverTarget(selectedElement, { left: 0, top: 0, width: 100, height: 24 });

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

    expect(originalSelection.style.opacity).toBe("0.65");
    expect(hover.style.opacity).toBe("0.8");

    const editor = document.createElement("textarea");
    editor.dataset.mesurerTextEditor = "true";
    runtimeMount.append(editor);

    await vi.waitFor(() => {
      expect(originalSelection.style.opacity).toBe("0");
      expect(originalSelection.style.getPropertyPriority("opacity")).toBe("important");
      expect(originalSelection.dataset.mesurerDirectEditSelectionSuppressed).toBe("true");
      expect(hover.style.opacity).toBe("0");
      expect(hover.style.getPropertyPriority("opacity")).toBe("important");
      expect(hover.dataset.mesurerDirectEditHoverSuppressed).toBe("true");
    });
    expect(originalSelection.isConnected).toBe(true);
    expect(hover.isConnected).toBe(true);

    // Solid can replace a selected MeasurementBox while text-edit state settles.
    // Any replacement stays paintless without disturbing its DOM/anchor state.
    const replacementSelection = selectedRoot();
    document.body.append(replacementSelection);
    await vi.waitFor(() => {
      expect(replacementSelection.style.opacity).toBe("0");
      expect(replacementSelection.style.getPropertyPriority("opacity")).toBe("important");
      expect(replacementSelection.dataset.mesurerDirectEditSelectionSuppressed).toBe("true");
    });

    // Select remains active during direct edit. Once the pointer moves to a
    // different page element, its hover chrome must become visible again while
    // the edited element's ordinary selected box stays suppressed.
    model.setHoverTarget(otherElement, { left: 0, top: 40, width: 100, height: 24 });
    await vi.waitFor(() => {
      expect(hover.style.opacity).toBe("0.8");
      expect(hover.style.getPropertyPriority("opacity")).toBe("");
      expect(hover.dataset.mesurerDirectEditHoverSuppressed).toBeUndefined();
      expect(originalSelection.style.opacity).toBe("0");
    });

    // Moving back over the edited/selected element makes only that redundant
    // hover presentation paintless again.
    model.setHoverTarget(selectedElement, { left: 0, top: 0, width: 100, height: 24 });
    await vi.waitFor(() => {
      expect(hover.style.opacity).toBe("0");
      expect(hover.dataset.mesurerDirectEditHoverSuppressed).toBe("true");
    });

    editor.remove();
    await vi.waitFor(() => {
      expect(originalSelection.style.opacity).toBe("0.65");
      expect(originalSelection.style.getPropertyPriority("opacity")).toBe("");
      expect(originalSelection.dataset.mesurerDirectEditSelectionSuppressed).toBeUndefined();
      expect(replacementSelection.style.opacity).toBe("");
      expect(replacementSelection.dataset.mesurerDirectEditSelectionSuppressed).toBeUndefined();
      expect(hover.style.opacity).toBe("0.8");
      expect(hover.dataset.mesurerDirectEditHoverSuppressed).toBeUndefined();
    });
  });
});