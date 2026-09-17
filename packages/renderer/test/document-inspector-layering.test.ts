import { afterEach, describe, expect, it } from "vitest";
import { createDocumentInspectorMount } from "../src/runtime/document-inspector-mount";

afterEach(() => {
  document.body.replaceChildren();
});

describe("document inspector layering", () => {
  it("puts ownership evidence below fixed chrome while controls remain reachable above it", () => {
    const runtime = {
      ownerDocument: document,
      ownerWindow: window,
      pageTarget: document.body,
      createInspectorMount: () => {
        throw new Error("document-backed test must not use the isolated inspector mount");
      },
    };

    const mount = createDocumentInspectorMount(runtime);
    expect(mount.element.dataset.mesurerDocumentInspectorMount).toBe("true");
    expect(mount.element.style.position).toBe("absolute");
    expect(mount.element.style.zIndex).toBe("");

    const highlight = document.createElement("div");
    highlight.dataset.mesurerAnnotationTargetHighlight = "true";
    highlight.style.zIndex = "2147483645";
    mount.element.append(highlight);

    const panel = document.createElement("div");
    panel.dataset.mesurerAnnotationPanel = "true";
    mount.element.append(panel);

    const marker = document.createElement("button");
    marker.dataset.mesurerAnnotationMarker = "true";
    mount.element.append(marker);

    const trigger = document.createElement("button");
    trigger.dataset.mesurerAnnotationTrigger = "true";
    mount.element.append(trigger);

    const composer = document.createElement("div");
    composer.dataset.mesurerAnnotationComposer = "true";
    mount.element.append(composer);

    const rendererRoot = document.createElement("div");
    rendererRoot.className = "mesurer-solid-root";
    document.body.append(rendererRoot);

    const rendererZ = Number(getComputedStyle(rendererRoot).zIndex);
    const highlightZ = Number(getComputedStyle(highlight).zIndex);
    const panelZ = Number(getComputedStyle(panel).zIndex);
    const markerZ = Number(getComputedStyle(marker).zIndex);
    const triggerZ = Number(getComputedStyle(trigger).zIndex);
    const composerZ = Number(getComputedStyle(composer).zIndex);

    expect(rendererZ).toBe(2147483000);
    expect(highlightZ).toBe(2147482950);
    expect(highlightZ).toBeLessThan(rendererZ);
    expect(panelZ).toBe(2147483646);
    expect(markerZ).toBe(2147483647);
    expect(triggerZ).toBe(2147483647);
    expect(composerZ).toBe(2147483647);
    expect(panelZ).toBeGreaterThan(rendererZ);
    expect(markerZ).toBeGreaterThan(panelZ);

    mount.dispose();
    expect(mount.element.isConnected).toBe(false);
    expect(document.querySelector("style[data-mesurer-document-inspector-layer-style='true']")).toBeNull();
  });
});
