import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import ComposableMesurer from "../src/ComposableMesurer";
import { arrangePlugin } from "../src/plugins/arrange";
import { render } from "../src/solid-dom";

const mounted: Array<() => void> = [];

const settle = async () => {
  await Promise.resolve();
  flush();
  await Promise.resolve();
  flush();
};

afterEach(async () => {
  while (mounted.length) mounted.pop()?.();
  await settle();
  localStorage.clear();
  document.body.replaceChildren();
  document.head.querySelectorAll("#mesurer-solid-styles, #mesurer-solid-xray-styles").forEach((node) => node.remove());
});

const compactItem = (button: HTMLButtonElement) =>
  button.closest<HTMLElement>('[data-mesurer-toolbar-compact-item="true"]');

describe("compact toolbar", () => {
  it("hides only inactive tools and never changes active tool/plugin state", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => <ComposableMesurer persistKey="compact-toolbar-test" plugins={[arrangePlugin()]} />,
      host,
    );
    mounted.push(dispose);

    const arrangeButton = await viWaitForButton('button[aria-label="Arrange (Shift+A)"]');
    const selectButton = await viWaitForButton('button[aria-label="Select (S)"]');
    const xrayButton = await viWaitForButton('button[aria-label="X-ray (X)"]');
    const typographyButton = await viWaitForButton('button[aria-label="Typography (A)"]');
    const compactButton = await viWaitForButton('button[aria-label="Compact toolbar"]');

    arrangeButton.click();
    await waitFor(() =>
      selectButton.getAttribute("aria-pressed") === "true"
      && arrangeButton.getAttribute("aria-pressed") === "true"
    );

    compactButton.click();
    const toolbar = document.querySelector<HTMLElement>('[data-mesurer-toolbar="true"]')!;
    await waitFor(() => toolbar.dataset.mesurerToolbarCompact === "true");

    expect(compactItem(selectButton)?.getAttribute("aria-hidden")).toBeNull();
    expect(compactItem(arrangeButton)?.getAttribute("aria-hidden")).toBeNull();
    expect(compactItem(xrayButton)?.getAttribute("aria-hidden")).toBe("true");
    expect(compactItem(typographyButton)?.getAttribute("aria-hidden")).toBe("true");
    expect(selectButton.getAttribute("aria-pressed")).toBe("true");
    expect(arrangeButton.getAttribute("aria-pressed")).toBe("true");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }));
    await waitFor(() => xrayButton.getAttribute("aria-pressed") === "true");
    expect(compactItem(xrayButton)?.getAttribute("aria-hidden")).toBeNull();

    const expandButton = await viWaitForButton('button[aria-label="Expand toolbar"]');
    expandButton.click();
    await waitFor(() => toolbar.dataset.mesurerToolbarCompact === "false");

    expect(compactItem(typographyButton)?.getAttribute("aria-hidden")).toBeNull();
    expect(selectButton.getAttribute("aria-pressed")).toBe("true");
    expect(arrangeButton.getAttribute("aria-pressed")).toBe("true");
    expect(xrayButton.getAttribute("aria-pressed")).toBe("true");
  });
});

async function viWaitForButton(selector: string) {
  await waitFor(() => document.querySelector<HTMLButtonElement>(selector) !== null);
  return document.querySelector<HTMLButtonElement>(selector)!;
}

async function waitFor(predicate: () => boolean, timeout = 1000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error("Timed out waiting for compact toolbar state");
    await new Promise((resolve) => setTimeout(resolve, 10));
    await settle();
  }
}