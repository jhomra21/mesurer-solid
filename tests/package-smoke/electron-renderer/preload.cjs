const { contextBridge, ipcRenderer } = require("electron");

const PING = "mesurer:capture-bridge-ping";

const PONG = "mesurer:capture-bridge-pong";

const REQUEST = "mesurer:capture-bridge-request";

const RESPONSE = "mesurer:capture-bridge-response";

const parseMessage = (value, type) => {
  const message = String(value ?? "");
  const prefix = `${type}:`;

  if (!message.startsWith(prefix)) return "";
  const body = message.slice(prefix.length);
  const separator = body.indexOf(":");

  return separator < 0 ? body : body.slice(0, separator);
};

const reply = (type, id, payload = "") =>
  `${type}:${id}:${payload}`;

const targetOrigin = () =>
  window.location.origin === "null"
    ? "*"
    : window.location.origin;

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;

  const pingId = parseMessage(event.data, PING);

  if (pingId) {
    window.postMessage(reply(PONG, pingId), targetOrigin());

    return;
  }

  const requestId = parseMessage(event.data, REQUEST);

  if (!requestId) return;

  void ipcRenderer.invoke("mesurer:capture-window")
    .then((capture) => {
      const png = Buffer.from(capture.png);
      const dataUrl = `data:image/png;base64,${png.toString("base64")}`;

      window.postMessage(
        reply(RESPONSE, requestId, `ok:${dataUrl}`),
        window.location.origin,
      );
    })
    .catch((error) => {
      window.postMessage(
        reply(RESPONSE, requestId, `error:${String(error?.message ?? error)}`),
        window.location.origin,
      );
    });
});

contextBridge.exposeInMainWorld("electronMesurer", {
  complete: (payload) => ipcRenderer.invoke("mesurer:test-complete", payload),
});
