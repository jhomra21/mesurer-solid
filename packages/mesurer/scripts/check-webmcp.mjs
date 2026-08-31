import { createMesurerFeedbackBus } from "../src/context.ts";
import {
  MESURER_CONTEXT_FEEDBACK_SERVICE_ID,
  MESURER_CONTEXT_SERVICE_ID,
} from "../src/context-services.ts";
import { webMcpPlugin } from "../src/webmcp.ts";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const context = {
  schema: "mesurer.context/v1",
  id: "context-webmcp-check",
  createdAt: "2026-08-26T00:00:00.000Z",
  scope: { kind: "selection" },
  page: { url: "https://example.test/", title: "WebMCP check" },
  viewport: { width: 800, height: 600, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
  coordinateSpace: "viewport-css-px",
  regions: [],
  visualState: { rulersVisible: false, xrayVisible: false },
  targets: [],
  visualContext: { guides: [], measurements: [], distances: [] },
};
const plan = {
  schema: "mesurer.capture/v1",
  contextId: context.id,
  chrome: "hide",
  evidence: "show",
  captures: [{ id: "viewport", kind: "viewport" }],
};
const delivery = { context, text: "Human feedback", images: [] };
const feedbackBus = createMesurerFeedbackBus();
const registrations = [];
const provided = new Map();
const tools = [];
const previousDocument = globalThis.document;

globalThis.document = {
  modelContext: {
    async registerTool(tool, options) {
      tools.push({ tool, options });
    },
  },
};

try {
  const contextService = {
    context: async () => context,
    annotations: async () => [],
    review: async () => [],
    prepareCapture: async () => {},
    finishCapture: async () => {},
  };
  await webMcpPlugin({ feedbackBus }).setup({
    service: {
      get(id) {
        if (id === MESURER_CONTEXT_SERVICE_ID) return contextService;
        if (id === MESURER_CONTEXT_FEEDBACK_SERVICE_ID) return feedbackBus;
        return undefined;
      },
      provide(id, value) {
        provided.set(id, value);
        return { dispose() {} };
      },
    },
    lifecycle: {
      onDispose(handler) {
        registrations.push(handler);
        return { dispose() {} };
      },
    },
  });

  const names = tools.map(({ tool }) => tool.name);
  assert(names.length === 6, "WebMCP must register six Mesurer tools.");
  assert(names.join("|") === [
    "mesurer.feedback.wait",
    "mesurer.context.get",
    "mesurer.annotations.list",
    "mesurer.review",
    "mesurer.capture.prepare",
    "mesurer.capture.finish",
  ].join("|"), "WebMCP tool registration order/names changed unexpectedly.");
  assert(provided.get("webmcp:v1")?.available === true, "WebMCP service must report native availability.");

  const waitTool = tools[0].tool;
  const controller = new AbortController();
  const pending = waitTool.execute({ afterSequence: 0, timeoutMs: 1000 }, { signal: controller.signal });
  const event = feedbackBus.publish(delivery, plan);
  const received = await pending;
  assert(received.status === "received" && received.event.id === event.id, "Pending WebMCP wait must resolve with the next feedback event.");
  const replay = await waitTool.execute({ afterId: "unknown-cursor", timeoutMs: 1000 }, { signal: new AbortController().signal });
  assert(replay.status === "received" && replay.event.id === event.id, "An unknown cursor must still read retained feedback.");

  const cancelledController = new AbortController();
  const cancelled = waitTool.execute({ afterSequence: event.sequence, timeoutMs: 1000 }, { signal: cancelledController.signal });
  cancelledController.abort();
  await cancelled.then(
    () => { throw new Error("Aborted WebMCP feedback wait unexpectedly resolved."); },
    () => {},
  );
  assert(feedbackBus.hasPendingWaiters() === false, "Cancelled WebMCP wait must remove its listener.");

  registrations.forEach((dispose) => dispose());
  assert(tools.every(({ options }) => options?.signal?.aborted === true), "Plugin disposal must unregister every WebMCP tool.");
  console.log("Mesurer WebMCP registration and feedback bus: PASS");
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}
