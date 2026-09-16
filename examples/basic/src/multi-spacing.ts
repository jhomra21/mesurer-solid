import {
  mountMesurer,
  type MountedMesurer,
} from "../../../packages/mesurer/src/index";

type MultiSpacingHarness = {
  mesurer: MountedMesurer;
  moveToolbar(left: number, top: number): void;
};

declare global {
  interface Window {
    __MESURER_MULTI_SPACING_FIXTURE__?: MultiSpacingHarness;
  }
}

const mesurer = mountMesurer({
  target: document.body,
  isolate: false,
  topLayer: false,
  agent: { globalName: "__MESURER_MULTI_SPACING__" },
  persistKey: "mesurer-multi-spacing",
});

await mesurer.ready;

const moveToolbar = (left: number, top: number) => {
  const toolbar = mesurer.element.querySelector<HTMLElement>("[data-mesurer-toolbar='true']");
  if (!toolbar) throw new Error("Mesurer toolbar did not mount.");
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
};

// Keep the toolbar outside the four-card measurement grid. The first-party
// plugin catalog can widen over time; a fixture that relies on the toolbar
// remaining narrower than the gap to card A turns a UI growth into a blocked
// physical click instead of exercising multi-selection spacing.
moveToolbar(52, 160);

const harness: MultiSpacingHarness = {
  mesurer,
  moveToolbar,
};

window.__MESURER_MULTI_SPACING_FIXTURE__ = harness;