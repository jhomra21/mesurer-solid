import { afterEach, describe, expect, it } from "vitest";
import type { MesurerPluginHost } from "@jhomra21/mesurer-solid-core";
import ComposableMesurer from "../src/ComposableMesurer";
import {
  MESURER_SCREENSHOT_SERVICE_ID,
  screenshotPlugin,
  type MesurerScreenshotService,
} from "../src/plugins/screenshot";
import { render } from "../src/solid-dom";

const mounted: Array<() => void> = [];

const mount = (onPluginsReady: (host: MesurerPluginHost) => void) => {
  const element = document.createElement("div");
  document.body.append(element);
  const dispose = render(
    () => (
      <ComposableMesurer
        plugins={[screenshotPlugin({ copy: false, download: false, includeMeasurements: false })]}
        onPluginsReady={onPluginsReady}
      />
    ),
    element,
  );
  mounted.push(dispose);
};

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  localStorage.clear();
  document.body.replaceChildren();
  document.head.querySelectorAll("#mesurer-solid-styles, #mesurer-solid-xray-styles").forEach((node) => node.remove());
});

describe("plugin persistence", () => {
  it("flushes pending default plugin settings on pagehide without a persistKey", async () => {
    const ready = new Promise<MesurerPluginHost>((resolve) => mount(resolve));
    const host = await ready;
    const screenshot = host.service.get<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);
    expect(screenshot).toBeDefined();
    expect(screenshot?.settings().copy).toBe(false);

    screenshot?.setSettings({ copy: true });
    await Promise.resolve();

    const beforePageHide = JSON.parse(localStorage.getItem("mesurer-plugin-settings") ?? "{}");
    expect(beforePageHide["mesurer.screenshot.settings"]?.copy).not.toBe(true);

    window.dispatchEvent(new Event("pagehide"));

    const afterPageHide = JSON.parse(localStorage.getItem("mesurer-plugin-settings") ?? "{}");
    expect(afterPageHide["mesurer.screenshot.settings"]).toMatchObject({
      copy: true,
      download: false,
      includeMeasurements: false,
    });
  });
});
