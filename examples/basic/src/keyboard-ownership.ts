import { mountMesurer } from "../../../packages/mesurer/src/index";

// Variants are query flags:
//   capture   window-capture listener (registered before mount) that cancels and stops every key
//   docblock  document-capture listener (registered before mount) that cancels and stops every key
//   doc       document listeners (bubble and capture) that record keys
//   prompt    chat-style prompt that takes focus back on blur
//   wrap      another library wraps focus() and preventDefault() after Mesurer mounted
//   shadow=closed mounts Mesurer with a closed ShadowRoot.
const params = new URL(window.location.href).searchParams;

const cover = document.getElementById("cover")!;

cover.textContent = Array.from({ length: 120 }, () => "Host text that Typography could inspect underneath Mesurer controls.").join(" ");

const docKeys: string[] = [];

const docCaptureKeys: string[] = [];

const hostCancels: { type: string; key: string; targetId: string; prevented: boolean }[] = [];

const state = { hostBlurs: 0 };

const targetId = (event: Event) => {
  const target = event.composedPath()[0];

  return target instanceof Element ? target.id || target.tagName : "";
};

const cancelEverything = (event: Event) => {
  event.preventDefault();
  hostCancels.push({
    type: event.type,
    key: event instanceof KeyboardEvent ? event.key : "",
    targetId: targetId(event),
    prevented: event.defaultPrevented,
  });
  event.stopPropagation();
  event.stopImmediatePropagation();
};

if (params.has("capture")) {
  // Hostile boot-time listener: registered before Mesurer mounts, so it always runs first on window.
  for (const type of ["keydown", "keypress", "keyup"]) window.addEventListener(type, cancelEverything, true);
}

if (params.has("hostcancel")) {
  // A host that cancels Enter on its own field; Mesurer must leave that cancellation alone.
  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && targetId(event) === "host-last") cancelEverything(event);
  }, true);
}

if (params.has("docblock")) {
  for (const type of ["keydown", "keypress", "keyup"]) document.addEventListener(type, cancelEverything, true);
}

if (params.has("doc")) {
  document.addEventListener("keydown", (event) => { docKeys.push(event.key); });
  // Capture-phase document observers run before the event can reach any Mesurer node, so they still see Mesurer keys.
  document.addEventListener("keydown", (event) => { docCaptureKeys.push(event.key); }, true);
}

const hostPrompt = document.querySelector<HTMLTextAreaElement>("#host-prompt")!;

if (params.has("prompt")) {
  // Chat-style prompt that takes focus back whenever anything else receives it.
  hostPrompt.addEventListener("blur", () => hostPrompt.focus());
  hostPrompt.focus();
} else {
  hostPrompt.addEventListener("blur", () => { state.hostBlurs += 1; });
}

// A host control whose key handler moves focus, the way dialogs and comboboxes do.
document.getElementById("host-mover")!.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("host-last")!.focus();
});

document.getElementById("host-closed")!.attachShadow({ mode: "closed" }).innerHTML = "<input id='closed-input' aria-label='Closed host input' style='width:100%;box-sizing:border-box;padding:6px' />";

const mountOptions = {
  target: document.body,
  isolate: true,
  topLayer: false,
  shadowMode: params.get("shadow") === "closed" ? "closed" : "open",
  agent: true,
} as const;

let mounted = mountMesurer(mountOptions);

await mounted.ready;

if (params.has("wrap")) {
  const focus = HTMLElement.prototype.focus;
  const preventDefault = Event.prototype.preventDefault;

  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) { return focus.call(this, options); };

  Event.prototype.preventDefault = function (this: Event) { return preventDefault.call(this); };
}

declare global {
  interface Window {
    __KB__?: {
      docKeys: string[];
      docCaptureKeys: string[];
      hostCancels: typeof hostCancels;
      state: typeof state;
      dispose: () => void;
      remount: () => Promise<void>;
    };
  }
}

window.__KB__ = {
  docKeys,
  docCaptureKeys,
  hostCancels,
  state,
  dispose: () => mounted.dispose(),
  remount: async () => {
    mounted = mountMesurer(mountOptions);
    await mounted.ready;
  },
};
