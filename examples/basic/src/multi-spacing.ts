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

moveToolbar(52, 244);

const harness: MultiSpacingHarness = {
  mesurer,
  moveToolbar,
};

window.__MESURER_MULTI_SPACING_FIXTURE__ = harness;
