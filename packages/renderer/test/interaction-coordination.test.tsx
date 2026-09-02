import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineMesurerPlugin, type MesurerPluginHost } from "@jhomra21/mesurer-solid-core";
import ComposableMesurer from "../src/ComposableMesurer";
import Mesurer from "../src/Mesurer";
import { MESURER_ARRANGE_ACTIVE_STATE_ID, arrangePlugin } from "../src/plugins/arrange";
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
  Reflect.deleteProperty(window, "EyeDropper");
  Reflect.deleteProperty(window, "isSecureContext");
  localStorage.clear();
  document.body.replaceChildren();
  document.head.querySelectorAll("#mesurer-solid-styles, #mesurer-solid-xray-styles").forEach((node) => node.remove());
  vi.restoreAllMocks();
});

const installStaticEyeDropper = (color = "#123456") => {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(window, "EyeDropper", {
    configurable: true,
    value: class {
      async open() {
        return { sRGBHex: color };
      }
    },
  });
};

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
  it("matches upstream Color Picker button toggling while P starts a fresh native pick", async () => {
    let opens = 0;
    const colors = ["#123456", "#abcdef", "#fedcba"];
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: class {
        async open() {
          const color = colors[opens] ?? colors.at(-1)!;
          opens += 1;
          return { sRGBHex: color };
        }
      },
    });

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Mesurer persistKey="interaction-color-picker" />, host);
    mounted.push(dispose);
    await settle();

    const button = await vi.waitFor(() => {
      const value = document.querySelector<HTMLButtonElement>('button[aria-label="Color picker (P)"]');
      expect(value).toBeTruthy();
      return value!;
    });
    button.click();
    await vi.waitFor(() => expect(opens).toBe(1));
    await settle();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    const firstPanel = document.querySelector<HTMLElement>(".mesurer-color-picker");
    expect(firstPanel?.textContent).toContain("#123456");
    expect(firstPanel?.dataset.mesurerColorPickerMode).toBe("native");

    button.click();
    await settle();
    expect(opens).toBe(1);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".mesurer-color-picker")).toBeNull();

    button.click();
    await vi.waitFor(() => expect(opens).toBe(2));
    await settle();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector<HTMLElement>(".mesurer-color-picker")?.textContent).toContain("#abcdef");

    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "p",
      bubbles: true,
      cancelable: true,
    }));
    await vi.waitFor(() => expect(opens).toBe(3));
    await settle();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    const shortcutPanel = document.querySelector<HTMLElement>(".mesurer-color-picker");
    expect(shortcutPanel?.textContent).toContain("#fedcba");
    expect(shortcutPanel?.dataset.mesurerColorPickerMode).toBe("native");

    document.querySelector<HTMLButtonElement>('button[aria-label="X-ray (X)"]')!.click();
    await settle();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".mesurer-color-picker")).toBeNull();
  });

  it("requires native EyeDropper to remain available through capability confirmation before showing the tool", async () => {
    const NativeEyeDropper = class {
      async open() {
        return { sRGBHex: "#123456" };
      }
    };
    let reads = 0;
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      get() {
        reads += 1;
        return reads === 1 ? NativeEyeDropper : undefined;
      },
    });

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => <ComposableMesurer persistKey="interaction-color-picker-confirmed-only" />,
      host,
    );
    mounted.push(dispose);

    expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeNull();
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    await settle();
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeNull();
  });

  it("uses the native EyeDropper contract as the capability source", async () => {
    let opens = 0;
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: undefined });
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: class {
        async open() {
          opens += 1;
          return { sRGBHex: "#123456" };
        }
      },
    });

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => <ComposableMesurer persistKey="interaction-color-picker-native-contract" />,
      host,
    );
    mounted.push(dispose);

    const button = await vi.waitFor(() => {
      const value = document.querySelector<HTMLButtonElement>('button[aria-label="Color picker (P)"]');
      expect(value).toBeTruthy();
      return value!;
    });
    button.click();
    await vi.waitFor(() => expect(opens).toBe(1));
  });

  it("does not render the Color Picker tool when native EyeDropper is unavailable", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => <ComposableMesurer persistKey="interaction-color-picker-unavailable" />,
      host,
    );
    mounted.push(dispose);
    await settle();

    expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "p",
      bubbles: true,
      cancelable: true,
    }));
    await settle();

    expect(document.querySelector(".mesurer-color-picker")).toBeNull();
    expect(document.querySelector("[data-mesurer-color-picker-fallback='true']")).toBeNull();
  });

  it("does not treat a truthy non-EyeDropper placeholder as native support", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: { unavailable: true },
    });

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => <ComposableMesurer persistKey="interaction-color-picker-placeholder" />,
      host,
    );
    mounted.push(dispose);
    await settle();

    expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "p",
      bubbles: true,
      cancelable: true,
    }));
    await settle();

    expect(document.querySelector(".mesurer-color-picker")).toBeNull();
  });

  it("revalidates Color Picker visibility when native capability disappears after mount", async () => {
    installStaticEyeDropper();
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => <ComposableMesurer persistKey="interaction-color-picker-capability-refresh" />,
      host,
    );
    mounted.push(dispose);

    await vi.waitFor(() => {
      expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeTruthy();
    });

    Reflect.deleteProperty(window, "EyeDropper");
    window.dispatchEvent(new Event("focus"));

    await vi.waitFor(() => {
      expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeNull();
    });
  });

  it("shows and executes shortcuts for first-party Arrange and Screenshot tools", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => <ComposableMesurer
        persistKey="interaction-first-party-shortcuts"
        plugins={[
          arrangePlugin(),
          screenshotPlugin({ captureVisibleTab: async () => new Blob([], { type: "image/png" }) }),
        ]}
      />,
      host,
    );
    mounted.push(dispose);

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLButtonElement>('button[aria-label="Arrange (Shift+A)"]')).toBeTruthy();
      expect(document.querySelector<HTMLButtonElement>('button[aria-label="Screenshot (Shift+S)"]')).toBeTruthy();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "S", shiftKey: true, bubbles: true, cancelable: true }));
    const screenshotOverlay = await vi.waitFor(() => {
      const value = document.querySelector<HTMLElement>("[data-mesurer-screenshot-select='true']");
      expect(value?.style.display).toBe("block");
      return value!;
    });
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Select (S)"]')?.getAttribute("aria-pressed")).toBe("false");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(screenshotOverlay.style.display).toBe("none"));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "A", shiftKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('button[aria-label="Arrange (Shift+A)"]')?.getAttribute("aria-pressed")).toBe("true"));
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Text inspector (A)"]')?.getAttribute("aria-pressed")).toBe("false");
  });

  it("reserves page-interaction tools for Arrange and closes its quick menu after a choice", async () => {
    installStaticEyeDropper();
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
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeTruthy());
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
