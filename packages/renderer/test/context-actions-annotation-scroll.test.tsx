import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextActions } from "../src/components/ContextActions";
import { getInspectMeasurement } from "../src/core/dom";
import { createMesurerModel } from "../src/model/create-mesurer-model";
import { createMesurerWorkspaceRuntime } from "../src/runtime/workspace-context";
import { render } from "../src/solid-dom";

const settle = async () => {
  await Promise.resolve();
  flush();
  await Promise.resolve();
  flush();
};

const mounted: Array<() => void> = [];

afterEach(async () => {
  while (mounted.length) mounted.pop()?.();
  await settle();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const mount = () => {
  let scrollY = 0;
  vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);

  const page = document.createElement("div");
  const target = document.createElement("div");
  target.dataset.testid = "annotation-target";
  Object.defineProperty(target, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 80,
      top: 180 - scrollY,
      width: 240,
      height: 72,
      right: 320,
      bottom: 252 - scrollY,
      x: 80,
      y: 180 - scrollY,
      toJSON: () => ({}),
    }),
  });
  page.append(target);

  const host = document.createElement("div");
  document.body.append(page, host);

  class TestResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", TestResizeObserver);

  const model = createMesurerModel({ initialEnabled: true, initialToolMode: "select" });
  const measurement = getInspectMeasurement(target, window);
  model.setSelectedMeasurements([measurement], measurement);
  const runtime = createMesurerWorkspaceRuntime({
    model,
    ownerDocument: document,
    ownerWindow: window,
    pageTarget: page,
    uiRoot: host,
  });
  const dispose = render(() => (
    <ContextActions
      runtime={runtime}
      coordinateSpace="viewport"
      onCopy={async () => undefined}
    />
  ), host);

  mounted.push(() => {
    dispose();
    runtime.dispose();
    model.dispose();
  });

  return {
    host,
    runtime,
    setScrollY(value: number) {
      scrollY = value;
    },
  };
};

const click = (element: Element) => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  flush();
};

describe("ContextActions annotation scroll ownership", () => {
  it("moves saved annotation chrome in the same scroll event and keeps Add Note available", async () => {
    const { host, runtime, setScrollY } = mount();

    runtime.addSelectionAnnotation("Existing note");
    await settle();

    const marker = host.querySelector<HTMLButtonElement>("[data-mesurer-annotation-marker='true']");
    expect(marker).not.toBeNull();
    click(marker!);
    await settle();

    const panel = host.querySelector<HTMLElement>("[data-mesurer-annotation-panel='true']");
    const highlight = host.querySelector<HTMLElement>("[data-mesurer-annotation-target-highlight='true']");
    const addNoteTrigger = host.querySelector<HTMLButtonElement>("[data-mesurer-annotation-trigger='true']");
    expect(panel).not.toBeNull();
    expect(highlight).not.toBeNull();
    expect(addNoteTrigger).not.toBeNull();

    setScrollY(120);
    window.dispatchEvent(new Event("scroll"));

    for (const surface of [marker!, panel!, highlight!]) {
      expect(surface.dataset.mesurerNestedScrollCompensation).toBe("true");
      expect(surface.style.getPropertyValue("--mesurer-nested-scroll-y")).toBe("-120px");
    }

    click(addNoteTrigger!);
    await settle();
    expect(host.querySelector("[data-mesurer-annotation-panel='true']")).toBeNull();

    const composer = host.querySelector<HTMLElement>("[data-mesurer-annotation-composer='true']");
    expect(composer).not.toBeNull();
    const textarea = composer!.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea).not.toBeNull();
    textarea!.value = "Second note";
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    const save = [...composer!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Add note");
    expect(save).not.toBeUndefined();
    click(save!);
    await settle();

    expect(host.querySelector("[data-mesurer-annotation-composer='true']")).toBeNull();
    expect(host.querySelectorAll("[data-mesurer-annotation-marker='true']")).toHaveLength(2);
  });
});
