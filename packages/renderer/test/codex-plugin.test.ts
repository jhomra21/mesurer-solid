import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMesurerPluginHost,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid-core";
import {
  codexPlugin,
  MESURER_CODEX_SERVICE_ID,
  type MesurerCodexService,
} from "../../mesurer/src/codex-plugin";
import type { MesurerAnnotation } from "../../mesurer/src/context";
import type { MesurerContextService } from "../../mesurer/src/context-plugin";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const annotation: MesurerAnnotation = {
  id: "note-1",
  note: "Give this card more breathing room",
  createdAt: 1,
  anchor: {
    kind: "region",
    rect: { left: 10, top: 20, width: 200, height: 100 },
  },
  baseline: {
    targets: [],
    guides: [],
    measurements: [],
    distances: [],
  },
};

const createContextService = () => {
  const contextText = vi.fn(async (request) => {
    if (request && "annotation" in request) return `annotation evidence ${request.annotation}`;
    if (request?.scope === "selection") return "selection evidence";
    return "workspace evidence";
  });
  const service: MesurerContextService = {
    context: async () => { throw new Error("context() is not needed by this contract"); },
    contextText,
    copyContext: async () => {},
    select: async () => { throw new Error("select() is not needed by this contract"); },
    annotations: async () => [annotation],
    review: async () => [],
    capturePlan: async () => { throw new Error("capturePlan() is not needed by this contract"); },
    prepareCapture: async () => {},
    finishCapture: async () => {},
  };
  return { service, contextText };
};

describe("codexPlugin", () => {
  it("sends saved Context evidence through the explicit loopback transport", async () => {
    const host = createMesurerPluginHost();
    const { service: context, contextText } = createContextService();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, thread: "thread-1", output: "queued" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", context);
      },
    }));
    await host.load(codexPlugin({ endpoint: "http://127.0.0.1:47365", ui: false }));

    const service = host.service.get<MesurerCodexService>(MESURER_CODEX_SERVICE_ID);
    expect(service).toBeDefined();
    await expect(service?.send()).resolves.toEqual({ thread: "thread-1", output: "queued" });

    expect(contextText).toHaveBeenCalledWith({ annotation: "note-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:47365/send");
    const init = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(init?.body));
    expect(payload.message).toContain("Implement the current human feedback from Mesurer in this project.");
    expect(payload.message).toContain("annotation evidence note-1");
  });

  it("falls back to the current selection when there are no saved annotations", async () => {
    const host = createMesurerPluginHost();
    const { service: context, contextText } = createContextService();
    context.annotations = async () => [];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, thread: "thread-2" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-empty",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", context);
      },
    }));
    await host.load(codexPlugin({ ui: false }));

    const service = host.service.get<MesurerCodexService>(MESURER_CODEX_SERVICE_ID);
    await service?.send({ instruction: "Fix the selected UI." });

    expect(contextText).toHaveBeenCalledWith({ scope: "selection" });
    const init = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(init?.body));
    expect(payload.message).toContain("Fix the selected UI.");
    expect(payload.message).toContain("selection evidence");
  });
});
