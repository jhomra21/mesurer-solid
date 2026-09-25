import { mountMesurer } from "mesurer-solid";
import {
  context,
  screenshot,
  type MesurerScreenshotService,
} from "mesurer-solid/plugins";

type ElectronTestSummary = {
  targetCount: number;
  selector: string;
  islandCount: number;
  mime: string;
  copied: boolean;
  downloaded: boolean;
  colorPickerMode: string | null;
  colorPickerValue: string;
  nativeEyeDropperOpens: number;
  colorPickerOverlayRemoved: boolean;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

declare global {
  interface Window {
    electronMesurer: {
      complete(payload: {
        png: Uint8Array;
        summary: ElectronTestSummary;
      }): Promise<void>;
    };
  }
}

const style = document.createElement("style");

style.textContent = `
  html, body { margin: 0; min-height: 100%; background: #111318; color: #f7f7f7; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; }
  #app { padding: 96px; }
  [data-testid="electron-target"] {
    box-sizing: border-box;
    width: 360px;
    min-height: 180px;
    padding: 24px;
    border: 2px solid #4b5563;
    border-radius: 16px;
    background: #20242c;
  }
  [data-testid="electron-color-swatch"] {
    width: 48px;
    height: 48px;
    margin-top: 18px;
    background: #123456;
  }
  h1 { margin: 0 0 12px; font-size: 24px; }
  p { margin: 0; line-height: 1.5; }
`;

document.head.append(style);

let nativeEyeDropperOpens = 0;

Object.defineProperty(window, "EyeDropper", {
  configurable: true,
  value: class {
    async open() {
      nativeEyeDropperOpens += 1;

      return { sRGBHex: "#ffffff" };
    }
  },
});

const waitFor = async <T>(read: () => T | null, timeoutMs = 5000): Promise<T> => {
  const started = performance.now();

  while (performance.now() - started < timeoutMs) {
    const value = read();

    if (value) return value;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  throw new Error("Timed out waiting for the Electron Mesurer contract.");
};

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    context(),
    screenshot({
      copy: false,
      download: false,
    }),
  ],
});

await mesurer.ready;

const island = await waitFor(() => document.querySelector<HTMLElement>("[data-mesurer-island='true']"));

const shadow = island.shadowRoot;

if (!shadow) throw new Error("Mesurer Electron island has no open shadow root.");

const colorButton = await waitFor(() =>
  shadow.querySelector<HTMLButtonElement>('button[aria-label="Color picker (P)"]'),
);

colorButton.click();

const pickerTarget = await waitFor(() =>
  shadow.querySelector<HTMLElement>("[data-mesurer-color-picker-target='true']"),
);

const swatch = document.querySelector<HTMLElement>("[data-testid='electron-color-swatch']");

if (!swatch) throw new Error("Missing Electron color sample target.");

const swatchRect = swatch.getBoundingClientRect();

pickerTarget.dispatchEvent(new PointerEvent("pointerdown", {
  bubbles: true,
  composed: true,
  cancelable: true,
  button: 0,
  clientX: swatchRect.left + swatchRect.width / 2,
  clientY: swatchRect.top + swatchRect.height / 2,
}));

const colorPanel = await waitFor(() => shadow.querySelector<HTMLElement>(".mesurer-color-picker"));

const colorPickerMode = colorPanel.dataset.mesurerColorPickerMode ?? null;

const colorPickerValue = colorPanel.textContent ?? "";

if (colorPickerMode !== "host" || !colorPickerValue.includes("#123456")) {
  throw new Error(`Unexpected Electron Color Picker result: ${JSON.stringify({
    colorPickerMode,
    colorPickerValue,
  })}`);
}

if (nativeEyeDropperOpens !== 0) {
  throw new Error(`Electron host Color Picker invoked native EyeDropper ${nativeEyeDropperOpens} time(s).`);
}

const selection = await mesurer.select('[data-testid="electron-target"]');

const target = selection.targets[0];

if (!target) throw new Error("Mesurer did not select the Electron renderer target.");

const service = await mesurer.service<MesurerScreenshotService>("screenshot");

const capture = await service.capture({
  left: target.inspection.rect.left,
  top: target.inspection.rect.top,
  width: target.inspection.rect.width,
  height: target.inspection.rect.height,
});

const png = new Uint8Array(await capture.blob.arrayBuffer());

await window.electronMesurer.complete({
  png,
  summary: {
    targetCount: selection.targets.length,
    selector: target.inspection.selector,
    islandCount: document.querySelectorAll("[data-mesurer-island='true']").length,
    mime: capture.blob.type,
    copied: capture.copied,
    downloaded: capture.downloaded,
    colorPickerMode,
    colorPickerValue,
    nativeEyeDropperOpens,
    colorPickerOverlayRemoved: shadow.querySelector("[data-mesurer-color-picker-target='true']") === null,
    rect: capture.rect,
  },
});
