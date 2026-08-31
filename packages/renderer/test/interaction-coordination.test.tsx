import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineMesurerPlugin, type MesurerPluginHost } from "@jhomra21/mesurer-solid-core";
import ComposableMesurer from "../src/ComposableMesurer";
import Mesurer from "../src/Mesurer";
import { MESURER_ARRANGE_ACTIVE_STATE_ID } from "../src/plugins/arrange";
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
  localStorage.clear();
  document.body.replaceChildren();
  document.head.querySelectorAll("#mesurer-solid-styles, #mesurer-solid-xray-styles").forEach((node) => node.remove());
  vi.restoreAllMocks();
});

const arrangeInteractionFixture = defineMesurerPlugin({
  id: "test.arrange-interaction",
  setup(ctx) {
    ctx.state.register<boolean>({
      id: MESURER_ARRANGE_ACTIVE_STATE_ID,
      initial: true,
    });
    ctx.command.register("test.arrange.toggle", () => {
      ctx.state.update<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID, (active) => !active);
    });
    ctx.tool.register({
      id: "arrange",
      label: "Arrange",
      command: "test.arrange.toggle",
      active: () => ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false,
      menu: {
        label: "Arrange options",
        items: [{
          id: "snapping",
          label: "Snapping",
          checked: () => true,
          run: () => undefined,
        }],
      },
    });
  },
});

describe("page interaction coordination", () => {
  it("opens native color picking on every press while keeping the standard result active", async () => {
    let opens = 0;
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: class {
        async open() {
          opens += 1;
          return { sRGBHex: opens === 1 ? "#123456" : "#abcdef" };
        }
      },
    });

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Mesurer persistKey="interaction-color-picker" />, host);
    mounted.push(dispose);
    await settle();

    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Color picker (P)"]')!;
    button.click();
    await vi.waitFor(() => expect(opens).toBe(1));
    await settle();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".mesurer-color-picker")?.textContent).toContain("#123456");

    button.click();
    await vi.waitFor(() => expect(opens).toBe(2));
    await settle();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".mesurer-color-picker")?.textContent).toContain("#abcdef");

    document.querySelector<HTMLButtonElement>('button[aria-label="X-ray (X)"]')!.click();
    await settle();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".mesurer-color-picker")).toBeNull();
  });

  it("reserves page-interaction tools for Arrange and closes its quick menu after a choice", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let pluginHost: MesurerPluginHost | null = null;
    const dispose = render(
      () => <ComposableMesurer
        persistKey="interaction-arrange"
        plugins={[arrangeInteractionFixture]}
        onPluginHost={(value) => { pluginHost = value; }}
      />,
      host,
    );
    mounted.push(dispose);

    await vi.waitFor(() => expect(document.querySelector('[data-mesurer-tool-id="arrange"] button')).toBeTruthy());
    expect(pluginHost).toBeTruthy();
    const arrangeButton = document.querySelector<HTMLButtonElement>('[data-mesurer-tool-id="arrange"] button')!;
    await vi.waitFor(() => expect(arrangeButton.getAttribute("aria-pressed")).toBe("true"));

    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Color picker (P)"]')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Text inspector (A)"]')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Guides (G)"]')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Guide orientation menu"]')?.disabled).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    await settle();
    expect(arrangeButton.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Text inspector (A)"]')?.getAttribute("aria-pressed")).toBe("false");

    const menuTrigger = document.querySelector<HTMLButtonElement>('[data-mesurer-tool-menu-trigger="arrange"]')!;
    menuTrigger.click();
    await vi.waitFor(() => expect(document.querySelector('[data-mesurer-tool-menu="arrange"]')).toBeTruthy());
    document.querySelector<HTMLButtonElement>('[data-mesurer-tool-menu-item="snapping"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-mesurer-tool-menu="arrange"]')).toBeNull());
    expect(arrangeButton.getAttribute("aria-pressed")).toBe("true");

    pluginHost!.state.update<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID, () => false);
    await vi.waitFor(() => expect(pluginHost!.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(false));
    await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('button[aria-label="Color picker (P)"]')?.disabled).toBe(false));
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Text inspector (A)"]')?.disabled).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Guides (G)"]')?.disabled).toBe(false);
  });
});
