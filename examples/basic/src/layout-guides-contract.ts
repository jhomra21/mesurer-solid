import {
  mountMesurer,
  type MountedMesurer,
} from "../../../packages/mesurer/src/index";
import {
  context,
  layoutGuides,
  MESURER_LAYOUT_GUIDES_SERVICE_ID,
  type MesurerLayoutGuidesService,
} from "../../../packages/mesurer/src/plugins";

const url = new URL(window.location.href);

if (url.searchParams.get("reset") === "1") {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("mesurer-layout-guides-contract") || key.startsWith("mesurer-plugin-settings")) {
      window.localStorage.removeItem(key);
    }
  }

  url.searchParams.delete("reset");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

const subject = mountMesurer({
  target: document.body,
  persistKey: "mesurer-layout-guides-contract",
  persistOnReload: true,
  isolate: true,
  topLayer: false,
  plugins: [context(), layoutGuides()],
});

await subject.ready;

const layoutGuidesService = await subject.service<MesurerLayoutGuidesService>(
  MESURER_LAYOUT_GUIDES_SERVICE_ID,
);

const service = () => layoutGuidesService;

type LayoutGuidesContractHarness = {
  subject: MountedMesurer;
  service(): MesurerLayoutGuidesService | undefined;
};

declare global {
  interface Window {
    __MESURER_LAYOUT_GUIDES_TEST__?: LayoutGuidesContractHarness;
  }
}

window.__MESURER_LAYOUT_GUIDES_TEST__ = { subject, service };
