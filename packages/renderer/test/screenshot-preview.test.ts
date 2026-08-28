import { afterEach, describe, expect, it, vi } from "vitest";
import { createScreenshotPreviewController } from "../src/plugins/screenshot-preview";

afterEach(() => {
  document.body.replaceChildren();
});

describe("screenshot preview", () => {
  it("keeps the dismiss control optically centered and background-independent", () => {
    const rendererRoot = document.createElement("div");
    rendererRoot.dataset.mesurerRoot = "true";
    const root = document.createElement("div");
    rendererRoot.append(root);
    document.body.append(rendererRoot);

    const controller = createScreenshotPreviewController({
      ownerDocument: document,
      ownerWindow: window,
      root,
      previewDurationMs: 0,
    });

    const preview = document.querySelector<HTMLElement>("[data-mesurer-screenshot-preview='true']");
    const dismiss = document.querySelector<HTMLButtonElement>("[data-mesurer-screenshot-preview-dismiss='true']");
    const icon = dismiss?.querySelector("svg");
    expect(preview?.style.boxSizing).toBe("border-box");
    expect(dismiss?.style.top).toBe("8px");
    expect(dismiss?.style.right).toBe("8px");
    expect(dismiss?.style.width).toBe("20px");
    expect(dismiss?.style.height).toBe("20px");
    expect(dismiss?.style.display).toBe("flex");
    expect(dismiss?.style.backgroundColor).toBe("rgb(48, 51, 64)");
    expect(dismiss?.style.border).toBe("0px");
    expect(icon?.getAttribute("viewBox")).toBe("0 0 16 16");

    controller.dispose();
  });

  it("places a new preview in the bottom-right corner", () => {
    const rendererRoot = document.createElement("div");
    rendererRoot.dataset.mesurerRoot = "true";
    const root = document.createElement("div");
    rendererRoot.append(root);
    document.body.append(rendererRoot);

    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const controller = createScreenshotPreviewController({
      ownerDocument: document,
      ownerWindow: window,
      root,
      previewDurationMs: 0,
    });

    controller.show(new Blob(["png"]), {
      copied: false,
      downloaded: false,
      copyFailed: false,
      downloadFailed: false,
    });

    const preview = document.querySelector<HTMLElement>("[data-mesurer-screenshot-preview='true']");
    expect(preview?.style.left).toBe(`${window.innerWidth - 144 - 8}px`);
    expect(preview?.style.top).toBe(`${window.innerHeight - 96 - 8}px`);

    controller.dispose();
    createObjectUrl.mockRestore();
  });
});
