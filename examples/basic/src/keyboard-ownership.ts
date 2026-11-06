import { mountMesurer } from "../../../packages/mesurer/src/index";

// Variants are query flags: capture, prompt, doc. shadow=closed mounts Mesurer with a closed ShadowRoot.
const params = new URL(window.location.href).searchParams;

const cover = document.getElementById("cover")!;

cover.textContent = Array.from({ length: 120 }, () => "Host text that Typography could inspect underneath Mesurer controls.").join(" ");

const docKeys: string[] = [];

if (params.has("capture")) {
  // Hostile boot-time listener: registered before Mesurer mounts, so it always runs first on window.
  for (const type of ["keydown", "keypress", "keyup"]) {
    window.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }
}

if (params.has("doc")) {
  document.addEventListener("keydown", (event) => { docKeys.push(event.key); });
}

if (params.has("prompt")) {
  const prompt = document.querySelector<HTMLTextAreaElement>("#host-prompt")!;
  // Chat-style prompt that takes focus back whenever anything else receives it.
  prompt.addEventListener("blur", () => prompt.focus());
  prompt.focus();
}

document.getElementById("host-closed")!.attachShadow({ mode: "closed" }).innerHTML = "<input id='closed-input' aria-label='Closed host input' style='width:100%;box-sizing:border-box;padding:6px' />";

const mounted = mountMesurer({
  target: document.body,
  isolate: true,
  topLayer: false,
  shadowMode: params.get("shadow") === "closed" ? "closed" : "open",
  agent: true,
});

await mounted.ready;

declare global {
  interface Window {
    __KB__?: { docKeys: string[] };
  }
}

window.__KB__ = { docKeys };
