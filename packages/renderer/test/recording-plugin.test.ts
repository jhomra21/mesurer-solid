import { afterEach, describe, expect, it } from "vitest";
import {
  createMesurerPluginHost,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../src/ComposableMesurer";
import {
  MESURER_RECORDING_SERVICE_ID,
  recordingPlugin,
  type MesurerRecordingService,
} from "../src/plugins/recording";

afterEach(() => {
  document.body.replaceChildren();
});

const createRuntime = () => {
  const host = createMesurerPluginHost();
  const toolbar = document.createElement("div");
  toolbar.dataset.mesurerToolbar = "true";
  document.body.append(toolbar);

  const runtime: MesurerSolidRuntimeService = {
    ownerDocument: document,
    ownerWindow: window,
    portalTarget: document.body,
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

  return { host, runtime, toolbar };
};

const loadRuntime = async (
  host: ReturnType<typeof createMesurerPluginHost>,
  runtime: MesurerSolidRuntimeService,
) => {
  await host.load(defineMesurerPlugin({
    id: "test.runtime",
    provides: ["runtime:solid"],
    setup(ctx) {
      ctx.service.provide("runtime:solid", runtime);
    },
  }));
};

describe("recordingPlugin", () => {
  it("owns selection lifecycle, persisted visibility, and disposable UI", async () => {
    const { host, runtime, toolbar } = createRuntime();

    await loadRuntime(host, runtime);
    await host.load(recordingPlugin());

    expect(host.tools().map((tool) => tool.id)).toEqual(["recording"]);
    expect(host.tools()[0]?.shortcut).toBe("Shift+R");
    expect(host.tools()[0]?.toolbarMode).toBe("select");
    expect(host.describe().commands).toEqual(expect.arrayContaining([
      "recording.toggle",
      "recording.stop",
      "recording.discard",
      "recording.export",
    ]));

    const service = host.service.get<MesurerRecordingService>(MESURER_RECORDING_SERVICE_ID);

    expect(service).toBeDefined();
    expect(service?.snapshot()).toEqual({
      status: "idle",
      elapsed: 0,
      rect: null,
      duration: null,
      width: null,
      height: null,
      error: null,
    });

    const snapshots: string[] = [];

    const unsubscribe = service?.subscribe((snapshot) => {
      snapshots.push(snapshot.status);
    });

    await service?.start();

    expect(service?.snapshot().status).toBe("selecting");
    expect(toolbar.style.visibility).toBe("hidden");
    expect(document.querySelector("[data-mesurer-recording-select='true']")).not.toBeNull();

    await service?.cancel();

    expect(service?.snapshot().status).toBe("idle");
    expect(toolbar.style.visibility).toBe("");
    expect(snapshots).toEqual(["selecting", "idle"]);

    const toolControl = host.settings()[0]?.controls?.find((control) => control.id === "tool");

    expect(toolControl).toBeDefined();
    await toolControl?.set(false);
    expect(host.tools()[0]?.hidden?.()).toBe(true);
    expect(host.state.serialize("persist")).toEqual({
      "mesurer.recording.settings": {
        toolEnabled: false,
      },
    });

    unsubscribe?.();
    expect(host.remove("mesurer.recording")).toBe(true);
    expect(document.querySelector("[data-mesurer-recording='true']")).toBeNull();

    host.dispose();
  });
});
