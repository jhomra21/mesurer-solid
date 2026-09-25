import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorPicker } from "../src/components/ColorPicker";
import { createMesurerModel } from "../src/model/create-mesurer-model";
import { createMesurerBuiltinController } from "../src/runtime/builtin-actions";
import { render } from "../src/solid-dom";

const settle = async () => {
  await Promise.resolve();
  flush();
  await Promise.resolve();
  flush();
};

afterEach(async () => {
  Reflect.deleteProperty(window, "__MESURER_HOST__");
  Reflect.deleteProperty(window, "EyeDropper");
  Reflect.deleteProperty(window, "createImageBitmap");
  Reflect.deleteProperty(navigator, "clipboard");
  document.body.replaceChildren();
  vi.restoreAllMocks();
  await settle();
});

describe("native-host Color Picker", () => {
  it("samples the current host window without invoking screen-wide EyeDropper", async () => {
    const hostCapture = vi.fn(async () => new Blob(["png"], { type: "image/png" }));
    const nativeOpen = vi.fn(async () => ({ sRGBHex: "#ffffff" }));
    const bitmap = { width: 400, height: 200, close: vi.fn() };
    const drawImage = vi.fn();
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray([0x12, 0x34, 0x56, 0xff]),
    }));
    const writeText = vi.fn(async () => undefined);

    Object.defineProperty(window, "__MESURER_HOST__", {
      configurable: true,
      value: { captureScreenshot: hostCapture },
    });
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: class {
        open = nativeOpen;
      },
    });
    Object.defineProperty(window, "createImageBitmap", {
      configurable: true,
      value: vi.fn(async () => bitmap),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(200);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(100);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      getImageData,
    } as unknown as CanvasRenderingContext2D);

    const uiRoot = document.createElement("div");
    document.body.append(uiRoot);
    const model = createMesurerModel({ initialEnabled: true });
    model.rendererRoot = uiRoot;
    const controller = createMesurerBuiltinController({
      model,
      ownerWindow: window,
      ownerDocument: document,
      uiRoot: () => uiRoot,
    });

    await controller.run("color-picker");

    expect(model.current.colorPickerActive).toBe(true);
    expect(model.current.colorPickerSample).toBeNull();
    expect(nativeOpen).not.toHaveBeenCalled();

    await controller.pickColorAt({ x: 50, y: 25 });

    expect(hostCapture).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 100, 50, 1, 1, 0, 0, 1, 1);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(model.current.colorPickerSample).toEqual({
      red: 0x12,
      green: 0x34,
      blue: 0x56,
      alpha: 1,
    });
    expect(writeText).toHaveBeenCalledWith("#123456");
    expect(uiRoot.style.display).toBe("");

    controller.dispose();
  });

  it("cancels a local pick on blur without taking a screenshot", async () => {
    const hostCapture = vi.fn(async () => new Blob(["png"], { type: "image/png" }));

    Object.defineProperty(window, "__MESURER_HOST__", {
      configurable: true,
      value: { captureScreenshot: hostCapture },
    });

    const model = createMesurerModel({ initialEnabled: true });
    const controller = createMesurerBuiltinController({
      model,
      ownerWindow: window,
      ownerDocument: document,
    });

    await controller.run("color-picker");
    expect(model.current.colorPickerActive).toBe(true);

    window.dispatchEvent(new Event("blur"));
    await settle();

    expect(model.current.colorPickerActive).toBe(false);
    await controller.pickColorAt({ x: 10, y: 10 });
    expect(hostCapture).not.toHaveBeenCalled();

    controller.dispose();
  });

  it("does not keep an animation-frame loop alive while the picker is idle", async () => {
    const callbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);

      return callbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const model = createMesurerModel({ initialEnabled: true });
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => <ColorPicker model={model} ownerWindow={window} />,
      host,
    );

    await settle();
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    model.setTransient({
      colorPickerActive: true,
      colorPickerSample: { red: 1, green: 2, blue: 3, alpha: 1 },
    });
    await settle();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    const frame = callbacks.shift();
    expect(frame).toBeTruthy();
    frame?.(performance.now());
    await settle();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    dispose();
  });
});
