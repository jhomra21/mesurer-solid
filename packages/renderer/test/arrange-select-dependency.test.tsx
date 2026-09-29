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

describe("Edit Select dependency", () => {
  it("keeps Select as Edit's targeting prerequisite and leaves Edit through the mode switch", async () => {
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
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Edit mode (2)"]')).toBeTruthy());

    if (liveButton("Select (S)").getAttribute("aria-pressed") !== "true") {
      liveButton("Select (S)").click();
      await vi.waitFor(() => expect(liveButton("Select (S)").getAttribute("aria-pressed")).toBe("true"));
    }

    liveButton("Edit mode (2)").click();
    await vi.waitFor(() => expect(liveButton("Edit mode (2)").getAttribute("aria-pressed")).toBe("true"));
    expect(pluginHost?.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(true);
    expect(liveButton("Select (S)").getAttribute("aria-pressed")).toBe("true");

    liveButton("Select mode (1)").click();
    await vi.waitFor(() => expect(liveButton("Edit mode (2)").getAttribute("aria-pressed")).toBe("false"));
    expect(liveButton("Select (S)").getAttribute("aria-pressed")).toBe("true");
    expect(pluginHost?.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(false);

    liveButton("Edit mode (2)").click();
    await vi.waitFor(() => expect(pluginHost?.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(true));
    liveButton("Edit mode (2)").click();
    await settle();
    expect(pluginHost?.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(true);

    liveButton("Select mode (1)").click();
    await vi.waitFor(() => expect(pluginHost?.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(false));
    expect(liveButton("Select (S)").getAttribute("aria-pressed")).toBe("true");
  });
});
