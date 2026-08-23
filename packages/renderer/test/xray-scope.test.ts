import { describe, expect, it } from "vitest";
import { createXrayScope } from "../src/runtime/xray-scope";

describe("createXrayScope", () => {
  it("installs HTMLElement-scoped X-ray CSS in the target's ShadowRoot", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const target = document.createElement("section");
    const child = document.createElement("div");
    target.append(child);
    shadow.append(target);
    document.body.append(host);

    const scope = createXrayScope({
      ownerDocument: document,
      target,
      instanceId: 99,
    });

    scope.setVisible(true);
    expect(target.classList.contains("mesurer-xray-99")).toBe(true);
    expect(shadow.querySelector("style[data-mesurer-xray-style='true']")).not.toBeNull();
    expect(document.head.querySelector("style[data-mesurer-xray-style='true']")).toBeNull();

    scope.setVisible(false);
    expect(target.classList.contains("mesurer-xray-99")).toBe(false);
    expect(shadow.querySelector("style[data-mesurer-xray-style='true']")).toBeNull();

    scope.dispose();
    host.remove();
  });
});
