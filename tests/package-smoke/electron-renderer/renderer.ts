import { mountMesurer } from "mesurer-solid";
import {
  context,
  MESURER_RECORDING_SERVICE_ID,
  recording,
  screenshot,
  type MesurerRecordingService,
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
  codexBridgeOk: boolean;
  codexRuntimeSource: string;
  codexRuntimeTransport: string;
  recordingStatus: string;
  recordingDuration: number;
  recordingWidth: number;
  recordingHeight: number;
  recordingMime: string;
  recordingBytes: number;
  recordingInteractionClicks: number;
  toolbarInitialRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  toolbarDraggedRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
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
      fail(message: string): Promise<void>;
      complete(payload: {
        png: Uint8Array;
        recording: Uint8Array;
        summary: ElectronTestSummary;
      }): Promise<void>;
      dragToolbar(payload: {
        start: { x: number; y: number };
        end: { x: number; y: number };
      }): Promise<void>;
      clickAt(payload: { x: number; y: number }): Promise<void>;
    };
  }
}

window.addEventListener("error", (event) => {
  void window.electronMesurer.fail(
    event.error instanceof Error
      ? event.error.stack ?? event.error.message
      : event.message,
  );
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  void window.electronMesurer.fail(
    reason instanceof Error
      ? reason.stack ?? reason.message
      : String(reason),
  );
});

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
  [data-testid="electron-recording-action"] {
    display: block;
    margin-top: 18px;
    padding: 8px 12px;
    border: 1px solid #64748b;
    border-radius: 8px;
    background: #303744;
    color: #f7f7f7;
    font: inherit;
    cursor: pointer;
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

const codexBridge = window.__MESURER_HOST__?.codexBridge;

if (!codexBridge) {
  throw new Error("Electron preload did not expose Mesurer's Codex Bridge host capability.");
}

const codexRuntime = await codexBridge({ action: "runtime" });

if (codexRuntime.ok !== true || !codexRuntime.runtime) {
  throw new Error(`Electron Codex Bridge runtime request failed: ${JSON.stringify(codexRuntime)}`);
}

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    context(),
    screenshot({
      copy: false,
      download: false,
    }),
    recording({
      frameRate: 12,
      maxDurationSeconds: 5,
      quality: "low",
    }),
  ],
});

await mesurer.ready;

const island = await waitFor(() => document.querySelector<HTMLElement>("[data-mesurer-island='true']"));

const shadow = island.shadowRoot;

if (!shadow) throw new Error("Mesurer Electron island has no open shadow root.");

const toolbar = await waitFor(() =>
  shadow.querySelector<HTMLElement>("[data-mesurer-toolbar='true']"),
);

const toolbarInitialBounds = toolbar.getBoundingClientRect();

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

const recordingService = await mesurer.service<MesurerRecordingService>(
  MESURER_RECORDING_SERVICE_ID,
);

const recordingAction = document.querySelector<HTMLButtonElement>(
  "[data-testid='electron-recording-action']",
);

if (!recordingAction) throw new Error("Missing Electron recording interaction target.");

let recordingInteractionClicks = 0;

recordingAction.addEventListener("click", () => {
  recordingInteractionClicks += 1;
});

await recordingService.start({
  left: target.inspection.rect.left,
  top: target.inspection.rect.top,
  width: target.inspection.rect.width,
  height: target.inspection.rect.height,
});

await waitFor(() =>
  recordingService.snapshot().status === "recording"
    ? recordingService.snapshot()
    : null,
);

const recordingActionRect = recordingAction.getBoundingClientRect();

await window.electronMesurer.clickAt({
  x: recordingActionRect.left + recordingActionRect.width / 2,
  y: recordingActionRect.top + recordingActionRect.height / 2,
});

if (recordingInteractionClicks !== 1) {
  throw new Error(
    `Electron host UI did not receive native input while Recording was active: ${recordingInteractionClicks}`,
  );
}

const targetElement = document.querySelector<HTMLElement>("[data-testid='electron-target']");

if (!targetElement) throw new Error("Missing Electron recording target.");

targetElement.style.transform = "translateX(12px)";

targetElement.style.background = "#273449";

await new Promise((resolve) => setTimeout(resolve, 450));

targetElement.style.transform = "translateX(0)";

targetElement.style.background = "#20242c";

await new Promise((resolve) => setTimeout(resolve, 250));

await recordingService.stop();

const recordingResult = await recordingService.export({ format: "webm" });

const recordingBytes = new Uint8Array(await recordingResult.blob.arrayBuffer());

const recordingSnapshot = recordingService.snapshot();

await window.electronMesurer.dragToolbar({
  start: {
    x: toolbarInitialBounds.left + 20,
    y: toolbarInitialBounds.top + 20,
  },
  end: {
    x: toolbarInitialBounds.left + 20,
    y: 8,
  },
});

await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const toolbarDraggedBounds = toolbar.getBoundingClientRect();

await window.electronMesurer.complete({
  png,
  recording: recordingBytes,
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
    codexBridgeOk: true,
    codexRuntimeSource: codexRuntime.runtime.source,
    codexRuntimeTransport: codexRuntime.runtime.transport,
    recordingStatus: recordingSnapshot.status,
    recordingDuration: recordingResult.duration,
    recordingWidth: recordingResult.width,
    recordingHeight: recordingResult.height,
    recordingMime: recordingResult.blob.type,
    recordingBytes: recordingBytes.byteLength,
    recordingInteractionClicks,
    toolbarInitialRect: {
      left: toolbarInitialBounds.left,
      top: toolbarInitialBounds.top,
      width: toolbarInitialBounds.width,
      height: toolbarInitialBounds.height,
    },
    toolbarDraggedRect: {
      left: toolbarDraggedBounds.left,
      top: toolbarDraggedBounds.top,
      width: toolbarDraggedBounds.width,
      height: toolbarDraggedBounds.height,
    },
    rect: capture.rect,
  },
});
