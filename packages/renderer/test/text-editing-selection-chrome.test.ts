import { afterEach, describe, expect, it, vi } from "vitest";
import { createMesurerPluginHost, defineMesurerPlugin } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../src/ComposableMesurer";
import { getInspectMeasurement } from "../src/core/dom";
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
  it("keeps duplicate selection and edit-owned hover chrome paintless through parent reselection", async () => {
    const host = createMesurerPluginHost();
    mountedHosts.push(host);
    const pageTarget = document.createElement("main");
    const parent = document.createElement("section");
    const child = document.createElement("p");
    child.textContent = "Select and annotate this card.";
    parent.append(child);
    pageTarget.append(parent);

    const runtimeMount = document.createElement("div");
    runtimeMount.dataset.mesurerTextEditRuntime = "true";

    const documentSelection = selectedRoot("0.65");
    const documentHover = hoverRoot("0.7");
    const islandHost = document.createElement("div");
    const islandRoot = islandHost.attachShadow({ mode: "open" });
    const isolatedSelection = selectedRoot("0.8");
    const isolatedHover = hoverRoot("0.75");
    islandRoot.append(isolatedSelection, isolatedHover);
    document.body.append(pageTarget, runtimeMount, documentSelection, documentHover, islandHost);

    const model = createMesurerModel({ initialEnabled: true });
    const childMeasurement = getInspectMeasurement(child, window);
    const parentMeasurement = getInspectMeasurement(parent, window);
    model.setSelectedMeasurements([childMeasurement], childMeasurement);
    model.setHoverTarget(child, childMeasurement.rect);

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
    expect(documentHover.style.opacity).toBe("0.7");
    expect(isolatedHover.style.opacity).toBe("0.75");

    const editor = document.createElement("textarea");
    editor.dataset.mesurerTextEditor = "true";
    runtimeMount.append(editor);

    await vi.waitFor(() => {
      for (const root of [documentSelection, isolatedSelection]) {
        expect(root.style.opacity).toBe("0");
        expect(root.style.getPropertyPriority("opacity")).toBe("important");
        expect(root.dataset.mesurerDirectEditSelectionSuppressed).toBe("true");
      }
      for (const root of [documentHover, isolatedHover]) {
        expect(root.style.opacity).toBe("0");
        expect(root.style.getPropertyPriority("opacity")).toBe("important");
        expect(root.dataset.mesurerDirectEditHoverSuppressed).toBe("true");
      }
    });

    // Hovering a different element must still work while direct editing stays
    // active. Select remains enabled, so only edit-owned/current-selection hover
    // is redundant.
    model.setHoverTarget(parent, parentMeasurement.rect);
    await vi.waitFor(() => {
      expect(documentHover.style.opacity).toBe("0.7");
      expect(isolatedHover.style.opacity).toBe("0.75");
      expect(documentHover.dataset.mesurerDirectEditHoverSuppressed).toBeUndefined();
      expect(isolatedHover.dataset.mesurerDirectEditHoverSuppressed).toBeUndefined();
    });

    // Reproduce the manual sequence: overwrite selection with the parent while
    // the child editor stays active, move back over the edited child, then select
    // the child again. The child's hover surface must remain paintless for the
    // entire handoff, even before it becomes the selected element again.
    model.setSelectedMeasurements([parentMeasurement], parentMeasurement);
    model.setHoverTarget(child, childMeasurement.rect);
    await vi.waitFor(() => {
      for (const root of [documentHover, isolatedHover]) {
        expect(root.style.opacity).toBe("0");
        expect(root.dataset.mesurerDirectEditHoverSuppressed).toBe("true");
      }
    });

    model.setSelectedMeasurements([childMeasurement], childMeasurement);
    await vi.waitFor(() => {
      for (const root of [documentHover, isolatedHover]) {
        expect(root.style.opacity).toBe("0");
        expect(root.dataset.mesurerDirectEditHoverSuppressed).toBe("true");
      }
    });

    // Reproduce the portal/reconciliation handoff too: replacement selected
    // roots in either ownership layer must stay mounted but paintless.
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
      expect(documentHover.style.opacity).toBe("0.7");
      expect(isolatedHover.style.opacity).toBe("0.75");
      for (const root of [documentSelection, isolatedSelection, replacementDocument, replacementIsolated]) {
        expect(root.style.getPropertyPriority("opacity")).toBe("");
        expect(root.dataset.mesurerDirectEditSelectionSuppressed).toBeUndefined();
      }
      for (const root of [documentHover, isolatedHover]) {
        expect(root.style.getPropertyPriority("opacity")).toBe("");
        expect(root.dataset.mesurerDirectEditHoverSuppressed).toBeUndefined();
      }
    });
  });
});
