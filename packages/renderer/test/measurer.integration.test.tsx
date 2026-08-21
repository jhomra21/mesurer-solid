import { flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  vi.restoreAllMocks();
});

describe("Measurer host integration", () => {
  it("uses the upstream Mesurer toolbar/settings visual contract and public shortcuts", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Measurer persistKey="integration-main" />, host);
    mounted.push(dispose);
    await settle();

    expect(document.querySelector("[data-mesurer-root]")).toBeTruthy();
    const toolbar = document.querySelector<HTMLElement>("[data-mesurer-toolbar='true']");
    expect(toolbar).toBeTruthy();
    expect(toolbar!.className).toContain("mesurer-toolbar-surface");
    expect(toolbar!.className).toContain("msr:rounded-[12px]");
    expect(toolbar!.className).toContain("msr:p-1");

    const labels = [...toolbar!.querySelectorAll<HTMLButtonElement>("button[aria-label]")].map((button) => button.getAttribute("aria-label"));
    expect(labels.slice(0, 7)).toEqual([
      "Select (S)",
      "X-ray (X)",
      "Color picker (P)",
      "Rulers (R)",
      "Text inspector (A)",
      "Guides (G)",
      "Guide orientation menu",
    ]);
    expect(toolbar!.querySelector('button[aria-label="Toggle Mesurer (M)"]')).toBeNull();
    expect(toolbar!.querySelectorAll("svg").length).toBeGreaterThanOrEqual(7);

    const selectButton = toolbar!.querySelector<HTMLButtonElement>('button[aria-label="Select (S)"]')!;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    await settle();
    expect(selectButton.getAttribute("aria-pressed")).toBe("true");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    await settle();
    const rulers = document.querySelector<HTMLElement>("[data-mesurer-rulers='true']");
    expect(rulers).toBeTruthy();
    expect(rulers!.querySelector(".msr\\:left-\\[18px\\]")).toBeTruthy();
    expect(toolbar!.querySelector<HTMLButtonElement>('button[aria-label="Rulers (R)"]')?.getAttribute("aria-pressed")).toBe("true");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", ctrlKey: true }));
    await settle();
    const settings = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Settings"]');
    expect(settings).toBeTruthy();
    expect(settings!.className).toContain("msr:w-[272px]");
    const tabs = [...settings!.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Guides", "Select", "Color", "Rulers", "General"]);
    expect(tabs.find((tab) => tab.textContent === "Rulers")?.getAttribute("aria-selected")).toBe("true");
    expect(settings!.querySelector('[aria-label="Ruler settings"]')).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
    expect(document.querySelector('[role="dialog"][aria-label="Settings"]')).toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
    await settle();
    const picker = document.querySelector<HTMLElement>(".mesurer-color-picker");
    expect(picker).toBeTruthy();
    expect(picker!.className).toContain("msr:min-w-36");
    expect(picker!.className).toContain("msr:font-mono");
    expect(picker!.className).toContain("msr:text-[10px]");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    await settle();
    expect(selectButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("does not emit Solid strict untracked-read diagnostics", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Measurer persistKey="integration-strict-reads" />, host);
    mounted.push(dispose);
    await settle();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    await settle();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", ctrlKey: true }));
    await settle();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
    await settle();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    await settle();

    const strictReadWarnings = warn.mock.calls.filter((args) =>
      args.some((value) => String(value).includes("STRICT_READ_UNTRACKED")),
    );
    expect(strictReadWarnings).toEqual([]);
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
    expect(shadow.querySelector(".mesurer-toolbar-surface")).toBeTruthy();

    dispose();
    mounted.pop();
    await settle();
    expect(shadow.querySelector("[data-mesurer-portal]")).toBeNull();
  });
});
