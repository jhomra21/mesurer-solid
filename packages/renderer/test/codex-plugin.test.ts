import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MESURER_PLUGIN_BEFORE_DISABLE_HOOK,
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
import type { HostCodexBridgeRequest } from "../src/core/screenshot";

afterEach(() => {
  vi.useRealTimers();
  delete window.__MESURER_HOST__;
  sessionStorage.clear();
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

const bridgeUrlForRequest = (request: HostCodexBridgeRequest) => {
  if (request.action === "health") return { url: "http://127.0.0.1:47365/health" };

  if (request.action === "threads") {
    const params = new URLSearchParams();
    params.set("limit", String(request.limit ?? 10));

    if (request.thread) params.set("thread", request.thread);

    return { url: `http://127.0.0.1:47365/threads?${params.toString()}` };
  }

  if (request.action === "target") {
    return {
      url: "http://127.0.0.1:47365/target",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread: request.thread }),
      },
    };
  }

  if (request.action === "queue") {
    return {
      url: "http://127.0.0.1:47365/send",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: request.message, thread: request.thread }),
      },
    };
  }

  if (request.action === "delivery") {
    return {
      url: `http://127.0.0.1:47365/deliveries/${encodeURIComponent(String(request.deliveryId ?? ""))}`,
    };
  }

  if (request.action === "restore") {
    return {
      url: "http://127.0.0.1:47365/deliveries/restore",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryId: request.deliveryId,
          thread: request.thread,
          queuedSubmissionId: request.queuedSubmissionId,
        }),
      },
    };
  }

  throw new Error(`Unexpected Codex Bridge action: ${request.action}`);
};

beforeEach(() => {
  window.__MESURER_HOST__ = {
    codexBridge: async (request) => {
      if (request.action === "activate") {
        return {
          ok: true,
          leaseId: "lease-test",
          thread: "thread-1",
          threads: ["thread-1"],
          runtime: {
            source: "shared",
            transport: "shared-app-server",
            available: true,
            reason: null,
          },
        };
      }

      if (request.action === "deactivate") {
        if (request.leaseId !== "lease-test") {
          throw new Error("Codex Bridge lease mismatch in test host.");
        }

        return {
          ok: true,
          leaseId: request.leaseId,
          released: true,
        };
      }

      if (request.action === "runtime") {
        return {
          ok: true,
          runtime: {
            source: "shared",
            transport: "shared-app-server",
            available: true,
            reason: null,
          },
        };
      }

      if (request.leaseId !== "lease-test") {
        throw new Error("Codex Bridge request did not carry the active lease.");
      }

      const mapped = bridgeUrlForRequest(request);

      try {
        const response = await fetch(mapped.url, mapped.init);
        const text = await response.text();
        const payload = text ? JSON.parse(text) : {};

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || `Codex Bridge returned HTTP ${response.status}.`);
        }

        return payload;
      } catch (cause) {
        if (cause instanceof TypeError) {
          throw new Error("Codex Bridge is unavailable in this host.");
        }

        throw cause;
      }
    },
  };
});

type BridgeMockResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

type BridgeMockHandler = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<BridgeMockResponse>;

const bridgeFetchMock = (handler: BridgeMockHandler) => vi.fn(handler);

