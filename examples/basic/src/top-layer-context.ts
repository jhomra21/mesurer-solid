import { mountMesurer, type MountedMesurer } from "../../../packages/mesurer/src/index";
import { context } from "../../../packages/mesurer/src/plugins";

const subject = mountMesurer({
  target: document.body,
  isolate: false,
  topLayer: true,
  agent: true,
  plugins: [context()],
});

await subject.ready;

type TopLayerContextHarness = {
  subject: MountedMesurer;
};

declare global {
  interface Window {
    __MESURER_TOP_LAYER_CONTEXT_TEST__?: TopLayerContextHarness;
  }
}

window.__MESURER_TOP_LAYER_CONTEXT_TEST__ = { subject };
