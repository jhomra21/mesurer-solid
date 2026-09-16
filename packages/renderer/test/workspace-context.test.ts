import { describe, expect, it } from "vitest";
import type { InspectMeasurement } from "../src/core/types";
import { createMesurerModel } from "../src/model/create-mesurer-model";
import { createMesurerWorkspaceRuntime } from "../src/runtime/workspace-context";

const zeroEdges = { top: 0, right: 0, bottom: 0, left: 0 };
const selectionFor = (element: HTMLElement): InspectMeasurement => {
  const rect = { left: 10, top: 10, width: 120, height: 40 };
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ ...rect, right: 130, bottom: 50, x: 10, y: 10, toJSON: () => ({}) }),
  });
  return {
    id: "selection",
    rect,
    paddingRect: rect,
    marginRect: rect,
    padding: zeroEdges,
    margin: zeroEdges,
    label: "Target",
    elementRef: element,
  };
};

describe("createMesurerWorkspaceRuntime", () => {
  it("stays bound to the renderer model supplied by its owning instance", () => {
    const firstModel = createMesurerModel({ initialEnabled: true });
    const secondModel = createMesurerModel({ initialEnabled: true });

    firstModel.addGuide({ id: "first-guide", orientation: "vertical", position: 120 });
    secondModel.addGuide({ id: "second-guide", orientation: "horizontal", position: 240 });
    secondModel.setRulersVisible(true);

    const firstRuntime = createMesurerWorkspaceRuntime({
      model: firstModel,
      ownerDocument: document,
      ownerWindow: window,
    });
    const secondRuntime = createMesurerWorkspaceRuntime({
      model: secondModel,
      ownerDocument: document,
      ownerWindow: window,
    });

    expect(firstRuntime.snapshot().guides.map((guide) => guide.id)).toEqual(["first-guide"]);
    expect(firstRuntime.snapshot().rulersVisible).toBe(false);
    expect(secondRuntime.snapshot().guides.map((guide) => guide.id)).toEqual(["second-guide"]);
    expect(secondRuntime.snapshot().rulersVisible).toBe(true);

    firstModel.addGuide({ id: "first-guide-2", orientation: "vertical", position: 320 });
    expect(firstRuntime.snapshot().guides.map((guide) => guide.id)).toEqual(["first-guide", "first-guide-2"]);
    expect(secondRuntime.snapshot().guides.map((guide) => guide.id)).toEqual(["second-guide"]);

    firstRuntime.dispose();
    secondRuntime.dispose();
    firstModel.dispose();
    secondModel.dispose();
  });

  it("does not notify subscribers while annotation state is being read", async () => {
    const target = document.createElement("div");
    target.id = "annotation-read-target";
    target.textContent = "Target";
    document.body.append(target);

    const model = createMesurerModel({ initialEnabled: true });
    model.setSelectedMeasurements([selectionFor(target)]);
    const runtime = createMesurerWorkspaceRuntime({
      model,
      ownerDocument: document,
      ownerWindow: window,
    });
    const annotation = runtime.addSelectionAnnotation("Track this target");
    let notifications = 0;
    const unsubscribe = runtime.subscribe(() => {
      notifications += 1;
    });

    const movedRect = { left: 80, top: 44, width: 120, height: 40 };
    Object.defineProperty(target, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        ...movedRect,
        right: movedRect.left + movedRect.width,
        bottom: movedRect.top + movedRect.height,
        x: movedRect.left,
        y: movedRect.top,
        toJSON: () => ({}),
      }),
    });

    expect(runtime.annotations()).toHaveLength(1);
    expect(runtime.annotation(annotation.id)?.resolvedTargets[0]?.element).toBe(target);
    expect(runtime.annotationRect(annotation.id)?.left).toBe(movedRect.left);
    expect(notifications).toBe(0);

    window.dispatchEvent(new Event("resize"));
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    expect(notifications).toBe(1);
    const refreshed = runtime.annotations()[0];
    expect(refreshed.anchor.kind).toBe("elements");
    if (refreshed.anchor.kind === "elements") {
      expect(refreshed.anchor.targets[0]?.lastRect.left).toBe(movedRect.left);
    }

    unsubscribe();
    runtime.dispose();
    model.dispose();
    target.remove();
  });

  it("rebinding stays inside an HTMLElement target within its ShadowRoot", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const pageTarget = document.createElement("section");
    const outside = document.createElement("aside");
    shadow.append(pageTarget, outside);
    document.body.append(host);

    const original = document.createElement("div");
    original.id = "shadow-annotation-target";
    original.textContent = "Target";
    pageTarget.append(original);

    const model = createMesurerModel({ initialEnabled: true });
    model.setSelectedMeasurements([selectionFor(original)]);
    const runtime = createMesurerWorkspaceRuntime({
      model,
      ownerDocument: document,
      ownerWindow: window,
      pageTarget,
    });
    const annotation = runtime.addSelectionAnnotation("Keep this target");

    original.remove();
    const wrongTreeCandidate = document.createElement("div");
    wrongTreeCandidate.id = "shadow-annotation-target";
    wrongTreeCandidate.textContent = "Target";
    outside.append(wrongTreeCandidate);

    expect(runtime.annotation(annotation.id)?.resolvedTargets[0]?.element).toBeNull();

    wrongTreeCandidate.remove();
    const replacement = document.createElement("div");
    replacement.id = "shadow-annotation-target";
    replacement.textContent = "Target";
    selectionFor(replacement);
    pageTarget.append(replacement);

    expect(runtime.annotation(annotation.id)?.resolvedTargets[0]?.element).toBe(replacement);

    runtime.dispose();
    model.dispose();
    host.remove();
  });

  it("restores the exact inline display value and priority after capture", () => {
    const uiRoot = document.createElement("div");
    const chrome = document.createElement("div");
    chrome.dataset.mesurerLayer = "chrome";
    chrome.style.setProperty("display", "flex", "important");
    uiRoot.append(chrome);

    const model = createMesurerModel({ initialEnabled: true });
    const runtime = createMesurerWorkspaceRuntime({
      model,
      ownerDocument: document,
      ownerWindow: window,
      uiRoot,
    });

    runtime.prepareCapture();
    expect(chrome.style.getPropertyValue("display")).toBe("none");
    expect(chrome.style.getPropertyPriority("display")).toBe("important");

    runtime.finishCapture();
    expect(chrome.style.getPropertyValue("display")).toBe("flex");
    expect(chrome.style.getPropertyPriority("display")).toBe("important");

    runtime.dispose();
    model.dispose();
  });
});
