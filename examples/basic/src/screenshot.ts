import {
  mountMesurer,
} from "../../../packages/mesurer/src/index";
import {
  screenshotPlugin,
} from "../../../packages/renderer/src/plugins/screenshot";

const subject = mountMesurer({
  target: document.body,
  isolate: true,
  topLayer: false,
  plugins: [screenshotPlugin({
    copy: false,
    download: false,
  })],
  persistKey: "mesurer-screenshot-manual",
});

await subject.ready;
