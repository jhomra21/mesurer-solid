import { flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, describe, expect, it } from "vitest";
import Measurer from "../src/Measurer";

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
  it("mounts through Solid 2 and responds to public keyboard behavior", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(
      () => <Measurer persistKey="integration-main" />,
      host,
    );
    mounted.push(dispose);
    await settle();

    expect(document.querySelector("[data-mesurer-root]")).toBeTruthy();
    const selectButton = document.querySelector<HTMLButtonElement>('button[title="Select (S)"]');
    expect(selectButton).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    await settle();
    expect(selectButton!.classList.contains("is-active")).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    await settle();
    expect(document.querySelector(".msr-rulers")).toBeTruthy();
    expect(document.querySelector<HTMLButtonElement>('button[title="Rulers (R)"]')?.classList.contains("is-active")).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", ctrlKey: true }));
    await settle();
    expect(document.querySelector(".msr-settings")).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
    expect(document.querySelector(".msr-settings")).toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    await settle();
    expect(selectButton!.classList.contains("is-active")).toBe(false);
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
