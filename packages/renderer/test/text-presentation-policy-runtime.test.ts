import { describe, expect, it } from "vitest";
import { createTextPresentationPolicyRuntime } from "../src/runtime/text-presentation-policy-runtime";

const restoreProperty = (
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) => {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
};

describe("text presentation policy runtime", () => {
  it("keeps viewport dimensions live after the policy runtime is created", () => {
    const originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");

    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });

      const ctx = {
        lifecycle: { onDispose: () => undefined },
      } as unknown as Parameters<typeof createTextPresentationPolicyRuntime>[0];
      const runtime = {
        ownerDocument: document,
        ownerWindow: window,
        portalTarget: document.body,
        pageTarget: document.body,
        currentToolMode: () => "select",
      } as unknown as Parameters<typeof createTextPresentationPolicyRuntime>[1];

      const policyRuntime = createTextPresentationPolicyRuntime(ctx, runtime);
      expect(policyRuntime.ownerWindow.innerWidth).toBe(1280);
      expect(policyRuntime.ownerWindow.innerHeight).toBe(900);

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 480 });

      expect(policyRuntime.ownerWindow.innerWidth).toBe(640);
      expect(policyRuntime.ownerWindow.innerHeight).toBe(480);
    } finally {
      restoreProperty(window, "innerWidth", originalInnerWidth);
      restoreProperty(window, "innerHeight", originalInnerHeight);
    }
  });
});
