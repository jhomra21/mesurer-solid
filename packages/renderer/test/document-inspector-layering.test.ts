import { afterEach, describe, expect, it } from "vitest";
import type { MesurerSolidRuntimeService } from "../src/ComposableMesurer";
import { createDocumentInspectorMount } from "../src/runtime/document-inspector-mount";

afterEach(() => {
  document.body.replaceChildren();
});

describe("document inspector layering", () => {
  it("lets page evidence sit below the fixed toolbar without lowering interactive annotation surfaces", () => {
    const runtime = {
      ownerDocument: document,
      ownerWindow: window,
      pageTarget: document.body,
      createInspectorMount: () => {
        throw new Error("document-backed test must not use the isolated inspector mount");
      },
    } as unknown as MesurerSolidRuntimeService;

    const mount = createDocumentInspectorMount(runtime);
    expect(mount.element.dataset.mesurerDocumentInspectorMount).toBe("true");
    expect(mount.element.style.position).toBe("absolute");
    expect(mount.element.style.zIndex).toBe("");

    const layerStyle = mount.element.querySelector<HTMLStyleElement>(
      "style[data-mesurer-document-inspector-layer-style='true']",
    );
    expect(layerStyle).not.toBeNull();
    expect(layerStyle!.textContent).toContain(
      "[data-mesurer-annotation-target-highlight=\"true\"]",
    );
    expect(layerStyle!.textContent).toContain("z-index: 2147482950 !important");

    const highlight = document.createElement("div");
    highlight.dataset.mesurerAnnotationTargetHighlight = "true";
    highlight.style.zIndex = "2147483645";
    mount.element.append(highlight);

    const marker = document.createElement("button");
    marker.dataset.mesurerAnnotationMarker = "true";
    marker.style.zIndex = "2147483647";
    mount.element.append(marker);

    const rendererRoot = document.createElement("div");
    rendererRoot.className = "mesurer-solid-root";
    document.body.append(rendererRoot);

    expect(getComputedStyle(highlight).zIndex).toBe("2147482950");
    expect(getComputedStyle(rendererRoot).zIndex).toBe("2147483000");
    expect(getComputedStyle(marker).zIndex).toBe("2147483647");
    expect(Number(getComputedStyle(highlight).zIndex)).toBeLessThan(
      Number(getComputedStyle(rendererRoot).zIndex),
    );
    expect(Number(getComputedStyle(marker).zIndex)).toBeGreaterThan(
      Number(getComputedStyle(rendererRoot).zIndex),
    );

    mount.dispose();
    expect(mount.element.isConnected).toBe(false);
  });
});
