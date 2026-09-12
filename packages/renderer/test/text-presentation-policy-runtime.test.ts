import { describe, expect, it } from "vitest";
import { createTextPresentationPolicyWindow } from "../src/runtime/text-presentation-policy-runtime";

describe("text presentation policy window", () => {
  it("keeps viewport dimensions live after the facade is created", () => {
    const originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");

    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });

      const policyWindow = createTextPresentationPolicyWindow(
        window,
        window.requestAnimationFrame.bind(window),
      );
      expect(policyWindow.innerWidth).toBe(1280);
      expect(policyWindow.innerHeight).toBe(900);

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 480 });

      expect(policyWindow.innerWidth).toBe(640);
      expect(policyWindow.innerHeight).toBe(480);
    } finally {
      if (originalInnerWidth) Object.defineProperty(window, "innerWidth", originalInnerWidth);
      else Reflect.deleteProperty(window, "innerWidth");
      if (originalInnerHeight) Object.defineProperty(window, "innerHeight", originalInnerHeight);
      else Reflect.deleteProperty(window, "innerHeight");
    }
  });
});
