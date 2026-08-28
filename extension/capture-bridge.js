const PING = "mesurer:capture-bridge-ping";
const PONG = "mesurer:capture-bridge-pong";
const REQUEST = "mesurer:capture-bridge-request";
const RESPONSE = "mesurer:capture-bridge-response";
const CAPTURE = "mesurer:capture-visible";

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

if (!globalThis.__MESURER_CAPTURE_BRIDGE_INSTALLED__) {
  globalThis.__MESURER_CAPTURE_BRIDGE_INSTALLED__ = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    const pingId = parseMessage(event.data, PING);
    if (pingId) {
      window.postMessage(reply(PONG, pingId), window.location.origin);
      return;
    }

    const requestId = parseMessage(event.data, REQUEST);
    if (!requestId) return;
    chrome.runtime.sendMessage({ type: CAPTURE }, (response) => {
      const error = chrome.runtime.lastError?.message;
      if (error) {
        window.postMessage(reply(RESPONSE, requestId, `error:${error}`), window.location.origin);
        return;
      }
      const dataUrl = String(response?.dataUrl ?? "");
      const payload = response?.ok && dataUrl
        ? `ok:${dataUrl}`
        : `error:${String(response?.error ?? "Capture failed")}`;
      window.postMessage(reply(RESPONSE, requestId, payload), window.location.origin);
    });
  });
}
