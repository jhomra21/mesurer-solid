import {
  createAcpContextSender,
  createCodexAppServerContextSender,
  toCodexAppServerInput,
} from "../src/delivery.ts";
import {
  connectContextPluginToHost,
  isMesurerHostBridge,
  MESURER_HOST_BRIDGE_PROTOCOL,
} from "../src/host-bridge.ts";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const context = {
  schema: "mesurer.context/v1",
  id: "context-1",
  createdAt: "2026-08-26T00:00:00.000Z",
  scope: { kind: "selection" },
  page: { url: "https://example.test/", title: "Delivery adapter check" },
  viewport: { width: 800, height: 600, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
  coordinateSpace: "viewport-css-px",
  regions: [{ left: 10, top: 20, width: 100, height: 80 }],
  visualState: { rulersVisible: false, xrayVisible: false },
  targets: [],
  visualContext: { guides: [], measurements: [], distances: [] },
};
const images = [{
  id: "focus",
  kind: "focus",
  mimeType: "image/png",
  data: "ZmFrZS1wbmc=",
}];
const delivery = {
  context,
  text: "Mesurer adapter payload",
  images,
};

let acpRequest;
const acpSender = createAcpContextSender({
  target: async () => ({ sessionId: "session-current" }),
  prompt: async (request) => { acpRequest = request; },
});
await acpSender(delivery);
assert(acpRequest?.sessionId === "session-current", "ACP sender must resolve the current host session.");
assert(acpRequest?.prompt?.[0]?.type === "text", "ACP sender must begin with Mesurer context text.");
assert(acpRequest?.prompt?.some((block) => block.type === "image" && block.data === images[0].data), "ACP sender must preserve base64 image evidence.");

const codexInput = await toCodexAppServerInput(delivery, async (image) => ({
  type: "localImage",
  path: `/tmp/${image.id}.png`,
}));
assert(codexInput[0]?.type === "text" && codexInput[0].text === delivery.text, "Codex input must preserve the prepared delivery text.");
assert(codexInput[1]?.type === "text" && codexInput[1].text.includes("focus"), "Codex image input must be labeled.");
assert(codexInput[2]?.type === "localImage" && codexInput[2].path === "/tmp/focus.png", "Codex image evidence must use host-materialized input.");

const requests = [];
const idleSender = createCodexAppServerContextSender({
  target: () => ({ threadId: "thread-current" }),
  imageInput: async (image) => ({ type: "localImage", path: `/tmp/${image.id}.png` }),
  request: async (request) => { requests.push(request); },
});
await idleSender(delivery);
assert(requests[0]?.method === "turn/start", "Idle Codex thread must receive a new turn.");
assert(requests[0]?.params.threadId === "thread-current", "Codex sender must target the current host thread.");

const activeSender = createCodexAppServerContextSender({
  target: () => ({ threadId: "thread-current", activeTurnId: "turn-current" }),
  request: async (request) => { requests.push(request); },
});
await activeSender(delivery);
assert(requests[1]?.method === "turn/steer", "Active Codex turn must be steered rather than starting a competing turn.");
assert(requests[1]?.params.expectedTurnId === "turn-current", "Codex steer must pin the host's active turn id.");
assert(requests[1]?.params.input.length === 1, "Codex sender must gracefully fall back to text-only without an image materializer.");

let bridgeDelivery;
const bridge = {
  protocol: MESURER_HOST_BRIDGE_PROTOCOL,
  captureEvidence: async () => images,
  sendContext: async (value) => { bridgeDelivery = value; },
};
assert(isMesurerHostBridge(bridge), "Host bridge guard must accept the versioned capability object.");
assert(!isMesurerHostBridge({ protocol: "mesurer.host/v0" }), "Host bridge guard must reject incompatible protocols.");
const connected = connectContextPluginToHost({}, bridge);
assert(typeof connected.evidenceProvider === "function", "Injected context plugin must inherit host screenshot evidence capability.");
assert(typeof connected.sendContext === "function", "Injected context plugin must inherit host delivery capability.");
assert((await connected.evidenceProvider({ context, plan: { schema: "mesurer.capture/v1", contextId: context.id, chrome: "hide", evidence: "show", captures: [] } }))[0]?.id === "focus", "Host evidence callback must stay callable through the plugin bridge.");
await connected.sendContext(delivery);
assert(bridgeDelivery === delivery, "Host delivery callback must receive the original Mesurer delivery object.");
const override = async () => {};
assert(connectContextPluginToHost({ sendContext: override }, bridge).sendContext === override, "Explicit plugin delivery must override the injected host bridge.");

console.log("Mesurer host delivery adapters: PASS");
