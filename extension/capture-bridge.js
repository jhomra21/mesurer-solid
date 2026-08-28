const PING = "mesurer:capture-bridge-ping";
const PONG = "mesurer:capture-bridge-pong";
const REQUEST = "mesurer:capture-bridge-request";
const RESPONSE = "mesurer:capture-bridge-response";
const CAPTURE = "mesurer:capture-visible";

if (!globalThis.__MESURER_CAPTURE_BRIDGE_INSTALLED__) {
  globalThis.__MESURER_CAPTURE_BRIDGE_INSTALLED__ = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === PING && typeof data.id === "string") {
      window.postMessage({ type: PONG, id: data.id }, window.location.origin);
      return;
    }

    if (data.type !== REQUEST || typeof data.id !== "string") return;
    const id = data.id;
    chrome.runtime.sendMessage({ type: CAPTURE }, (response) => {
      const error = chrome.runtime.lastError?.message;
      if (error) {
        window.postMessage({ type: RESPONSE, id, ok: false, error }, window.location.origin);
        return;
      }
      window.postMessage(
        response?.ok && typeof response.dataUrl === "string"
          ? { type: RESPONSE, id, ok: true, dataUrl: response.dataUrl }
          : { type: RESPONSE, id, ok: false, error: response?.error ?? "Capture failed" },
        window.location.origin,
      );
    });
  });
}
