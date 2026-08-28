import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMesurerPluginHost,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../src/ComposableMeasurer";
import {
  createScreenshotFilename,
  normalizeScreenshotRect,
} from "../src/core/screenshot";
import { createMeasurerModel } from "../src/model/create-measurer-model";
import {
  MESURER_SCREENSHOT_SERVICE_ID,
  screenshotPlugin,
  type MesurerScreenshotService,
} from "../src/plugins/screenshot";
import { createMesurerWorkspaceRuntime } from "../src/runtime/workspace-context";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("screenshot geometry", () => {
  it("normalizes reverse drags and clamps them to the viewport", () => {
    expect(normalizeScreenshotRect(
      { x: 900, y: 500 },
      { x: -50, y: 100 },
      { width: 800, height: 600 },
    )).toEqual({ left: 0, top: 100, width: 800, height: 400 });
  });

  it("creates deterministic local screenshot filenames", () => {
    expect(createScreenshotFilename(new Date(2026, 7, 28, 9, 5, 7))).toBe("mesurer-2026-08-28-090507.png");
  });
});

describe("screenshotPlugin", () => {
  it("registers an opt-in tool, persists output settings, and cleans up owned UI", async () => {
    const host = createMesurerPluginHost();
    const toolbar = document.createElement("div");
    toolbar.dataset.mesurerToolbar = "true";
    document.body.append(toolbar);

    const model = createMeasurerModel({ initialEnabled: true });
    const workspace = createMesurerWorkspaceRuntime({
      model,
      ownerDocument: document,
      ownerWindow: window,
      uiRoot: document.body,
      pageTarget: document.body,
    });
    const workspaceDispose = vi.spyOn(workspace, "dispose");
    let mountDisposed = false;
    const runtime: MesurerSolidRuntimeService = {
      ownerDocument: document,
      ownerWindow: window,
      portalTarget: document.body,
      createWorkspaceRuntime: () => workspace,
      createInspectorMount() {
        const element = document.createElement("div");
        element.dataset.mesurerInspectorUi = "true";
        document.body.append(element);
        return {
          element,
          dispose() {
            mountDisposed = true;
            element.remove();
          },
        };
      },
    };

    await host.load(defineMesurerPlugin({
      id: "test.runtime",
      provides: ["runtime:solid"],
      setup(ctx) {
        ctx.service.provide("runtime:solid", runtime);
      },
    }));
    await host.load(screenshotPlugin({
      captureVisibleTab: async () => new Blob(["png"], { type: "image/png" }),
    }));

    expect(host.tools().map((tool) => tool.id)).toEqual(["screenshot"]);
    expect(host.describe().settings).toEqual([
      { id: "screenshot", label: "Screenshot", order: 40 },
    ]);
    expect(host.describe().commands).toContain("screenshot.toggle");

    const service = host.service.get<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);
    expect(service).toBeDefined();
    expect(service?.settings()).toEqual({ copy: true, download: false });
    service?.setSettings({ copy: false, download: true });
    expect(service?.settings()).toEqual({ copy: false, download: true });
    expect(host.state.serialize("persist")).toEqual({
      "mesurer.screenshot.settings": { copy: false, download: true },
    });

    await service?.start();
    expect(service?.active()).toBe(true);
    expect(toolbar.style.visibility).toBe("hidden");
    expect(document.querySelector("[data-mesurer-screenshot-select='true']")).not.toBeNull();

    service?.cancel();
    expect(service?.active()).toBe(false);
    expect(toolbar.style.visibility).toBe("");

    expect(host.remove("mesurer.screenshot")).toBe(true);
    expect(workspaceDispose).toHaveBeenCalledOnce();
    expect(mountDisposed).toBe(true);
    expect(document.querySelector("[data-mesurer-screenshot='true']")).toBeNull();

    host.dispose();
  });
});
