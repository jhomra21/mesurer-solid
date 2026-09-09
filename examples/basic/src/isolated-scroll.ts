import { mountMesurer, type MountedMesurer } from "../../../packages/mesurer/src/index";
import { arrangePlugin } from "../../../packages/renderer/src/plugins/arrange";

const subject = mountMesurer({
  target: document.body,
  isolate: true,
  topLayer: true,
  plugins: [arrangePlugin()],
});

await subject.ready;

type IsolatedScrollHarness = {
  subject: MountedMesurer;
};

declare global {
  interface Window {
    __MESURER_ISOLATED_SCROLL_TEST__?: IsolatedScrollHarness;
  }
}

window.__MESURER_ISOLATED_SCROLL_TEST__ = { subject };
