import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMesurerPluginHost,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid-core";
import {
  codex,
  MESURER_CODEX_SERVICE_ID,
  type MesurerCodexService,
} from "../../mesurer/src/plugins";
import type { MesurerAnnotation, MesurerContextRequest } from "../../mesurer/src/context";
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
  const contextText = vi.fn(async (request?: MesurerContextRequest) => {
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

describe("codex", () => {
  it("sends saved Context evidence through the explicit loopback transport", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService, contextText } = createContextService();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, thread: "thread-1", output: "queued" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex({ endpoint: "http://127.0.0.1:47365", ui: false }));

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
    expect(payload.thread).toBeUndefined();
  });

  it("can inspect and switch among threads registered by Codex", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-a",
            threads: ["thread-a", "thread-b"],
          }),
        };
      }
      if (url.endsWith("/target")) {
        expect(JSON.parse(String(init?.body))).toEqual({ thread: "thread-b" });
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-b",
            threads: ["thread-a", "thread-b"],
          }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-threads",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex({ ui: false }));

    const service = host.service.get<MesurerCodexService>(MESURER_CODEX_SERVICE_ID);
    await expect(service?.health()).resolves.toEqual({
      thread: "thread-a",
      threads: ["thread-a", "thread-b"],
    });
    await expect(service?.useThread(" thread-b ")).resolves.toEqual({
      thread: "thread-b",
      threads: ["thread-a", "thread-b"],
    });
  });

  it("can send one message to another registered thread without changing the default", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, thread: "thread-b", output: "queued" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-thread-override",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex({ ui: false }));

    const service = host.service.get<MesurerCodexService>(MESURER_CODEX_SERVICE_ID);
    await expect(service?.send({ thread: "thread-b" })).resolves.toEqual({
      thread: "thread-b",
      output: "queued",
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.thread).toBe("thread-b");
  });

  it("falls back to the current selection when there are no saved annotations", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService, contextText } = createContextService();
    contextService.annotations = async () => [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, thread: "thread-2" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-empty",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex({ ui: false }));

    const service = host.service.get<MesurerCodexService>(MESURER_CODEX_SERVICE_ID);
    await service?.send({ instruction: "Fix the selected UI." });

    expect(contextText).toHaveBeenCalledWith({ scope: "selection" });
    const init = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(init?.body));
    expect(payload.message).toContain("Fix the selected UI.");
    expect(payload.message).toContain("selection evidence");
  });
});
