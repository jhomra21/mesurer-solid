import {
  contextPlugin,
  mountMeasurer,
  type MountedMeasurer,
} from "../../../packages/mesurer/src/index";

type SelfHostingHarness = {
  subject: MountedMeasurer;
  observer: MountedMeasurer | null;
  mountObserver(): Promise<MountedMeasurer>;
  moveToolbar(instance: MountedMeasurer, left: number, top: number): void;
  setReport(lines: string[]): void;
};

declare global {
  interface Window {
    __MESURER_SELF_HOSTING__?: SelfHostingHarness;
  }
}

const moveToolbar = (instance: MountedMeasurer, left: number, top: number) => {
  const toolbar = instance.element.querySelector<HTMLElement>("[data-mesurer-toolbar='true']");
  if (!toolbar) throw new Error("Mesurer toolbar did not mount.");
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
};

const subject = mountMeasurer({
  target: document.body,
  isolate: false,
  topLayer: false,
  agent: { globalName: "__MESURER_SUBJECT__" },
  plugins: [
    contextPlugin({
      sendLabel: "Send to agent",
      sendContext: async () => undefined,
    }),
  ],
  persistKey: "mesurer-self-host-subject",
});

await subject.ready;
moveToolbar(subject, 72, 240);

let observer: MountedMeasurer | null = null;

const setReport = (lines: string[]) => {
  document.querySelector("[data-self-host-report]")?.remove();
  const report = document.createElement("aside");
  report.className = "self-host-report";
  report.dataset.selfHostReport = "true";
  const title = document.createElement("strong");
  title.textContent = "Mesurer numeric verification";
  report.append(title);
  for (const line of lines) {
    const row = document.createElement("div");
    const code = document.createElement("code");
    code.textContent = line;
    row.append(code);
    report.append(row);
  }
  document.body.append(report);
};

const harness: SelfHostingHarness = {
  subject,
  observer,
  moveToolbar,
  setReport,
  async mountObserver() {
    if (observer) return observer;
    observer = mountMeasurer({
      target: document.body,
      isolate: false,
      topLayer: false,
      agent: {
        globalName: "__MESURER_OBSERVER__",
        root: subject.element,
      },
      persistKey: "mesurer-self-host-observer",
    });
    await observer.ready;
    moveToolbar(observer, 72, 390);
    harness.observer = observer;
    return observer;
  },
};

window.__MESURER_SELF_HOSTING__ = harness;
