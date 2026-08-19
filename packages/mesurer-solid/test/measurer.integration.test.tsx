import { flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, describe, expect, it } from "vitest";
import Measurer from "../src/Measurer";
import type { MeasurerModel } from "../src/model/create-measurer-model";

const settle = async () => {
  await Promise.resolve();
  flush();
  await Promise.resolve();
  flush();
};

const mounted: Array<() => void> = [];

afterEach(async () => {
  while (mounted.length) mounted.pop()?.();
  await settle();
  document.body.replaceChildren();
  document.head.querySelectorAll("#mesurer-solid-styles, #mesurer-solid-xray-styles").forEach((node) => node.remove());
});

describe("Measurer host integration", () => {
  it("mounts through Solid 2 and responds to keyboard mode shortcuts", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let model: MeasurerModel | undefined;

    const dispose = render(
      () => <Measurer persistKey="integration-main" onModel={(value) => { model = value; }} />,
      host,
    );
    mounted.push(dispose);
    await settle();

    expect(document.querySelector("[data-mesurer-root]")).toBeTruthy();
    expect(model).toBeDefined();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    await settle();
    expect(model!.current.enabled).toBe(true);
    expect(model!.current.toolMode).toBe("select");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    await settle();
    expect(model!.current.rulersVisible).toBe(true);

    model!.addGuide({ id: "integration-guide", orientation: "vertical", position: 100 });
    model!.setSelectedGuideIds(["integration-guide"]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    await settle();
    expect(model!.current.guides).toHaveLength(0);
  });

  it("creates and cleans up an Element portal host inside a ShadowRoot", async () => {
    const appHost = document.createElement("div");
    const shadowHost = document.createElement("div");
    const shadow = shadowHost.attachShadow({ mode: "open" });
    document.body.append(appHost, shadowHost);

    const dispose = render(
      () => <Measurer persistKey="integration-shadow" portalTarget={shadow} />,
      appHost,
    );
    mounted.push(dispose);
    await settle();

    const portalHost = shadow.querySelector<HTMLElement>("[data-mesurer-portal]");
    expect(portalHost).toBeTruthy();
    expect(shadow.querySelector("[data-mesurer-root]")).toBeTruthy();
    expect(shadow.querySelector("#mesurer-solid-styles")).toBeTruthy();

    dispose();
    mounted.pop();
    await settle();
    expect(shadow.querySelector("[data-mesurer-portal]")).toBeNull();
  });
});
