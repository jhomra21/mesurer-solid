import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import ComposableMesurer from "../src/ComposableMesurer";
import { arrangePlugin } from "../src/plugins/arrange";
import { screenshotPlugin } from "../src/plugins/screenshot";
import { render } from "../src/solid-dom";

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
  localStorage.clear();
  document.body.replaceChildren();
  document.head.querySelectorAll("#mesurer-solid-styles, #mesurer-solid-xray-styles").forEach((node) => node.remove());
  vi.restoreAllMocks();
});

describe("Shortcuts setting", () => {
  it("gates first-party plugin shortcuts without disabling toolbar actions or Escape", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(
      () => (
        <ComposableMesurer
          persistKey="shortcuts-setting-plugins"
          shortcutsEnabled={false}
          plugins={[
            arrangePlugin(),
            screenshotPlugin({ captureVisibleTab: async () => new Blob([], { type: "image/png" }) }),
          ]}
        />
      ),
      host,
    );
    mounted.push(dispose);

    const arrangeButton = await vi.waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Arrange (Shift+A)"]');
      expect(button).toBeTruthy();
      return button!;
    });
    const screenshotButton = document.querySelector<HTMLButtonElement>('button[aria-label="Screenshot (Shift+S)"]')!;

    const arrangeShortcut = new KeyboardEvent("keydown", {
      key: "A",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(arrangeShortcut);
    await settle();
    expect(arrangeShortcut.defaultPrevented).toBe(false);
    expect(arrangeButton.getAttribute("aria-pressed")).toBe("false");

    const screenshotShortcut = new KeyboardEvent("keydown", {
      key: "S",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(screenshotShortcut);
    await settle();
    expect(screenshotShortcut.defaultPrevented).toBe(false);
    expect(document.querySelector<HTMLElement>("[data-mesurer-screenshot-select='true']")?.style.display ?? "none").not.toBe("block");

    arrangeButton.click();
    await vi.waitFor(() => expect(arrangeButton.getAttribute("aria-pressed")).toBe("true"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(arrangeButton.getAttribute("aria-pressed")).toBe("false"));

    screenshotButton.click();
    const screenshotOverlay = await vi.waitFor(() => {
      const overlay = document.querySelector<HTMLElement>("[data-mesurer-screenshot-select='true']");
      expect(overlay?.style.display).toBe("block");
      return overlay!;
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(screenshotOverlay.style.display).toBe("none"));
  });
});
