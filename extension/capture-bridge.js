const PING = "mesurer:capture-bridge-ping";

const PONG = "mesurer:capture-bridge-pong";

const REQUEST = "mesurer:capture-bridge-request";

const RESPONSE = "mesurer:capture-bridge-response";

const CAPTURE = "mesurer:capture-visible";

const RECORDING_PING = "mesurer:recording-bridge-ping";

const RECORDING_PONG = "mesurer:recording-bridge-pong";

const RECORDING_REQUEST = "mesurer:recording-bridge-request";

const RECORDING_RESPONSE = "mesurer:recording-bridge-response";

const RECORDING_STREAM = "mesurer:recording-stream-id";

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

if (!globalThis.__MESURER_CAPTURE_BRIDGE_INSTALLED__) {
  globalThis.__MESURER_CAPTURE_BRIDGE_INSTALLED__ = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    const pingId = parseMessage(event.data, PING);

    if (pingId) {
      window.postMessage(reply(PONG, pingId), targetOrigin());

      return;
    }

    const recordingPingId = parseMessage(event.data, RECORDING_PING);

    if (recordingPingId) {
      window.postMessage(reply(RECORDING_PONG, recordingPingId), targetOrigin());

      return;
    }

    const recordingRequestId = parseMessage(event.data, RECORDING_REQUEST);

    if (recordingRequestId) {
      chrome.runtime.sendMessage({ type: RECORDING_STREAM }, (response) => {
        const error = chrome.runtime.lastError?.message;

        if (error) {
          window.postMessage(
            reply(RECORDING_RESPONSE, recordingRequestId, `error:${error}`),
            targetOrigin(),
          );

          return;
        }

        const streamId = String(response?.streamId ?? "");

        const payload = response?.ok && streamId
          ? `ok:${streamId}`
          : `error:${String(response?.error ?? "Tab capture unavailable")}`;

        window.postMessage(
          reply(RECORDING_RESPONSE, recordingRequestId, payload),
          targetOrigin(),
        );
      });

      return;
    }

    const requestId = parseMessage(event.data, REQUEST);

    if (!requestId) return;
    chrome.runtime.sendMessage({ type: CAPTURE }, (response) => {
      const error = chrome.runtime.lastError?.message;

      if (error) {
        window.postMessage(reply(RESPONSE, requestId, `error:${error}`), targetOrigin());

        return;
      }

      const dataUrl = String(response?.dataUrl ?? "");

      const payload = response?.ok && dataUrl
        ? `ok:${dataUrl}`
        : `error:${String(response?.error ?? "Capture failed")}`;

      window.postMessage(reply(RESPONSE, requestId, payload), targetOrigin());
    });
  });
}
