import { mountMesurer } from "mesurer-solid";
import {
  context,
  edit,
  MESURER_RECORDING_SERVICE_ID,
  recording,
  screenshot,
  type MesurerRecordingService,
  type MesurerScreenshotService,
} from "mesurer-solid/plugins";

type ElectronTestSummary = {
  targetCount: number;
  totalSelectedTargets: number;
  selector: string;
  islandCount: number;
  mime: string;
  copied: boolean;
  downloaded: boolean;
  colorPickerMode: string | null;
  colorPickerValue: string;
  nativeEyeDropperOpens: number;
  colorPickerOverlayRemoved: boolean;
  electronTextEditIntent: string;
  electronTextDoubleClicks: number;
  electronMotionPaused: boolean;
  electronMotionDetails: boolean;
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
  recordingAutoHost: boolean;
  recordingFrameRateDefault: number;
  recordingFrameRateSelected: number;
  recordingSelectModeActive: boolean;
  recordingInteractionOverlayPointerEvents: string;
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
    __MESURER_RECORDING_HOST__?: {
      captureRecordingStream?: () => Promise<{ streamId: string }>;
    };
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
      doubleClickAt(payload: { x: number; y: number }): Promise<void>;
      pressKey(key: "Enter" | "Escape"): Promise<void>;
      typeText(value: string): Promise<void>;
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
  [data-testid="electron-edit-copy"] {
    margin-top: 12px;
    font-size: 16px;
  }
  [data-testid="electron-motion-target"] {
    margin-top: 14px;
    width: 100px;
    height: 32px;
    background: #5eead4;
    animation: mesurer-electron-motion 2s linear infinite alternate;
  }
  @keyframes mesurer-electron-motion {
    from { opacity: 0.5; transform: translateX(0); }
    to { opacity: 1; transform: translateX(5px); }
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

const electronInputTrace: Array<{ type: string; target: string; detail: number }> = [];

let acceptanceStage = "initialization";

type HitStackRect = { x: number; y: number; width: number; height: number };

type ElectronHitStack = {
  textPoint: { x: number; y: number };
  textBounds: HitStackRect;
  toolbarBounds: HitStackRect;
  hits: Array<{
    tag: string;
    role: string | null;
    testId: string | null;
    inspector: string | null;
    className: string | undefined;
    pointerEvents: string;
  }>;
};

let acceptanceHitStack: ElectronHitStack | null = null;

for (const type of ["pointerdown", "click", "dblclick", "keydown"]) {
  window.addEventListener(type, (event) => {
    const target = event.target instanceof Element
      ? event.target.getAttribute("data-testid") ?? event.target.tagName.toLowerCase()
      : "unknown";

    electronInputTrace.push({
      type,
      target,
      detail: event instanceof MouseEvent ? event.detail : 0,
    });

    if (electronInputTrace.length > 40) electronInputTrace.shift();
  }, true);
}

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

  throw new Error(`Timed out during ${acceptanceStage}: ${JSON.stringify({
    hitStack: acceptanceHitStack,
    inputTrace: electronInputTrace,
  })}`);
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
    edit(),
    screenshot({
      copy: false,
      download: false,
    }),
    recording({
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

// Use the exact installed npm artifact and real Electron input. A DOM-dispatched
// dblclick is insufficient because it bypasses Chromium's pointer ownership.
colorButton.click();

const editButton = await waitFor(() =>
  shadow.querySelector<HTMLButtonElement>('button[data-mesurer-tool-id="arrange"]'),
);

const centerOf = (element: Element) => {
  const rect = element.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

acceptanceStage = "activate native Edit mode";

await window.electronMesurer.clickAt(centerOf(editButton));

await waitFor(() => toolbar.getAttribute("data-mesurer-toolbar-mode") === "edit" ? true : null);

const textTarget = document.querySelector<HTMLElement>('[data-testid="electron-edit-copy"]');

if (!textTarget || textTarget.childNodes.length !== 1) {
  throw new Error("Electron text fixture must contain exactly one direct text run.");
}

const textPoint = centerOf(textTarget);

const textBounds = textTarget.getBoundingClientRect();

acceptanceHitStack = {
  textPoint,
  textBounds: {
    x: textBounds.x, y: textBounds.y, width: textBounds.width, height: textBounds.height,
  },
  toolbarBounds: {
    x: toolbar.getBoundingClientRect().x,
    y: toolbar.getBoundingClientRect().y,
    width: toolbar.getBoundingClientRect().width,
    height: toolbar.getBoundingClientRect().height,
  },
  hits: document.elementsFromPoint(textPoint.x, textPoint.y).slice(0, 10).map((element) => ({
    tag: element.tagName,
    role: element.getAttribute("role"),
    testId: element.getAttribute("data-testid"),
    inspector: element.getAttribute("data-mesurer-inspector-ui"),
    className: element.getAttribute("class")?.slice(0, 180),
    pointerEvents: getComputedStyle(element).pointerEvents,
  })),
};

acceptanceStage = "select editable text with native click";

await window.electronMesurer.clickAt(textPoint);

await waitFor(() =>
  shadow.querySelector("[data-mesurer-arrange-box='true']")
    ?? document.querySelector("[data-mesurer-arrange-box='true']"),
);

acceptanceStage = "open direct editor with native double-click";

await window.electronMesurer.doubleClickAt(textPoint);

let editor: HTMLTextAreaElement;

try {
  editor = await waitFor(() =>
    document.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']")
      ?? shadow.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']"),
    4000,
  );
} catch (error) {
  throw new Error(`Native Electron Edit double-click did not open the editor: ${JSON.stringify({
    toolbarMode: toolbar.getAttribute("data-mesurer-toolbar-mode"),
    textPoint,
    hits: document.elementsFromPoint(textPoint.x, textPoint.y)
      .slice(0, 7).map((element) => ({
        tag: element.tagName,
        name: element.getAttribute("data-testid"),
        inspector: element.getAttribute("data-mesurer-inspector-ui"),
      })),
    inputTrace: electronInputTrace,
  })}`, { cause: error });
}

const editorRoot = editor.getRootNode();

const editorFocus = editorRoot instanceof ShadowRoot
  ? editorRoot.activeElement
  : document.activeElement;

if (editorFocus !== editor) {
  throw new Error(`Electron editor opened without keyboard focus: ${JSON.stringify(electronInputTrace)}`);
}

acceptanceStage = "type through native focused Electron textarea";

await window.electronMesurer.typeText("Edited in Electron");

await waitFor(() => editor.value === "Edited in Electron" ? true : null);

await window.electronMesurer.pressKey("Enter");

await waitFor(() => !document.querySelector("[data-mesurer-text-editor='true']")
  && !shadow.querySelector("[data-mesurer-text-editor='true']") ? true : null);

const textEdits = await (async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const edits = await mesurer.textEdits();

    if (edits.some((item) => item.desired === "Edited in Electron")) return edits;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  throw new Error(`Electron text edit did not persist its Desired intent: ${JSON.stringify(electronInputTrace)}`);
})();

const electronTextEditIntent = textEdits.find((item) => item.desired === "Edited in Electron")?.desired ?? "";

const electronTextDoubleClicks = electronInputTrace.filter((event) =>
  event.type === "dblclick" && event.detail === 2).length;

if (!electronTextDoubleClicks) {
  throw new Error(`Electron never dispatched a native dblclick to the text target: ${JSON.stringify(electronInputTrace)}`);
}

const selectModeButton = await waitFor(() =>
  shadow.querySelector<HTMLButtonElement>('button[data-mesurer-toolbar-mode="select"]'),
);

const modeButtonPoint = centerOf(selectModeButton);
const modeButtonRect = selectModeButton.getBoundingClientRect();

acceptanceHitStack = {
  textPoint: modeButtonPoint,
  textBounds: {
    x: modeButtonRect.x,
    y: modeButtonRect.y,
    width: modeButtonRect.width,
    height: modeButtonRect.height,
  },
  toolbarBounds: {
    x: toolbar.getBoundingClientRect().x,
    y: toolbar.getBoundingClientRect().y,
    width: toolbar.getBoundingClientRect().width,
    height: toolbar.getBoundingClientRect().height,
  },
  hits: [
    ...document.elementsFromPoint(modeButtonPoint.x, modeButtonPoint.y),
    ...[shadow.elementFromPoint(modeButtonPoint.x, modeButtonPoint.y)].filter((element): element is Element => Boolean(element)),
  ].slice(0, 10).map((element) => ({
    tag: element.tagName,
    role: element.getAttribute("role"),
    testId: element.getAttribute("data-testid"),
    inspector: element.getAttribute("data-mesurer-inspector-ui"),
    className: element.getAttribute("class")?.slice(0, 180),
    pointerEvents: getComputedStyle(element).pointerEvents,
  })),
};

acceptanceStage = "return to Select from Edit";

await window.electronMesurer.clickAt(modeButtonPoint);

await waitFor(() => toolbar.getAttribute("data-mesurer-toolbar-mode") === "select" ? true : null);

const selectForMotionButton = await waitFor(() =>
  shadow.querySelector<HTMLButtonElement>("[data-mesurer-builtin='select'] button"),
);

if (selectForMotionButton.getAttribute("aria-pressed") !== "true") {
  await window.electronMesurer.clickAt(centerOf(selectForMotionButton));
}

await waitFor(() => selectForMotionButton.getAttribute("aria-pressed") === "true" ? true : null);

const animatedTarget = document.querySelector<HTMLElement>('[data-testid="electron-motion-target"]');

if (!animatedTarget || !animatedTarget.getAnimations().length) {
  throw new Error("Electron Motion fixture must have a real running CSS animation.");
}

acceptanceStage = "select a real CSS animation";

await window.electronMesurer.clickAt(centerOf(animatedTarget));

const motionPlayer = await waitFor(() =>
  shadow.querySelector<HTMLElement>('[data-mesurer-motion-player="true"]'),
);

const motionPlay = await waitFor(() =>
  motionPlayer.querySelector<HTMLButtonElement>('[data-mesurer-motion-play="true"]'),
);

acceptanceStage = "pause CSS motion through built-in inspector";

await window.electronMesurer.clickAt(centerOf(motionPlay));

await waitFor(() =>
  animatedTarget.getAnimations()[0]?.playState === "paused" ? true : null,
);

const inspectButton = await waitFor(() =>
  motionPlayer.querySelector<HTMLButtonElement>('[data-mesurer-motion-inspect="true"]'),
);

acceptanceStage = "inspect CSS keyframes through Motion details";

await window.electronMesurer.clickAt(centerOf(inspectButton));

const electronMotionDetails = Boolean(await waitFor(() =>
  motionPlayer.querySelector<HTMLElement>('[data-mesurer-motion-details="true"]')
    ?.textContent?.includes("mesurer-electron-motion") ? true : null,
));

const electronMotionPaused = animatedTarget.getAnimations()[0]?.playState === "paused";

acceptanceStage = "existing screenshot and Recording smoke";

const selection = await mesurer.select('[data-testid="electron-target"]');

const matchingTargets = selection.targets.filter((item) =>
  item.inspection.selector === '[data-testid="electron-target"]');

if (matchingTargets.length !== 1) {
  throw new Error(`Mesurer did not resolve the one requested Electron target: ${JSON.stringify(selection.targets.map((item) => item.inspection.selector))}`);
}

const target = matchingTargets[0];

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

const recordingAutoHost = Boolean(
  window.__MESURER_RECORDING_HOST__?.captureRecordingStream,
);

const recordingFrameRateDefault = recordingService.settings().frameRate;

if (recordingFrameRateDefault !== 60) {
  throw new Error(`Recording default frame rate must be 60 fps, got ${recordingFrameRateDefault}`);
}

recordingService.setSettings({ frameRate: 120 });

const recordingFrameRateSelected = recordingService.settings().frameRate;

if (recordingFrameRateSelected !== 120) {
  throw new Error(`Recording 120 fps setting did not apply, got ${recordingFrameRateSelected}`);
}

if (!recordingAutoHost) {
  throw new Error(
    "mesurer-solid/electron did not install its package-owned Recording preload.",
  );
}

const recordingAction = document.querySelector<HTMLButtonElement>(
  "[data-testid='electron-recording-action']",
);

if (!recordingAction) throw new Error("Missing Electron recording interaction target.");

let recordingInteractionClicks = 0;

recordingAction.addEventListener("click", () => {
  recordingInteractionClicks += 1;
});

const selectButton = await waitFor(() =>
  shadow.querySelector<HTMLButtonElement>('button[aria-label="Select (S)"]'),
);

if (selectButton.getAttribute("aria-pressed") !== "true") {
  selectButton.click();
}

await waitFor(() =>
  selectButton.getAttribute("aria-pressed") === "true"
    ? selectButton
    : null,
);

const recordingSelectModeActive = selectButton.getAttribute("aria-pressed") === "true";

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

const interactionOverlay = await waitFor(() =>
  shadow.querySelector<HTMLElement>("[data-mesurer-interaction-overlay='true']"),
);

const recordingInteractionOverlayPointerEvents = getComputedStyle(interactionOverlay).pointerEvents;

if (recordingInteractionOverlayPointerEvents !== "none") {
  throw new Error(
    `Select interaction overlay blocks the host while Recording is active: pointer-events=${recordingInteractionOverlayPointerEvents}`,
  );
}

const recordingActionRect = recordingAction.getBoundingClientRect();

const recordingActionPoint = {
  x: recordingActionRect.left + recordingActionRect.width / 2,
  y: recordingActionRect.top + recordingActionRect.height / 2,
};

const recordingInputTrace: Array<{
  type: string;
  target: string | null;
  path: string[];
}> = [];

const describeInputNode = (node: EventTarget | null) => {
  if (!(node instanceof Element)) return null;

  return [
    node.tagName.toLowerCase(),
    node.getAttribute("data-testid"),
    node.getAttribute("data-mesurer-island"),
    node.getAttribute("data-mesurer-root"),
    node.getAttribute("data-mesurer-recording"),
  ].filter(Boolean).join(":");
};

const traceRecordingInput = (event: Event) => {
  recordingInputTrace.push({
    type: event.type,
    target: describeInputNode(event.target),
    path: event.composedPath().slice(0, 8)
      .map((node) => describeInputNode(node))
      .filter((value): value is string => Boolean(value)),
  });
};

document.addEventListener("pointerdown", traceRecordingInput, true);

document.addEventListener("mousedown", traceRecordingInput, true);

document.addEventListener("click", traceRecordingInput, true);

const recordingHitStack = document.elementsFromPoint(
  recordingActionPoint.x,
  recordingActionPoint.y,
).map((element) => ({
  tag: element.tagName,
  className: element.getAttribute("class"),
  testId: element.getAttribute("data-testid"),
  mesurerRoot: element.getAttribute("data-mesurer-root"),
  inspectorUi: element.getAttribute("data-mesurer-inspector-ui"),
  measurement: element.getAttribute("data-mesurer-measurement"),
  measurementChrome: element.getAttribute("data-mesurer-measurement-chrome"),
  selectedMeasurement: element.getAttribute("data-mesurer-selected-measurement"),
  annotationTrigger: element.getAttribute("data-mesurer-annotation-trigger"),
  recording: element.getAttribute("data-mesurer-recording"),
  recordingSelect: element.getAttribute("data-mesurer-recording-select"),
  pointerEvents: getComputedStyle(element).pointerEvents,
  html: element.outerHTML.slice(0, 320),
}));

await window.electronMesurer.clickAt(recordingActionPoint);

document.removeEventListener("pointerdown", traceRecordingInput, true);

document.removeEventListener("mousedown", traceRecordingInput, true);

document.removeEventListener("click", traceRecordingInput, true);

if (recordingInteractionClicks !== 1) {
  throw new Error(
    `Electron host UI did not receive native input while Recording was active: ${JSON.stringify({
      recordingInteractionClicks,
      recordingHitStack,
      recordingInputTrace,
    })}`,
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
    targetCount: matchingTargets.length,
    totalSelectedTargets: selection.targets.length,
    selector: target.inspection.selector,
    islandCount: document.querySelectorAll("[data-mesurer-island='true']").length,
    mime: capture.blob.type,
    copied: capture.copied,
    downloaded: capture.downloaded,
    colorPickerMode,
    colorPickerValue,
    nativeEyeDropperOpens,
    colorPickerOverlayRemoved: shadow.querySelector("[data-mesurer-color-picker-target='true']") === null,
    electronTextEditIntent,
    electronTextDoubleClicks,
    electronMotionPaused,
    electronMotionDetails,
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
    recordingAutoHost,
    recordingFrameRateDefault,
    recordingFrameRateSelected,
    recordingSelectModeActive,
    recordingInteractionOverlayPointerEvents,
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
