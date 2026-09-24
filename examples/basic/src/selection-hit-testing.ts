import { mountMesurer, type MountedMesurer } from "../../../packages/mesurer/src/index";

const key = "mesurer-selection-hit-testing";

const fixtureInitKey = `${key}:fixture-initialized`;

if (!window.sessionStorage.getItem(fixtureInitKey)) {
  window.localStorage.removeItem(key);
  window.sessionStorage.setItem(fixtureInitKey, "true");
}

const canvas = document.querySelector<HTMLCanvasElement>("#canvas-target");

const context = canvas?.getContext("2d");

if (canvas && context) {
  context.fillStyle = "#dbeafe";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#2563eb";
  context.fillRect(48, 42, 160, 84);
}

const closedHost = document.querySelector<HTMLElement>("#closed-shadow-host");

if (closedHost) {
  const shadow = closedHost.attachShadow({ mode: "closed" });
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = "Closed shadow child";
  button.style.cssText = "border:1px solid #94a3b8;border-radius:8px;padding:8px 12px;background:white;color:#0f172a";
  shadow.append(button);
}

const grid = document.querySelector<HTMLElement>("#large-dom-grid");

if (grid) {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < 1000; index += 1) {
    const button = document.createElement("button");

    button.type = "button";
    button.dataset.largeDomTarget = String(index + 1);
    button.textContent = String((index + 1) % 10);
    fragment.append(button);
  }

  grid.append(fragment);
}

const subject = mountMesurer({
  target: document.body,
  isolate: false,
  topLayer: false,
  persistKey: key,
  persistOnReload: true,
  agent: true,
});

await subject.ready;

type SelectionHitTestingHarness = {
  subject: MountedMesurer;
};

declare global {
  interface Window {
    __MESURER_SELECTION_HIT_TESTING__?: SelectionHitTestingHarness;
  }
}

window.__MESURER_SELECTION_HIT_TESTING__ = { subject };
