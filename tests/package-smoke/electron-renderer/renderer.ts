import { mountMesurer } from "mesurer-solid";
import {
  context,
  createElectronScreenshotCaptureProvider,
  screenshot,
  type MesurerScreenshotService,
} from "mesurer-solid/plugins";

type ElectronCaptureResult = {
  png: Uint8Array;
  width: number;
  height: number;
};

declare global {
  interface Window {
    electronMesurer: {
      captureWindow(): Promise<ElectronCaptureResult>;
      complete(payload: {
        png: Uint8Array;
        summary: Record<string, unknown>;
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
  h1 { margin: 0 0 12px; font-size: 24px; }
  p { margin: 0; line-height: 1.5; }
`;
document.head.append(style);

const captureVisibleTab = createElectronScreenshotCaptureProvider(
  () => window.electronMesurer.captureWindow(),
);

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    context(),
    screenshot({
      captureVisibleTab,
      copy: false,
      download: false,
    }),
  ],
});

await mesurer.ready;

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
    rect: capture.rect,
  },
});
