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
  const createTestRuntime = () => {
    const host = createMesurerPluginHost();
    const toolbar = document.createElement("div");
    toolbar.dataset.mesurerToolbar = "true";
    document.body.append(toolbar);

    const rendererRoot = document.createElement("div");
    rendererRoot.dataset.mesurerRoot = "true";
    const measurementLayer = document.createElement("div");
    const measurementMarker = document.createElement("div");
    measurementMarker.dataset.mesurerMeasurement = "true";
    measurementLayer.append(measurementMarker);
    const rulers = document.createElement("div");
    rulers.dataset.mesurerRulers = "true";
    rendererRoot.append(measurementLayer, rulers);
    document.body.append(rendererRoot);

    const model = createMeasurerModel({ initialEnabled: true });
    const workspace = createMesurerWorkspaceRuntime({
      model,
      ownerDocument: document,
      ownerWindow: window,
      uiRoot: document.body,
      pageTarget: document.body,
    });
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
            element.remove();
          },
        };
      },
    };

    return { host, toolbar, runtime, workspace, measurementLayer, rulers };
  };

  const loadRuntime = async (host: ReturnType<typeof createMesurerPluginHost>, runtime: MesurerSolidRuntimeService) => {
    await host.load(defineMesurerPlugin({
      id: "test.runtime",
      provides: ["runtime:solid"],
      setup(ctx) {
        ctx.service.provide("runtime:solid", runtime);
      },
    }));
  };

  const dragScreenshot = (overlay: HTMLElement) => {
    overlay.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 20,
      clientY: 20,
      pointerId: 1,
    }));
    overlay.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button: 0,
      clientX: 180,
      clientY: 140,
      pointerId: 1,
    }));
    overlay.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      clientX: 180,
      clientY: 140,
      pointerId: 1,
    }));
  };

  it("registers an opt-in tool, exposes persisted Settings controls, and cleans up owned UI", async () => {
    const { host, toolbar, runtime, workspace } = createTestRuntime();
    const workspaceDispose = vi.spyOn(workspace, "dispose");
    let mountDisposed = false;
    const trackedRuntime: MesurerSolidRuntimeService = {
      ...runtime,
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

    await loadRuntime(host, trackedRuntime);
    await host.load(screenshotPlugin({
      captureVisibleTab: async () => new Blob(["png"], { type: "image/png" }),
    }));

    expect(host.tools().map((tool) => tool.id)).toEqual(["screenshot"]);
    expect(host.tools()[0]?.hidden?.()).toBe(false);
    expect(host.describe().settings[0]?.controls.map((control) => ({ id: control.id, value: control.value }))).toEqual([
      { id: "tool", value: true },
      { id: "copy", value: true },
      { id: "download", value: false },
      { id: "measurements", value: false },
    ]);
    expect(host.describe().commands).toContain("screenshot.toggle");

    const service = host.service.get<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);
    expect(service).toBeDefined();
    expect(service?.settings()).toEqual({
      toolEnabled: true,
      copy: true,
      download: false,
      includeMeasurements: false,
    });
    service?.setSettings({ copy: false, download: true, includeMeasurements: true });
    expect(service?.settings()).toEqual({
      toolEnabled: true,
      copy: false,
      download: true,
      includeMeasurements: true,
    });
    expect(host.state.serialize("persist")).toEqual({
      "mesurer.screenshot.settings": {
        toolEnabled: true,
        copy: false,
        download: true,
        includeMeasurements: true,
      },
    });

    const toolControl = host.settings()[0]?.controls?.find((control) => control.id === "tool");
    await toolControl?.set(false);
    expect(host.tools()[0]?.hidden?.()).toBe(true);
    expect(service?.settings().toolEnabled).toBe(false);
    await toolControl?.set(true);
    expect(host.tools()[0]?.hidden?.()).toBe(false);

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

  it("hides selection chrome before the browser capture frame", async () => {
    const { host, runtime } = createTestRuntime();
    let capturedVisibility = "";
    let capturedChildStyles: string[] = [];

    await loadRuntime(host, runtime);
    await host.load(screenshotPlugin({
      copy: false,
      captureVisibleTab: async () => {
        const overlay = document.querySelector<HTMLElement>("[data-mesurer-screenshot-select='true']");
        capturedVisibility = overlay?.style.visibility ?? "";
        capturedChildStyles = Array.from(overlay?.querySelectorAll<HTMLElement>("div") ?? [])
          .map((element) => element.getAttribute("style") ?? "");
        return new Blob(["png"], { type: "image/png" });
      },
    }));

    const service = host.service.get<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);
    expect(service).toBeDefined();
    await service?.start();
    const overlay = document.querySelector<HTMLElement>("[data-mesurer-screenshot-select='true']");
    expect(overlay?.style.visibility).toBe("visible");
    if (overlay) dragScreenshot(overlay);

    await vi.waitFor(() => expect(capturedVisibility).toBe("hidden"));
    expect(capturedChildStyles.some((style) => style.includes("border"))).toBe(true);
    expect(overlay?.style.visibility).toBe("");

    host.dispose();
  });

  it("hides measurement presentation by default and restores it after capture", async () => {
    const { host, runtime, measurementLayer, rulers } = createTestRuntime();
    const captureStates: Array<{ measurement: string; rulers: string }> = [];

    await loadRuntime(host, runtime);
    await host.load(screenshotPlugin({
      copy: false,
      captureVisibleTab: async () => {
        captureStates.push({
          measurement: measurementLayer.style.display,
          rulers: rulers.style.display,
        });
        return new Blob(["png"], { type: "image/png" });
      },
    }));

    const service = host.service.get<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);
    expect(service).toBeDefined();
    await service?.start();
    const overlay = document.querySelector<HTMLElement>("[data-mesurer-screenshot-select='true']");
    if (overlay) dragScreenshot(overlay);

    await vi.waitFor(() => expect(captureStates).toHaveLength(1));
    expect(captureStates[0]).toEqual({ measurement: "none", rulers: "none" });
    await vi.waitFor(() => {
      expect(measurementLayer.style.display).toBe("");
      expect(rulers.style.display).toBe("");
    });

    service?.setSettings({ includeMeasurements: true });
    await service?.start();
    if (overlay) dragScreenshot(overlay);
    await vi.waitFor(() => expect(captureStates).toHaveLength(2));
    expect(captureStates[1]).toEqual({ measurement: "", rulers: "" });

    host.dispose();
  });
});
