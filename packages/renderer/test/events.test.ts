import { describe, expect, it, vi } from "vitest";
import {
  getDeepActiveElement,
  isEditableKeyboardEvent,
  isInsideMesurer,
  isMesurerKeyboardEvent,
  isTypingInMesurer,
  isTypingInPage,
  trySetPointerCapture,
} from "../src/core/events";

describe("keyboard ownership", () => {
  it("finds the deeply focused host editor through an open shadow root", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadow.append(input);
    document.body.append(host);
    input.focus();

    expect(getDeepActiveElement(window)).toBe(input);
    expect(isTypingInPage(window)).toBe(true);
    expect(isInsideMesurer(input, window)).toBe(false);
  });

  it("distinguishes Mesurer-owned editable focus inside Shadow DOM", () => {
    const island = document.createElement("div");
    island.dataset.mesurerIsland = "true";
    const shadow = island.attachShadow({ mode: "open" });
    const root = document.createElement("div");
    root.dataset.mesurerRoot = "true";
    const input = document.createElement("input");
    root.append(input);
    shadow.append(root);
    document.body.append(island);
    input.focus();

    let typingInMesurer = false;
    let keyboardEventOwned = false;
    input.addEventListener("keydown", (event) => {
      typingInMesurer = isTypingInMesurer(event, window);
      keyboardEventOwned = isMesurerKeyboardEvent(event, window);
    });
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "s",
      bubbles: true,
      composed: true,
    }));

    expect(getDeepActiveElement(window)).toBe(input);
    expect(isInsideMesurer(input, window)).toBe(true);
    expect(isTypingInPage(window)).toBe(false);
    expect(typingInMesurer).toBe(true);
    expect(keyboardEventOwned).toBe(true);
  });

  it("leaves normal typing to editable owners but lets Escape reach lifecycle handling", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    let normalTypingBlocked = false;
    let escapeBlocked = true;
    input.addEventListener("keydown", (event) => {
      if (event.key === "s") normalTypingBlocked = isEditableKeyboardEvent(event, window);
      if (event.key === "Escape") escapeBlocked = isEditableKeyboardEvent(event, window);
    });

    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "s",
      bubbles: true,
      composed: true,
    }));
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      composed: true,
    }));

    expect(normalTypingBlocked).toBe(true);
    expect(escapeBlocked).toBe(false);
  });
});

describe("pointer capture guards", () => {
  it("treats expected owner-realm pointer races as unavailable", () => {
    const target = {
      ownerDocument: document,
      setPointerCapture: vi.fn(() => {
        throw new window.DOMException("No active pointer", "NotFoundError");
      }),
    };

    expect(trySetPointerCapture(target, 1)).toBe(false);
    expect(target.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("rethrows unexpected pointer-capture failures", () => {
    const failure = new Error("unexpected capture failure");
    const target = {
      ownerDocument: document,
      setPointerCapture: vi.fn(() => { throw failure; }),
    };

    expect(() => trySetPointerCapture(target, 1)).toThrow(failure);
  });

  it("reports unsupported pointer capture without throwing", () => {
    expect(trySetPointerCapture({ ownerDocument: document }, 1)).toBe(false);
  });
});
