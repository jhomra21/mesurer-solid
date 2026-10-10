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

const tallPluginMenuFixture = defineMesurerPlugin({
  id: "test.tall-plugin-menu",
  setup(ctx) {
    ctx.command.register("test.tall-plugin-menu.run", () => undefined);
    ctx.tool.register({
      id: "tall-plugin-menu",
      label: "Tall menu",
      command: "test.tall-plugin-menu.run",
      menu: {
        label: "Tall menu options",
        items: Array.from({ length: 10 }, (_, index) => ({
          id: `item-${index + 1}`,
          label: `Menu item ${index + 1}`,
          run: () => undefined,
        })),
      },
    });
  },
});

describe("page interaction coordination", () => {
  it("samples a new color on repeated toolbar press and P while preserving the result until another tool", async () => {
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

  it("does not poll Color Picker capability while the toolbar is idle", async () => {
    installStaticEyeDropper();
    const setInterval = vi.spyOn(window, "setInterval");
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(
      () => <ComposableMesurer persistKey="interaction-color-picker-no-polling" />,
      host,
    );

    mounted.push(dispose);

    await vi.waitFor(() => {
      expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeTruthy();
    });

    expect(setInterval.mock.calls.some(([, delay]) => delay === 500)).toBe(false);
  });

  it("shows and executes shortcuts for first-party Edit and Screenshot tools", async () => {
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
      expect(document.querySelector<HTMLButtonElement>('button[aria-label="Edit mode (2)"]')).toBeTruthy();
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
    await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('button[aria-label="Edit mode (2)"]')?.getAttribute("aria-pressed")).toBe("true"));
    expect(document.querySelector<HTMLElement>('[data-mesurer-toolbar="true"]')?.dataset.mesurerToolbarMode).toBe("edit");
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Typography (A)"]')?.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps tall plugin menus inside the viewport and scrolls their contents", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(320);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(180);

    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(
      () => <ComposableMesurer
        persistKey="interaction-plugin-menu-bounds"
        plugins={[tallPluginMenuFixture]}
      />,
      host,
    );

    mounted.push(dispose);

    const root = await vi.waitFor(() => {
      const value = document.querySelector<HTMLElement>('[data-mesurer-tool-menu-root="tall-plugin-menu"]');
      expect(value).toBeTruthy();

      return value!;
    });

    root.getBoundingClientRect = () => new DOMRect(260, 136, 52, 40);

    document.querySelector<HTMLButtonElement>('[data-mesurer-tool-menu-trigger="tall-plugin-menu"]')!.click();

    const menu = await vi.waitFor(() => {
      const value = document.querySelector<HTMLElement>('[data-mesurer-tool-menu="tall-plugin-menu"]');
      expect(value).toBeTruthy();

      return value!;
    });

    expect(menu.dataset.mesurerMenuSide).toBe("top");
    expect(menu.style.left).toBe("-172px");
    expect(menu.style.width).toBe("224px");
    expect(menu.style.maxHeight).toBe("120px");
    expect(menu.className).toContain("msr:overflow-y-auto");
  });

  it("switches page-interaction tools into Edit and closes its quick menu after a choice", async () => {
    installStaticEyeDropper();
    const host = document.createElement("div");
    document.body.append(host);
    let pluginHost: MesurerPluginHost | null = null;

    const dispose = render(
      () => <ComposableMesurer
        persistKey="interaction-arrange"
        plugins={[arrangePlugin()]}
        onPluginHost={(value) => { pluginHost = value; }}
      />,
      host,
    );

    mounted.push(dispose);

    await vi.waitFor(() => expect(document.querySelector('button[data-mesurer-tool-id="arrange"]')).toBeTruthy());
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Color picker (P)"]')).toBeTruthy());
    expect(pluginHost).toBeTruthy();
    const editModeButton = () => document.querySelector<HTMLButtonElement>('button[data-mesurer-toolbar-mode="edit"]')!;
    editModeButton().click();
    await vi.waitFor(() => expect(pluginHost!.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(true));
    await vi.waitFor(() => expect(editModeButton().getAttribute("aria-pressed")).toBe("true"));
    expect(document.querySelector<HTMLElement>('[data-mesurer-toolbar="true"]')?.dataset.mesurerToolbarMode).toBe("edit");

    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Color picker (P)"]')?.disabled).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Typography (A)"]')?.disabled).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Guides (G)"]')?.disabled).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    await vi.waitFor(() => {
      expect(editModeButton().getAttribute("aria-pressed")).toBe("false");
      expect(document.querySelector<HTMLElement>('[data-mesurer-toolbar="true"]')?.dataset.mesurerToolbarMode).toBe("select");
      expect(document.querySelector<HTMLButtonElement>('button[aria-label="Typography (A)"]')?.getAttribute("aria-pressed")).toBe("true");
    });

    editModeButton().click();
    await vi.waitFor(() => expect(pluginHost!.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(true));
    await vi.waitFor(() => expect(editModeButton().getAttribute("aria-pressed")).toBe("true"));

    const editOptions = document.querySelector<HTMLButtonElement>('button[data-mesurer-tool-menu-trigger="arrange"]')!;

    expect(editModeButton().getAttribute("data-mesurer-tool-id")).toBe("arrange");
    expect(document.querySelector('button[data-mesurer-tool-id="edit-action"]')).toBeNull();
    editOptions.click();
    await vi.waitFor(() => expect(document.querySelector('[data-mesurer-tool-menu="arrange"]')).toBeTruthy());
    document.querySelector<HTMLButtonElement>('[data-mesurer-tool-menu-item="snapping"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-mesurer-tool-menu="arrange"]')).toBeNull());
    await vi.waitFor(() => expect(pluginHost!.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(true));
    expect(editModeButton().getAttribute("aria-pressed")).toBe("true");

    pluginHost!.state.update<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID, () => false);
    await vi.waitFor(() => expect(pluginHost!.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID)).toBe(false));
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>('[data-mesurer-toolbar="true"]')?.dataset.mesurerToolbarMode).toBe("select"));
  });
});