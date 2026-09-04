import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MesurerPluginHost } from "@jhomra21/mesurer-solid-core";
import ComposableMesurer from "../src/ComposableMesurer";
import { MESURER_ARRANGE_ACTIVE_STATE_ID, arrangePlugin } from "../src/plugins/arrange";
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
  vi.restoreAllMocks();
});

describe("Arrange Select dependency", () => {
  it("lets Arrange activate Select, leaves Select on when Arrange is turned off, and turns Arrange off when Select is turned off", async () => {
    const hostElement = document.createElement("div");
    document.body.append(hostElement);
    let pluginHost: MesurerPluginHost | null = null;

    const dispose = render(
      () => <ComposableMesurer
        persistKey="arrange-select-dependency"
        plugins={[arrangePlugin()]}
        onPluginHost={(value) => { pluginHost = value; }}
      />,
      hostElement,
    );
    mounted.push(dispose);

    const selectButton = await vi.waitFor(() => {
      const value = document.querySelector<HTMLButtonElement>('button[aria-label="Select (S)"]');
      expect(value).toBeTruthy();
      return value!;
    });
    const arrangeButton = await vi.waitFor(() => {
      const value = document.querySelector<HTMLButtonElement>('button[aria-label="Arrange (Shift+A)"]');
      expect(value).toBeTruthy();
      return value!;
    });

    // Start from the exact state that regressed: neither Select nor Arrange active.
    if (selectButton.getAttribute("aria-pressed") === "true") {
      selectButton.click();
      await vi.waitFor(() => expect(selectButton.getAttribute("aria-pressed")).toBe("false"));
    }
    await vi.waitFor(() => expect(arrangeButton.getAttribute("aria-pressed")).toBe("false"));
    expect(arrangeButton.disabled).toBe(false);

    // Arrange is always invokable and satisfies its Select dependency itself.
    arrangeButton.click();
    await vi.waitFor(() => {
      expect(selectButton.getAttribute("aria-pressed")).toBe("true");
      expect(arrangeButton.getAttribute("aria-pressed")).toBe("true");
    });
    expect(pluginHost?.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(true);

    // Turning Arrange off must not unexpectedly turn Select off.
    arrangeButton.click();
    await vi.waitFor(() => expect(arrangeButton.getAttribute("aria-pressed")).toBe("false"));
    expect(selectButton.getAttribute("aria-pressed")).toBe("true");

    // Arrange can be activated again normally.
    arrangeButton.click();
    await vi.waitFor(() => {
      expect(selectButton.getAttribute("aria-pressed")).toBe("true");
      expect(arrangeButton.getAttribute("aria-pressed")).toBe("true");
    });

    // Select is the required targeting dependency. Explicitly leaving Select
    // while Arrange is active must also retire Arrange.
    selectButton.click();
    await vi.waitFor(() => {
      expect(selectButton.getAttribute("aria-pressed")).toBe("false");
      expect(arrangeButton.getAttribute("aria-pressed")).toBe("false");
    });
    expect(pluginHost?.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(false);
  });
});