describe("codex", () => {
  it("loads without a native host and uses the browser Codex companion", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();

    delete window.__MESURER_HOST__;

    const fetchMock = bridgeFetchMock(async (input) => {
      const url = String(input);

      if (url === "http://127.0.0.1:47365/health") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "browser-thread",
            threads: ["browser-thread"],
          }),
        };
      }

      if (url.startsWith("http://127.0.0.1:47365/threads?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "browser-thread",
            threadDetails: [{
              id: "browser-thread",
              title: "Browser Codex thread",
              updatedAt: 1,
              connected: true,
            }],
            hasMore: false,
          }),
        };
      }

      throw new Error(`Unexpected browser companion request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-browser-companion",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));

    await host.load(codex({ ui: false }));
    expect(host.has("mesurer.codex")).toBe(true);

    const service = host.service.get<MesurerCodexService>(MESURER_CODEX_SERVICE_ID);

    expect(service).toBeDefined();
    await expect(service?.health()).resolves.toEqual({
      thread: "browser-thread",
      threads: ["browser-thread"],
    });
    await expect(service?.listThreads()).resolves.toEqual({
      thread: "browser-thread",
      threads: [{
        id: "browser-thread",
        title: "Browser Codex thread",
        updatedAt: 1,
        connected: true,
      }],
      hasMore: false,
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("holds one native lease until the managed plugin pre-disable barrier releases it", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();

    const bridge = vi.fn(window.__MESURER_HOST__!.codexBridge!);

    window.__MESURER_HOST__ = { codexBridge: bridge };

    await host.load(defineMesurerPlugin({
      id: "test.context-lifecycle",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex({ ui: false }));

    expect(bridge.mock.calls[0]?.[0]).toMatchObject({ action: "activate" });
    expect(host.has("mesurer.codex")).toBe(true);

    await host.hook.emit(MESURER_PLUGIN_BEFORE_DISABLE_HOOK, "mesurer.codex");

    expect(bridge.mock.calls.some(([request]) =>
      request.action === "deactivate" && request.leaseId === "lease-test")).toBe(true);

    host.remove("mesurer.codex");
    expect(host.has("mesurer.codex")).toBe(false);
  });

  it("sends saved Context evidence through the native Codex Bridge", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService, contextText } = createContextService();

    const fetchMock = bridgeFetchMock(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, thread: "thread-1", output: "queued", deliveryId: "delivery-1", status: "queued", queuedSubmissionId: "queue-1", dispatch: "persisted", dispatchError: null }),
    }));

    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex({ ui: false }));

    const service = host.service.get<MesurerCodexService>(MESURER_CODEX_SERVICE_ID);
    expect(service).toBeDefined();
    await expect(service?.queue()).resolves.toEqual({
      thread: "thread-1",
      output: "queued",
      delivery: "queued",
      deliveryId: "delivery-1",
      status: "queued",
      queuedSubmissionId: "queue-1",
      dispatch: "persisted",
      dispatchError: null,
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

  it("keeps send as a compatibility alias for queue", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();

    vi.stubGlobal("fetch", bridgeFetchMock(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        thread: "thread-alias",
        output: "queued",
        deliveryId: "delivery-alias",
        status: "queued",
      }),
    })));

    await host.load(defineMesurerPlugin({
      id: "test.context-send-alias",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex({ ui: false }));

    const service = host.service.get<MesurerCodexService>(MESURER_CODEX_SERVICE_ID);
    await expect(service?.send()).resolves.toEqual(await service?.queue());
  });

  it("reports toolbar delivery failures instead of swallowing them silently", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", bridgeFetchMock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/health")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, thread: "thread-1", threads: ["thread-1"] }),
        };
      }

      if (url.includes("/threads?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-1",
            threadDetails: [{ id: "thread-1", title: "Current task", updatedAt: 1, connected: true }],
            hasMore: false,
          }),
        };
      }

      if (url.endsWith("/send")) throw new TypeError("fetch failed");

      throw new Error(`Unexpected request: ${url}`);
    }));

    await host.load(defineMesurerPlugin({
      id: "test.context-delivery-error",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex());

    await expect(host.command.execute("codex.queue")).rejects.toThrow(
      "Codex Bridge is unavailable in this host.",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[Mesurer] Failed to queue feedback for Codex: Codex Bridge is unavailable in this host.",
    );
    host.dispose();
  });

  it("can inspect and switch among threads loaded by Codex", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();

    const fetchMock = bridgeFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
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

  it("lists loaded app-server thread metadata through Codex Bridge", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();

    const fetchMock = bridgeFetchMock(async (input: RequestInfo | URL) => {
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

    const fetchMock = bridgeFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
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

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/health"))).toBe(true);
    });

    const initial = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(initial?.label).toBe("Queue to Codex");
    expect(initial?.disabled?.()).toBe(false);
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

    const fetchMock = bridgeFetchMock(async (input: RequestInfo | URL) => {
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

  it("keeps reconciling an interrupted delivery and follows a later backend completion correction", async () => {
    vi.useFakeTimers();
    const host = createMesurerPluginHost();
    const { service: contextService, removeAnnotation } = createContextService();
    let sendCount = 0;
    let deliveryReads = 0;

    const fetchMock = bridgeFetchMock(async (input: RequestInfo | URL) => {
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
            deliveryId: "delivery-corrected-terminal",
            status: "queued",
            queuedSubmissionId: "queue-corrected-terminal",
            dispatch: "persisted",
          }),
        };
      }

      if (url.endsWith("/deliveries/delivery-corrected-terminal")) {
        deliveryReads += 1;

        const status = deliveryReads === 1
          ? "working"
          : deliveryReads === 2
            ? "interrupted"
            : "completed";

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            deliveryId: "delivery-corrected-terminal",
            thread: "thread-a",
            status,
            turnId: "turn-corrected-terminal",
            queuedSubmissionId: "queue-corrected-terminal",
            dispatch: "persisted",
            dispatchError: null,
            createdAt: Date.now() - 5_000,
            updatedAt: Date.now(),
          }),
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-terminal-correction",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex());
    await host.command.execute("codex.send");
    expect(sendCount).toBe(1);

    await vi.advanceTimersByTimeAsync(DELIVERY_POLL_MS_FOR_TEST);
    expect(host.tools().find((candidate) => candidate.id === "codex.send")?.label)
      .toBe("Codex working…");

    await vi.advanceTimersByTimeAsync(DELIVERY_POLL_MS_FOR_TEST);
    let tool = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(tool?.label).toBe("Codex interrupted");
    expect(tool?.disabled?.()).toBe(false);
    expect(removeAnnotation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    tool = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(tool?.label).toBe("Codex finished");
    expect(removeAnnotation).toHaveBeenCalledTimes(1);
    expect(removeAnnotation).toHaveBeenCalledWith("note-1");
    expect(sendCount).toBe(1);

    host.dispose();
    vi.useRealTimers();
  });

  it("keeps the page-pinned Codex thread across a reload even when the bridge default changes", async () => {
    const firstHost = createMesurerPluginHost();
    const { service: firstContext } = createContextService();
    let phase: "first" | "second" = "first";
    const sendBodies: Array<{ message: string; thread?: string }> = [];

    const fetchMock = bridgeFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/health")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(phase === "first"
            ? { ok: true, thread: "thread-a", threads: ["thread-a"] }
            : { ok: true, thread: "thread-b", threads: ["thread-a", "thread-b"] }),
        };
      }

      if (url.includes("/threads?")) {
        const scoped = new URL(url).searchParams.get("thread");

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: scoped,
            threadDetails: phase === "first"
              ? [{ id: "thread-a", title: "Original task", updatedAt: 10, connected: true }]
              : [
                  { id: "thread-a", title: "Original task", updatedAt: 10, connected: true },
                  { id: "thread-b", title: "Other task", updatedAt: 9, connected: true },
                ],
            hasMore: false,
          }),
        };
      }

      if (url.endsWith("/send")) {
        const body = JSON.parse(String(init?.body));
        sendBodies.push(body);

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: body.thread,
            output: "queued",
            delivery: "queued",
            status: "queued",
          }),
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await firstHost.load(defineMesurerPlugin({
      id: "test.context-affinity-first",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", firstContext);
      },
    }));
    await firstHost.load(codex());

    const chooser = firstHost.tools()
      .find((candidate) => candidate.id === "codex.send")
      ?.menu?.items[0];

    await chooser?.run();
    firstHost.dispose();

    phase = "second";
    const secondHost = createMesurerPluginHost();
    const { service: secondContext } = createContextService();
    await secondHost.load(defineMesurerPlugin({
      id: "test.context-affinity-second",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", secondContext);
      },
    }));
    await secondHost.load(codex());
    await secondHost.command.execute("codex.send");

    expect(sendBodies).toHaveLength(1);
    expect(sendBodies[0]?.thread).toBe("thread-a");
    secondHost.dispose();
  });

  it("requires an explicit destination instead of inheriting a stale bridge default when multiple threads are loaded", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();
    let sendCount = 0;

    const fetchMock = bridgeFetchMock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/health")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-stale",
            threads: ["thread-correct", "thread-stale"],
          }),
        };
      }

      if (url.includes("/threads?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-stale",
            threadDetails: [
              { id: "thread-correct", title: "Correct task", updatedAt: 10, connected: true },
              { id: "thread-stale", title: "Unrelated idle task", updatedAt: 9, connected: true },
            ],
            hasMore: false,
          }),
        };
      }

      if (url.endsWith("/send")) {
        sendCount += 1;
        throw new Error("send should not run before the user chooses a thread");
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-ambiguous-route",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex());

    const tool = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(tool?.label).toBe("Choose Codex thread");
    expect(tool?.disabled?.()).toBe(true);
    expect(tool?.menu?.items.map((item) => item.label)).toContain("Loaded · Correct task");
    expect(tool?.menu?.items.map((item) => item.label)).toContain("Loaded · Unrelated idle task");
    expect(sendCount).toBe(0);

    await tool?.menu?.items.find((item) => item.id === "codex.thread.thread-correct")?.run();
    const selected = host.tools().find((candidate) => candidate.id === "codex.send");
    expect(selected?.label).toBe("Queue to Codex");
    expect(selected?.disabled?.()).toBe(false);
    host.dispose();
  });

  it("keeps queued work pending until Codex reports a matching working turn", async () => {
    vi.useFakeTimers();
    const host = createMesurerPluginHost();
    const { service: contextService, removeAnnotation } = createContextService();
    let deliveryReads = 0;

    const fetchMock = bridgeFetchMock(async (input: RequestInfo | URL) => {
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
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-a",
            threadDetails: [{
              id: "thread-a",
              title: "Current task",
              updatedAt: 10,
              connected: true,
            }],
            hasMore: false,
          }),
        };
      }

      if (url.endsWith("/send")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: "thread-a",
            output: "Queued message queue-a for thread thread-a.",
            delivery: "queued",
            deliveryId: "delivery-a",
            status: "queued",
            queuedSubmissionId: "queue-a",
            dispatch: "persisted",
            dispatchError: null,
          }),
        };
      }

      if (url.endsWith("/deliveries/delivery-a")) {
        deliveryReads += 1;

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            deliveryId: "delivery-a",
            thread: "thread-a",
            status: deliveryReads === 1 ? "queued" : "working",
            turnId: deliveryReads === 1 ? null : "turn-a",
            queuedSubmissionId: "queue-a",
            dispatch: "persisted",
            dispatchError: null,
            createdAt: 1,
            updatedAt: 1 + deliveryReads,
          }),
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await host.load(defineMesurerPlugin({
      id: "test.context-queued-to-working",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex());
    await host.command.execute("codex.send");

    expect(host.tools().find((candidate) => candidate.id === "codex.send")?.label)
      .toBe("Queued for Codex");

    await vi.advanceTimersByTimeAsync(DELIVERY_POLL_MS_FOR_TEST);
    expect(host.tools().find((candidate) => candidate.id === "codex.send")?.label)
      .toBe("Queued for Codex");
    expect(removeAnnotation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DELIVERY_POLL_MS_FOR_TEST);
    expect(host.tools().find((candidate) => candidate.id === "codex.send")?.label)
      .toBe("Codex working…");
    expect(removeAnnotation).not.toHaveBeenCalled();

    host.dispose();
    vi.useRealTimers();
  });

  it("reattaches a queued delivery after the bridge restarts without sending the feedback twice", async () => {
    vi.useFakeTimers();
    const firstHost = createMesurerPluginHost();
    const { service: firstContext } = createContextService();
    let phase: "first" | "second" = "first";
    let sendCount = 0;
    let deliveryReads = 0;

    const restoreBodies: Array<{
      deliveryId: string;
      thread: string;
      queuedSubmissionId?: string;
    }> = [];

    const fetchMock = bridgeFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
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
            output: "Queued message queue-restart-1 for thread thread-a.",
            delivery: "queued",
            deliveryId: "delivery-restart-1",
            status: "queued",
            queuedSubmissionId: "queue-restart-1",
            dispatch: "persisted",
            dispatchError: null,
          }),
        };
      }

      if (url.endsWith("/deliveries/restore")) {
        const body = JSON.parse(String(init?.body));
        restoreBodies.push(body);

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            restored: true,
            deliveryId: "delivery-restart-1",
            thread: "thread-a",
            status: "queued",
            turnId: null,
            queuedSubmissionId: "queue-restart-1",
            dispatch: "persisted",
            dispatchError: null,
            createdAt: 3,
            updatedAt: 3,
          }),
        };
      }

      if (url.endsWith("/deliveries/delivery-restart-1")) {
        if (phase === "first") throw new Error("first host must be disposed before polling");
        deliveryReads += 1;

        if (deliveryReads === 1) {
          return {
            ok: false,
            status: 404,
            text: async () => JSON.stringify({
              ok: false,
              error: "Codex delivery is not available: delivery-restart-1",
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            deliveryId: "delivery-restart-1",
            thread: "thread-a",
            status: deliveryReads === 2 ? "working" : "completed",
            turnId: "turn-restart-1",
            queuedSubmissionId: "queue-restart-1",
            dispatch: "persisted",
            dispatchError: null,
            createdAt: 3,
            updatedAt: 3 + deliveryReads,
          }),
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await firstHost.load(defineMesurerPlugin({
      id: "test.context-bridge-restart-first",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", firstContext);
      },
    }));
    await firstHost.load(codex());
    await firstHost.command.execute("codex.send");
    expect(sendCount).toBe(1);
    expect(firstHost.tools().find((candidate) => candidate.id === "codex.send")?.label)
      .toBe("Queued for Codex");
    firstHost.dispose();

    phase = "second";
    const secondHost = createMesurerPluginHost();
    const { service: secondContext, removeAnnotation } = createContextService();
    await secondHost.load(defineMesurerPlugin({
      id: "test.context-bridge-restart-second",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", secondContext);
      },
    }));
    await secondHost.load(codex());

    await vi.advanceTimersByTimeAsync(0);
    expect(sendCount).toBe(1);
    expect(restoreBodies).toEqual([{
      deliveryId: "delivery-restart-1",
      thread: "thread-a",
      queuedSubmissionId: "queue-restart-1",
    }]);
    expect(secondHost.tools().find((candidate) => candidate.id === "codex.send")?.label)
      .toBe("Queued for Codex");

    await vi.advanceTimersByTimeAsync(DELIVERY_POLL_MS_FOR_TEST);
    expect(secondHost.tools().find((candidate) => candidate.id === "codex.send")?.label)
      .toBe("Codex working…");

    await vi.advanceTimersByTimeAsync(DELIVERY_POLL_MS_FOR_TEST);
    expect(secondHost.tools().find((candidate) => candidate.id === "codex.send")?.label)
      .toBe("Codex finished");
    expect(removeAnnotation).toHaveBeenCalledTimes(1);
    expect(removeAnnotation).toHaveBeenCalledWith("note-1");
    expect(sendCount).toBe(1);

    secondHost.dispose();
    vi.useRealTimers();
  });

  it("resumes an in-flight tracked delivery after a page reload and retires its exact annotation on completion", async () => {
    vi.useFakeTimers();
    const firstHost = createMesurerPluginHost();
    const { service: firstContext } = createContextService();
    let deliveryReads = 0;

    const fetchMock = bridgeFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
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
        const body = JSON.parse(String(init?.body));

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            thread: body.thread,
            output: "queued",
            delivery: "queued",
            deliveryId: "delivery-reload",
            status: "queued",
          }),
        };
      }

      if (url.endsWith("/deliveries/delivery-reload")) {
        deliveryReads += 1;

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            deliveryId: "delivery-reload",
            thread: "thread-a",
            status: "completed",
            turnId: "turn-reload",
            createdAt: 1,
            updatedAt: 2,
          }),
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await firstHost.load(defineMesurerPlugin({
      id: "test.context-reload-first",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", firstContext);
      },
    }));
    await firstHost.load(codex());
    await firstHost.command.execute("codex.send");
    firstHost.dispose();

    const secondHost = createMesurerPluginHost();
    const { service: secondContext, removeAnnotation } = createContextService();
    await secondHost.load(defineMesurerPlugin({
      id: "test.context-reload-second",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", secondContext);
      },
    }));
    await secondHost.load(codex());

    await vi.advanceTimersByTimeAsync(0);
    expect(deliveryReads).toBe(1);
    expect(removeAnnotation).toHaveBeenCalledWith("note-1");
    expect(secondHost.tools().find((candidate) => candidate.id === "codex.send")?.label)
      .toBe("Codex finished");
    secondHost.dispose();
  });

  it("rolls back plugin activation when native Codex readiness fails", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();
    const bridge = vi.fn(window.__MESURER_HOST__!.codexBridge!);

    window.__MESURER_HOST__ = { codexBridge: bridge };

    const fetchMock = bridgeFetchMock(async () => {
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

    await expect(host.load(codex())).rejects.toThrow(
      "Codex Bridge is unavailable in this host.",
    );

    expect(host.has("mesurer.codex")).toBe(false);
    expect(host.tools().find((candidate) => candidate.id === "codex.send")).toBeUndefined();
    expect(host.service.get(MESURER_CODEX_SERVICE_ID)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bridge.mock.calls.some(([request]) =>
      request.action === "deactivate"
      && request.leaseId === "lease-test")).toBe(true);
    host.dispose();
  });

  it("keeps a durable Desktop queue receipt visible without blocking the next send", async () => {
    vi.useFakeTimers();
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();

    const bridge = vi.fn(async (request: HostCodexBridgeRequest) => {
      if (request.action === "activate") {
        return {
          ok: true,
          leaseId: "desktop-lease",
          thread: "desktop-thread",
          threads: ["desktop-thread"],
          runtime: {
            source: "desktop" as const,
            transport: "desktop-queue" as const,
            available: true,
            reason: null,
          },
        };
      }

      if (request.action === "deactivate") {
        return { ok: true, leaseId: request.leaseId, released: true };
      }

      if (request.leaseId !== "desktop-lease") {
        throw new Error("Desktop request did not carry its activation lease.");
      }

      if (request.action === "health") {
        return {
          ok: true,
          thread: "desktop-thread",
          threads: ["desktop-thread"],
          runtime: {
            source: "desktop" as const,
            transport: "desktop-queue" as const,
            available: true,
            reason: null,
          },
        };
      }

      if (request.action === "threads") {
        return {
          ok: true,
          thread: "desktop-thread",
          threadDetails: [{
            id: "desktop-thread",
            title: "Current Codex Desktop thread",
            updatedAt: null,
            connected: true,
          }],
          hasMore: false,
        };
      }

      if (request.action === "queue") {
        return {
          ok: true,
          thread: "desktop-thread",
          output: "queued",
          delivery: "queued" as const,
          deliveryId: "desktop-delivery",
          status: "queued" as const,
          queuedSubmissionId: "desktop-submission-12345678",
          dispatch: "desktop-opened" as const,
          dispatchError: null,
        };
      }

      if (request.action === "delivery") {
        return {
          ok: true,
          deliveryId: "desktop-delivery",
          thread: "desktop-thread",
          status: "queued" as const,
          turnId: null,
          queuedSubmissionId: "desktop-submission-12345678",
          dispatch: "desktop-opened" as const,
          dispatchError: null,
          createdAt: 1,
          updatedAt: 1,
        };
      }

      if (request.action === "runtime") {
        return {
          ok: true,
          runtime: {
            source: "desktop" as const,
            transport: "desktop-queue" as const,
            available: true,
            reason: null,
          },
        };
      }

      throw new Error(`Unexpected Desktop bridge action: ${request.action}`);
    });

    window.__MESURER_HOST__ = { codexBridge: bridge };

    await host.load(defineMesurerPlugin({
      id: "test.context-desktop-receipt",
      provides: ["context:v1"],
      setup(ctx) {
        ctx.service.provide("context:v1", contextService);
      },
    }));
    await host.load(codex());
    await host.command.execute("codex.queue");

    await vi.advanceTimersByTimeAsync(DELIVERY_POLL_MS_FOR_TEST + 5_000);

    const tool = host.tools().find((candidate) => candidate.id === "codex.send");

    expect(tool?.label).toBe("Queued for Codex");
    expect(tool?.disabled?.()).toBe(false);
    expect(tool?.menu?.items.some((item) =>
      item.id === "codex.delivery.receipt"
      && item.label.includes("desktop-"))).toBe(true);

    host.dispose();
    vi.useRealTimers();
  });

  it("can send one message to another loaded thread without changing the default", async () => {
    const host = createMesurerPluginHost();
    const { service: contextService } = createContextService();

    const fetchMock = bridgeFetchMock(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
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
    await expect(service?.queue({ thread: "thread-b" })).resolves.toEqual({
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

    const fetchMock = bridgeFetchMock(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
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
    await service?.queue({ instruction: "Fix the selected UI." });

    expect(contextText).toHaveBeenCalledWith({ scope: "selection" });
    const init = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(init?.body));
    expect(payload.message).toContain("Fix the selected UI.");
    expect(payload.message).toContain("selection evidence");
  });
});
