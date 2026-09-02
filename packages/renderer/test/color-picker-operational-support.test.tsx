import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import ComposableMesurer from "../src/ComposableMesurer";
import { resetNativeColorPickerOperationalState } from "../src/runtime/color-picker-support";
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
  resetNativeColorPickerOperationalState(window);
  Reflect.deleteProperty(window, "EyeDropper");
  localStorage.clear();
  document.body.replaceChildren();
  document.head.querySelectorAll("#mesurer-solid-styles, #mesurer-solid-xray-styles").forEach((node) => node.remove());
  vi.restoreAllMocks();
  await settle();
});

describe("native Color Picker operational support", () => {
  it("retires the tool for the current mount when native EyeDropper aborts immediately", async () => {
    let opens = 0;
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: class {
        async open() {
          opens += 1;
          throw new DOMException("The user canceled the selection.", "AbortError");
        }
      },
    });

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => <ComposableMesurer persistKey="color-picker-operational-abort" />,
      host,
    );
    mounted.push(dispose);

    const button = await vi.waitFor(() => {
      const value = document.querySelector<HTMLButtonElement>('button[aria-label="Color picker (P)"]');
      expect(value).toBeTruthy();
      return value!;
    });

    button.click();

    await vi.waitFor(() => {
      expect(opens).toBe(1);
      expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeNull();
    });
    expect(document.querySelector(".mesurer-color-picker")).toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "p",
      bubbles: true,
      cancelable: true,
    }));
    await settle();

    expect(opens).toBe(1);
    expect(document.querySelector(".mesurer-color-picker")).toBeNull();
  });
});
