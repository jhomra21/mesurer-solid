import { afterEach, describe, expect, it } from "vitest";
import { documentHoverPortalTarget } from "../src/runtime/document-hover-portal";

const setup = () => {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  const overlay = document.createElement("div");
  const target = document.createElement("div");
  shadow.append(overlay);
  document.body.append(host, target);

  return { host, shadow, overlay, target };
};

const setupDocumentOverlay = () => {
  const overlay = document.createElement("div");
  const target = document.createElement("div");
  document.body.append(overlay, target);

  return { overlay, target };
};

const addContextMount = () => {
  const contextRoot = document.createElement("div");
  contextRoot.dataset.mesurerDocumentInspectorMount = "true";
  contextRoot.dataset.mesurerContextRoot = "true";
  document.body.append(contextRoot);

  return contextRoot;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("documentHoverPortalTarget", () => {
  it("uses the stable document Context mount before any panel or composer exists", () => {
    const { overlay, target } = setup();
    addContextMount();

    expect(document.querySelector("[data-mesurer-annotation-panel='true']")).toBeNull();
    expect(document.querySelector("[data-mesurer-annotation-composer='true']")).toBeNull();
    expect(documentHoverPortalTarget(overlay, target)).toBe(document.body);
  });

  it("uses the Context document plane for non-isolated renderers too", () => {
    const { overlay, target } = setupDocumentOverlay();
    addContextMount();

    expect(documentHoverPortalTarget(overlay, target)).toBe(document.body);
  });

  it("keeps ordinary hover chrome isolated when no document inspector owns it", () => {
    const { overlay, target } = setup();
    expect(documentHoverPortalTarget(overlay, target)).toBeNull();
  });

  it("keeps Typography's document-backed inspector behavior", () => {
    const { overlay, target } = setup();
    const inspector = document.createElement("div");
    inspector.dataset.mesurerTextInspectorInfo = "true";
    document.body.append(inspector);

    expect(documentHoverPortalTarget(overlay, target)).toBe(document.body);
  });

  it("does not portal hover for a target owned by the same shadow tree", () => {
    const { shadow, overlay } = setup();
    const target = document.createElement("div");
    shadow.append(target);
    addContextMount();

    expect(documentHoverPortalTarget(overlay, target)).toBeNull();
  });
});
