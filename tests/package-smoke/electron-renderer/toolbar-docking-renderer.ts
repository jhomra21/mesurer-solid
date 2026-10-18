import { mountMesurer } from "mesurer-solid";

const topology = new URL(location.href).searchParams.get("topology");

if (topology !== "framed") Object.assign(window, {
  __MESURER_HOST__: { windowControls: { visible: topology === "controls", bounds: { x: 0, y: 0, width: 90, height: 42 } } },
});

const subject = mountMesurer({ isolate: false, persistKey: "electron-toolbar-docking" });

await subject.ready;

Object.assign(window, { dockingSubject: subject, dockingReady: true });
