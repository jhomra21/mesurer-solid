import { mountMesurer } from "../../../packages/mesurer/src/index";
import { screenshot } from "../../../packages/mesurer/src/plugins";

const subject = mountMesurer({
  target: document.body,
  isolate: true,
  topLayer: false,
  plugins: [screenshot({
    copy: false,
    download: false,
  })],
  persistKey: "mesurer-screenshot-manual",
});

await subject.ready;
