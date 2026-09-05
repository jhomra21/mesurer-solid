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

const liveButton = (label: string) => {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Expected live toolbar button: ${label}`);
  return button;
};

describe("Arrange Select dependency", () => {
  it("keeps Select on when Arrange is turned off and turns Arrange off when Select is turned off", async () => {
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

    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Select (S)"]')).toBeTruthy());
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Arrange (Shift+A)"]')).toBeTruthy());

    // Arrange-first activation is already covered by arrange-plugin.test.ts and
    // the real-browser arrange-contract.mjs. This test owns only the symmetric
    // deactivation relationship through the actual toolbar buttons. Re-query
    // after plugin state changes because the contribution may rerender its node.
    if (liveButton("Select (S)").getAttribute("aria-pressed") !== "true") {
      liveButton("Select (S)").click();
      await vi.waitFor(() => expect(liveButton("Select (S)").getAttribute("aria-pressed")).toBe("true"));
    }

    liveButton("Arrange (Shift+A)").click();
    await vi.waitFor(() => expect(liveButton("Arrange (Shift+A)").getAttribute("aria-pressed")).toBe("true"));
    expect(pluginHost?.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(true);

    // Turning Arrange off must leave its independent Select prerequisite alone.
    liveButton("Arrange (Shift+A)").click();
    await vi.waitFor(() => expect(liveButton("Arrange (Shift+A)").getAttribute("aria-pressed")).toBe("false"));
    expect(liveButton("Select (S)").getAttribute("aria-pressed")).toBe("true");

    // Once Arrange is active again, explicitly leaving Select must retire Arrange.
    liveButton("Arrange (Shift+A)").click();
    await vi.waitFor(() => expect(liveButton("Arrange (Shift+A)").getAttribute("aria-pressed")).toBe("true"));
    liveButton("Select (S)").click();
    await vi.waitFor(() => {
      expect(liveButton("Select (S)").getAttribute("aria-pressed")).toBe("false");
      expect(liveButton("Arrange (Shift+A)").getAttribute("aria-pressed")).toBe("false");
    });
    expect(pluginHost?.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(false);
  });
});
