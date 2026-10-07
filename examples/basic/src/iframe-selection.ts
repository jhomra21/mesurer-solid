import { mountMesurer } from "../../../packages/mesurer/src/index";

const subject = mountMesurer({
  target: document.body,
  isolate: false,
  persistKey: "mesurer-iframe-selection-contract",
});

await subject.ready;

declare global {
  interface Window {
    __MESURER_IFRAME_TEST__?: {
      subject: typeof subject;
    };
  }
}

window.__MESURER_IFRAME_TEST__ = { subject };
