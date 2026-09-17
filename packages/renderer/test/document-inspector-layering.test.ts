import { afterEach, describe, expect, it } from "vitest";
import { createDocumentInspectorMount } from "../src/runtime/document-inspector-mount";

afterEach(() => {
  document.body.replaceChildren();
});

describe("document inspector layering", () => {
  it("keeps document Context below the fixed renderer while preserving child ordering", () => {
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
    expect(mount.element.style.zIndex).toBe("2147482999");

    const highlight = document.createElement("div");
    highlight.dataset.mesurerAnnotationTargetHighlight = "true";
    highlight.style.position = "absolute";
    highlight.style.zIndex = "2147483645";
    mount.element.append(highlight);

    const panel = document.createElement("div");
    panel.dataset.mesurerAnnotationPanel = "true";
    panel.style.position = "absolute";
    panel.style.zIndex = "2147483646";
    mount.element.append(panel);

    const marker = document.createElement("button");
    marker.dataset.mesurerAnnotationMarker = "true";
    marker.style.position = "absolute";
    marker.style.zIndex = "2147483647";
    mount.element.append(marker);

    const rendererRoot = document.createElement("div");
    rendererRoot.className = "mesurer-solid-root";
    document.body.append(rendererRoot);

    const contextZ = Number(getComputedStyle(mount.element).zIndex);
    const rendererZ = Number(getComputedStyle(rendererRoot).zIndex);
    expect(contextZ).toBe(2147482999);
    expect(rendererZ).toBe(2147483000);
    expect(contextZ).toBeLessThan(rendererZ);

    expect(getComputedStyle(highlight).zIndex).toBe("2147483645");
    expect(getComputedStyle(panel).zIndex).toBe("2147483646");
    expect(getComputedStyle(marker).zIndex).toBe("2147483647");

    mount.dispose();
    expect(mount.element.isConnected).toBe(false);
  });
});
