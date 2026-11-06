import { mountMesurer, type MountMesurerOptions, type MesurerToolbarOptions } from "../../../packages/mesurer/src/index";

const params = new URLSearchParams(window.location.search);

const root = document.getElementById("root");

if (!root) throw new Error("Toolbar placement fixture root is missing.");

const POSITIONS = ["top-left", "top", "top-right", "bottom-left", "bottom", "bottom-right", "left", "right"] as const;

const DOCKS = ["free", "snap"] as const;

// The contract drives the public `toolbar` option through the query string; absent keys stay absent.
const toolbar: MesurerToolbarOptions = {};

const position = POSITIONS.find((name) => name === params.get("position"));

const dock = DOCKS.find((name) => name === params.get("dock"));

if (position) toolbar.position = position;

if (dock) toolbar.dock = dock;

if (params.has("draggable")) toolbar.draggable = params.get("draggable") === "true";

const options: MountMesurerOptions = {
  target: root,
  persistKey: "mesurer-toolbar-placement-contract",
  isolate: false,
  topLayer: false,
};

if (!params.has("none")) options.toolbar = toolbar;

declare global {
  interface Window {
    __TOOLBAR_READY__?: boolean;
  }
}

const mounted = mountMesurer(options);

await mounted.ready;

window.__TOOLBAR_READY__ = true;
