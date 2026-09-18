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
  const removeAnnotation = vi.fn(async (_annotationId: string) => {});
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
    removeAnnotation,
    review: async () => [],
    capturePlan: async () => { throw new Error("capturePlan() is not needed by this contract"); },
    prepareCapture: async () => {},
    finishCapture: async () => {},
  };
  return { service, contextText, removeAnnotation };
};

const DELIVERY_POLL_MS_FOR_TEST = 750;

describe("codex", () => {
  it("sends saved Context evidence through the explicit loopback transport", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService, contextText } = createContextService();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, thread: "thread-1", output: "queued", deliveryId: "delivery-1", status: "queued" }),
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
    await expect(service?.send()).resolves.toEqual({
      thread: "thread-1",
      output: "queued",
      delivery: "queued",
      deliveryId: "delivery-1",
      status: "queued",
      annotationIds: ["note-1"],
    });

    expect(contextText).toHaveBeenCalledWith({ annotation: "note-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:47365/send");
    const init = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(init?.body));
    expect(payload.message).toContain("Implement the current human feedback from Mesurer in this project.");
    expect(payload.message).toContain("annotation evidence note-1");
    expect(payload.thread).toBeUndefined();
  });

  it("reports toolbar delivery failures instead of swallowing them silently", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));

    await host.load(defineMesurerPlugin({
      id: "test.context-delivery-error",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex({ endpoint: "http://127.0.0.1:47365" }));

    await expect(host.command.execute("codex.send")).rejects.toThrow(
      "Mesurer Codex bridge is unavailable at http://127.0.0.1:47365. Start the local bridge before queueing feedback.",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[Mesurer] Failed to queue feedback for Codex: Mesurer Codex bridge is unavailable at http://127.0.0.1:47365. Start the local bridge before queueing feedback.",
    );
    host.dispose();
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

  it("lists app-server thread metadata through the bridge", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:47365/threads?limit=5&thread=thread-a");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          thread: "thread-a",
          threadDetails: [
            { id: "thread-a", title: "Current task", updatedAt: 10, connected: true },
            { id: "thread-b", title: "Recent task", updatedAt: 9, connected: false },
          ],
          hasMore: true,
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-list-threads",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex({ ui: false }));

    const service = host.service.get<MesurerCodexService>(MESURER_CODEX_SERVICE_ID);
    await expect(service?.listThreads({ limit: 5, thread: "thread-a" })).resolves.toEqual({
      thread: "thread-a",
      threads: [
        { id: "thread-a", title: "Current task", updatedAt: 10, connected: true },
        { id: "thread-b", title: "Recent task", updatedAt: 9, connected: false },
      ],
      hasMore: true,
    });
  });

  it("pins the toolbar to its originating Codex thread and exposes five recent choices", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();
    const sendBodies: Array<{ message: string; thread?: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-a",
            threads: ["thread-a"],
          }),
        };
      }
      if (url.includes("/threads?")) {
        expect(url).toBe("http://127.0.0.1:47365/threads?limit=10&thread=thread-a");
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-a",
            threadDetails: [
              { id: "thread-a", title: "Original task", updatedAt: 10, connected: true },
              { id: "thread-b", title: "Second task", updatedAt: 9, connected: false },
              { id: "thread-c", title: "Third task", updatedAt: 8, connected: false },
              { id: "thread-d", title: "Fourth task", updatedAt: 7, connected: false },
              { id: "thread-e", title: "Fifth task", updatedAt: 6, connected: false },
              { id: "thread-f", title: "Sixth task", updatedAt: 5, connected: false },
            ],
            hasMore: false,
          }),
        };
      }
      if (url.endsWith("/send")) {
        sendBodies.push(JSON.parse(String(init?.body)));
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, thread: "thread-a", output: "queued" }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-ui-thread-picker",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex());

    expect(fetchMock).not.toHaveBeenCalled();
    const initial = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(initial?.label).toBe("Queue to Codex");
    expect(initial?.disabled?.()).toBe(false);
    expect(initial?.menu?.items.map((item) => item.label)).toEqual(["Choose Codex thread…"]);
    await initial?.menu?.items[0]?.run();

    await vi.waitFor(() => {
      const tool = host.tools().find((candidate) => candidate.id === "codex.send");
      expect(tool?.label).toBe("Queue to Codex");
      expect(tool?.disabled?.()).toBe(false);
      expect(tool?.menu?.items).toHaveLength(6);
      expect(tool?.menu?.items[0]?.label).toBe("Current · Original task");
      expect(tool?.menu?.items[5]?.label).toBe("Show 5 more…");
    });

    const tool = host.tools().find((candidate) => candidate.id === "codex.send");
    await tool?.menu?.items.find((item) => item.id === "codex.thread.show-more")?.run();
    const expanded = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(expanded?.menu?.items.map((item) => item.label)).toEqual([
      "Current · Original task",
      "Second task",
      "Third task",
      "Fourth task",
      "Fifth task",
      "Sixth task",
    ]);

    await host.command.execute("codex.send");
    expect(sendBodies).toHaveLength(1);
    expect(sendBodies[0]?.thread).toBe("thread-a");
    host.dispose();
  });


  it("shows queued work as busy, suppresses duplicate sends, and removes completed annotations", async () => {
    vi.useFakeTimers();
    const host = createMesurerPluginHost();
    const { service: contextService, removeAnnotation } = createContextService();
    let sendCount = 0;
    let deliveryReads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, thread: "thread-a", threads: ["thread-a"] }),
        };
      }
      if (url.includes("/threads?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-a",
            threadDetails: [{ id: "thread-a", title: "Current task", updatedAt: 10, connected: true }],
            hasMore: false,
          }),
        };
      }
      if (url.endsWith("/send")) {
        sendCount += 1;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-a",
            output: "queued",
            delivery: "queued",
            deliveryId: "delivery-a",
            status: "queued",
          }),
        };
      }
      if (url.endsWith("/deliveries/delivery-a")) {
        deliveryReads += 1;
        const status = deliveryReads === 1 ? "working" : "completed";
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            deliveryId: "delivery-a",
            thread: "thread-a",
            status,
            turnId: "turn-a",
            createdAt: 1,
            updatedAt: 2 + deliveryReads,
          }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-delivery-lifecycle",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex());

    const first = host.command.execute("codex.send");
    const second = host.command.execute("codex.send");
    await Promise.all([first, second]);
    expect(sendCount).toBe(1);

    let tool = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(tool?.label).toBe("Queued for Codex");
    expect(tool?.disabled?.()).toBe(true);
    expect(tool?.menu?.items[0]?.label).toContain("Queued");
    expect(tool?.menu?.items[0]?.disabled?.()).toBe(true);

    await vi.advanceTimersByTimeAsync(DELIVERY_POLL_MS_FOR_TEST);
    tool = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(tool?.label).toBe("Codex working…");
    expect(removeAnnotation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DELIVERY_POLL_MS_FOR_TEST);
    tool = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(tool?.label).toBe("Codex finished");
    expect(tool?.disabled?.()).toBe(true);
    expect(removeAnnotation).toHaveBeenCalledTimes(1);
    expect(removeAnnotation).toHaveBeenCalledWith("note-1");

    await vi.advanceTimersByTimeAsync(2_000);
    tool = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(tool?.label).toBe("Queue to Codex");
    expect(tool?.disabled?.()).toBe(false);
    host.dispose();
    vi.useRealTimers();
  });

  it("does not probe loopback until the user asks for Codex, then marks a missing bridge unavailable", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-ui-offline",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex());

    const initial = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(initial?.label).toBe("Queue to Codex");
    expect(initial?.disabled?.()).toBe(false);
    expect(initial?.menu?.items.map((item) => item.label)).toEqual(["Choose Codex thread…"]);

    await expect(host.command.execute("codex.send")).rejects.toThrow(
      "Mesurer Codex bridge is unavailable at http://127.0.0.1:47365. Start the local bridge before queueing feedback.",
    );

    const unavailable = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(unavailable?.label).toBe("Codex unavailable");
    expect(unavailable?.disabled?.()).toBe(true);
    expect(unavailable?.menu?.items.map((item) => item.label)).toEqual(["Retry Codex connection"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it("can send one message to another registered thread without changing the default", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, thread: "thread-b", output: "queued", deliveryId: "delivery-b", status: "queued" }),
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
      delivery: "queued",
      deliveryId: "delivery-b",
      status: "queued",
      annotationIds: ["note-1"],
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
      text: async () => JSON.stringify({ ok: true, thread: "thread-2", deliveryId: "delivery-2", status: "queued" }),
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
