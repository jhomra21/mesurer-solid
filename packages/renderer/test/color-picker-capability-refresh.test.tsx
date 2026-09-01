import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import Mesurer from "../src/Mesurer";
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
  Reflect.deleteProperty(window, "EyeDropper");
  document.body.replaceChildren();
});

describe("native Color Picker capability refresh", () => {
  it("removes the toolbar action when an embedded browser withdraws EyeDropper after mount", async () => {
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: class {
        async open() {
          return { sRGBHex: "#123456" };
        }
      },
    });

    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(render(() => <Mesurer persistKey="color-picker-capability-refresh" />, host));
    await settle();

    expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeTruthy();

    Reflect.deleteProperty(window, "EyeDropper");

    await vi.waitFor(() => {
      expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeNull();
    }, { timeout: 1_500 });
  });
});
